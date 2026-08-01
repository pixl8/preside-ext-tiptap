/**
 * PresideRichEditor facade (Tiptap-backed).
 *
 * Loaded AFTER the core presidecore bundle so it overwrites the window.PresideRichEditor
 * that core's preside.richeditor.js defines. Executes at script-load time, before
 * formFields.js binds `$('textarea.richeditor').each(new PresideRichEditor(this))`
 * on DOM-ready, so this implementation is the one that runs.
 *
 * Preserves the Preside-facing contract:
 *   - constructor( textareaEl ); instance exposed on `.editor`
 *   - CKEDITOR.instances[name] registry (getData/setData/initialdata) - used by
 *     serialize-object (AJAX submit), dirtyforms, quick-add reset, frontend version restore
 *   - $textarea.data('ckeditorinstance') with getData() - used by jquery.validate
 *   - instance API: getData/setData/on/fire/focus/destroy/execCommand/commands
 *   - custom CKEditor config files (settings.ckeditor.defaults.configFile /
 *     per-field customConfig) are loaded and honoured - see customConfig.js
 */
import { buildToolbar } from "./toolbar.js";
import { tokenize, detokenize } from "./tokens.js";
import { applyContentStyles } from "./presideStyles.js";
import { normalizeOutput } from "./normalize.js";
import { createPasteTransform } from "./pasteFilter.js";
import { getCustomConfig, prefetchCustomConfig } from "./customConfig.js";
import { applyTheme, renderThemeToggle } from "./theme.js";
import { toggleMaximize, exitMaximize, isMaximized } from "./maximize.js";
import { createOutline, outlineEnabled } from "./outline.js";
import { imageToolsEnabled } from "./imageTools.js";
import { createTableTools, tableToolsEnabled } from "./tableTools.js";
import { createSlashMenu, slashMenuEnabled } from "./slashMenu.js";
import { createDragHandle, dragHandleEnabled } from "./dragHandle.js";
import { fitFrontendEditor } from "./frontendFit.js";
import { resolveInlineMount } from "./inlineMode.js";
import { initEditModeSwitch } from "./editModeSwitch.js";
import { createSelectionBubble } from "./selectionBubble.js";
import { t } from "./i18n.js";

( function() {
	"use strict";

	var $ = window.presideJQuery || window.jQuery;
	var T = window.PresideTiptap;

	// ---- Minimal CKEDITOR global shim -------------------------------------
	// Non-editor consumers still reference window.CKEDITOR. We provide only what
	// they touch; the full editor lives on each instance, not on this global.
	var CK = window.CKEDITOR = window.CKEDITOR || {};
	CK.instances = CK.instances || {};
	CK.CTRL  = CK.CTRL  || 0x110000;
	CK.SHIFT = CK.SHIFT || 0x220000;
	CK.ALT   = CK.ALT   || 0x440000;
	CK.ENTER_P = 1; CK.ENTER_BR = 2; CK.ENTER_DIV = 3;
	// preside.iframe.modal.js (nested picker modals: the widget/image "+" add and
	// edit-pencil buttons) reads `parent.CKEDITOR.document.$`, expecting the native
	// document (real CKEditor exposes it as `CKEDITOR.dom.document.$`). Without it,
	// PresideIframeModal.open() throws after building the modal but before showing
	// it, so the nested dialog never appears.
	if ( !CK.document ) { CK.document = { $: document }; }
	if ( typeof CK.on !== "function" ) { CK.on = function() {}; }

	function cfreq() { return window.cfrequest || {}; }

	// ---- Config assembly (mirror of core preside.richeditor.js) -----------

	// enterMode arrives as a string ("br"/"div") from the data attribute, or as
	// a numeric CKEDITOR.ENTER_* constant when set by a custom config file.
	function normaliseEnterMode( v ) {
		if ( v === CK.ENTER_BR  ) { return "br"; }
		if ( v === CK.ENTER_DIV ) { return "div"; }
		if ( v === CK.ENTER_P   ) { return "p"; }
		return String( v || "" ).toLowerCase();
	}

	// contentsCss may be a single URL or an array of URLs in a config file;
	// Preside's stylesheets value is a comma list.
	function contentsCssToCsv( v ) {
		if ( !v ) { return ""; }
		return Array.isArray( v ) ? v.join( "," ) : String( v );
	}

	function readConfig( ta ) {
		var $ta = $( ta ), cf = cfreq();

		// The custom CKEditor config file (per-field customConfig attr, falling
		// back to settings.ckeditor.defaults.configFile via cfrequest.ckeditorConfig)
		// supplies BASE values that anything set per-instance overrides - exactly
		// CKEditor's precedence (file config < CKEDITOR.replace() config).
		var fileCfg = getCustomConfig( $ta.data( "customConfig" ) || cf.ckeditorConfig );

		// settings.ckeditor.defaults.defaultConfigs merged with the form control's
		// customDefaultConfigs arg (data-custom-default-configs, JSON - jQuery
		// .data() parses it), exactly like core preside.richeditor.js - both
		// layered over the config file's values.
		var defaultConfigs = $.extend( {}, fileCfg, cf.ckeditorDefaultConfigs || {}, $ta.data( "customDefaultConfigs" ) || {} );

		return {
			  placeholder        : $ta.attr( "placeholder" )          || cf.ckeditorDefaultPlaceholder || fileCfg.editorplaceholder || ""
			, toolbar            : $ta.data( "toolbar" )              || cf.ckeditorDefaultToolbar     || fileCfg.toolbar           || ""
			, width              : $ta.data( "width" )                || cf.ckeditorDefaultWidth       || fileCfg.width
			, minHeight          : $ta.data( "minHeight" )            || cf.ckeditorDefaultMinHeight   || fileCfg.autoGrow_minHeight
			, maxHeight          : $ta.data( "maxHeight" )            || cf.ckeditorDefaultMaxHeight   || fileCfg.autoGrow_maxHeight
			, stylesheets        : $ta.data( "stylesheets" )          || contentsCssToCsv( fileCfg.contentsCss )
			, enterMode          : normaliseEnterMode( $ta.data( "enterMode" ) || fileCfg.enterMode )
			, widgetCategories   : $ta.data( "widgetCategories" )     || cf.widgetCategories   || ""
			, linkPickerCategory : $ta.data( "linkPickerCategory" )   || cf.linkPickerCategory || ""
			, autoParagraph      : $ta.data( "autoParagraph" ) !== undefined ? $ta.data( "autoParagraph" )
			                     : ( cf.ckeditorAutoParagraph !== undefined ? cf.ckeditorAutoParagraph : fileCfg.autoParagraph )
			, defaultConfigs     : defaultConfigs
		};
	}

	// ---- Compat instance: CKEditor-shaped API over a Tiptap editor --------
	function CompatInstance( name, tiptap, cfg, textarea, container ) {
		this.name        = name;
		this._t          = tiptap;
		this.config      = cfg || {};
		this.mode        = "wysiwyg";
		// frontendEditors.js reads commands.maximize.state to un-maximize before
		// teardown; derive it from the DOM so it stays right no matter who toggled
		// (toolbar button, alt+enter, execCommand).
		this.commands    = { maximize: {} };
		Object.defineProperty( this.commands.maximize, "state", {
			  get : function() { return isMaximized( container ) ? 1 : 0; }
			, set : function() {}
		} );
		this._el         = textarea;
		this._container  = container;
		this._handlers   = {};
		this.initialdata = "";

		var self = this;
		tiptap.on( "update", function() {
			self._sync();
			self._emit( "change" );
		} );
	}
	CompatInstance.prototype.getData = function() {
		return normalizeOutput( tokenize( this._t.getHTML() ), {
			  autoParagraph: this.config.autoParagraph
			, enterMode    : this.config.enterMode
		} );
	};
	CompatInstance.prototype.setData = function( html ) {
		this._t.commands.setContent( detokenize( html || "" ), { emitUpdate: false } );
		this._sync();
	};
	CompatInstance.prototype._sync = function() {
		if ( this._el ) { this._el.value = this.getData(); }
	};
	CompatInstance.prototype.on = function( evt, fn ) {
		( this._handlers[ evt ] = this._handlers[ evt ] || [] ).push( fn );

		var self = this;
		if ( evt === "key" ) {
			// CKEditor ORs modifier masks into keyCode - consumers test e.g.
			// `13 + CKEDITOR.CTRL` for ctrl+enter (frontendEditors save-draft /
			// alt+enter maximize) - and a handler returning false cancels the
			// keystroke (real CKEditor's event.cancel()).
			var listener = function( e ) {
				var code = e.keyCode
					+ ( ( e.ctrlKey || e.metaKey ) ? CK.CTRL  : 0 )
					+ ( e.shiftKey                 ? CK.SHIFT : 0 )
					+ ( e.altKey                   ? CK.ALT   : 0 );
				var result = fn( { editor: self, data: { keyCode: code, domEvent: e } } );
				if ( result === false ) {
					e.preventDefault();
					e.stopPropagation();
				}
			};
			this._t.view.dom.addEventListener( "keydown", listener );
			( this._domListeners = this._domListeners || [] ).push( [ "keydown", listener ] );
		}
		return this;
	};
	CompatInstance.prototype._emit = function( evt, data ) {
		var hs = this._handlers[ evt ] || [];
		for ( var i = 0; i < hs.length; i++ ) {
			hs[ i ]( { editor: this, data: data || {} } );
		}
	};
	CompatInstance.prototype.fire = function( evt, data ) { this._emit( evt, data ); };
	CompatInstance.prototype.focus = function() { this._t.commands.focus(); };
	CompatInstance.prototype.getSelection = function() { return null; }; // TODO Phase 2
	// Mirrors real CKEditor's destroy(): tear down the editor DOM and restore the
	// textarea so a later `new PresideRichEditor()` on the same element starts
	// clean (frontend editors create/destroy on every edit-mode toggle).
	CompatInstance.prototype.destroy = function() {
		try {
			if ( this._domListeners && this._t.view && this._t.view.dom ) {
				var dom = this._t.view.dom;
				this._domListeners.forEach( function( l ) { dom.removeEventListener( l[ 0 ], l[ 1 ] ); } );
			}
		} catch ( e ) {}
		this._domListeners = null;
		// Chrome that registered document/window listeners or wrote onto DOM outside
		// our container (frontendFit) hands back a teardown - run them before the
		// container goes, so nothing outlives the editor.
		if ( this._cleanups ) {
			this._cleanups.forEach( function( fn ) { try { fn(); } catch ( e ) {} } );
			this._cleanups = null;
		}
		try { this._t.destroy(); } catch ( e ) {}
		// Destroying while maximized would leave <html> scroll-locked and the
		// restore placeholder orphaned in the page.
		if ( this._container ) { exitMaximize( this._container ); }
		if ( this._container && this._container.parentNode ) {
			this._container.parentNode.removeChild( this._container );
		}
		this._container = null;
		if ( this._el ) {
			this._el.style.display = "";
			this._el.removeAttribute( "data-tiptap-mounted" );
			$( this._el ).removeData( "ckeditorinstance" );
		}
		if ( this.name && CK.instances[ this.name ] === this ) { delete CK.instances[ this.name ]; }
	};
	CompatInstance.prototype.execCommand = function( name ) {
		if ( name === "maximize" ) {
			var container = this._container || this._t.view.dom.closest( ".tiptap-editor-container" );
			if ( container ) { toggleMaximize( container, this._t ); }
		}
	};

	// ---- The facade -------------------------------------------------------
	function PresideRichEditor( elementToReplace ) {
		this.init( elementToReplace );
	}

	PresideRichEditor.prototype.init = function( ta ) {
		var $ta  = $( ta );
		var name = ta.getAttribute( "name" ) || ta.id || "";
		var cfg  = readConfig( ta );

		// DOM: hide the textarea (kept for native form submit), mount editor after it.
		var container = document.createElement( "div" );
		container.className = "tiptap-editor-container";

		// Modern inline mode (frontend only): inlineMode.js marked the textarea
		// before triggering core's edit flow. The editor mounts chrome-less INSIDE
		// the page, exactly where the rendered content was (between the region's
		// comment delimiters) - no toolbar/footer/outline, no height caps, and the
		// selection bubble instead of a fixed toolbar. resolveInlineMount() returns
		// null on any mismatch, in which case this is an ordinary mount - fail safe.
		var inlineId    = ta.getAttribute( "data-tiptap-inline" ) || "";
		var inlineMount = inlineId ? resolveInlineMount( inlineId, container ) : null;
		var isInline    = !!inlineMount;
		if ( isInline ) { container.className += " tiptap-inline"; }

		var toolbarEl = document.createElement( "div" );
		toolbarEl.className = "tiptap-toolbar";
		var mount = document.createElement( "div" );
		mount.className = "tiptap-editor-mount";
		if ( !isInline ) { container.appendChild( toolbarEl ); }
		container.appendChild( mount );

		// Honour the user's stored light/dark preference from the first paint (the
		// toolbar's toggle then flips it for every editor on the page - see theme.js).
		// Inline editors stay light: the editable IS the site page.
		if ( !isInline ) { applyTheme( container ); }

		ta.style.display = "none";
		ta.setAttribute( "data-tiptap-mounted", "1" );
		if ( isInline ) {
			inlineMount.anchor.parentNode.insertBefore( container, inlineMount.anchor.nextSibling );
		} else {
			ta.parentNode.insertBefore( container, ta.nextSibling );
		}

		// CKEditor's editable lived in an iframe, so keystrokes never reached the
		// admin document. Tiptap edits inline, and Preside's admin hotkeys
		// (preside.hotkeys.js) fail to detect a focused contenteditable as "typing"
		// (jQuery .prop('contenteditable') misses the camelCase DOM property) - so
		// e.g. typing "e" toggles quick-edit. Reproduce the iframe isolation: let
		// everything inside the editor (ProseMirror, our key bridge, the source
		// textarea) handle keys, then stop them bubbling to the admin page.
		[ "keydown", "keypress", "keyup" ].forEach( function( evt ) {
			container.addEventListener( evt, function( e ) { e.stopPropagation(); } );
		} );

		// min/maxHeight can legitimately arrive as the string "auto" - that is what
		// ckEditorJs.cfm sends when settings.ckeditor.defaults leaves them unset -
		// so only apply a numeric value. `parseInt( "auto" ) || 0` would set
		// max-height:0px and collapse the editable entirely.
		var minHeight = parseInt( cfg.minHeight, 10 );
		var maxHeight = parseInt( cfg.maxHeight, 10 );
		// Inline: the PAGE is the scroller and the content owns its own size -
		// height caps and a fixed width belong to the boxed editor only.
		if ( !isInline ) {
			if ( minHeight > 0 ) { mount.style.minHeight = minHeight + "px"; }
			if ( maxHeight > 0 ) { mount.style.maxHeight = maxHeight + "px"; mount.style.overflowY = "auto"; }
			if ( cfg.width && cfg.width !== "auto" ) {
				container.style.width = String( cfg.width ).match( /^\d+$/ ) ? cfg.width + "px" : cfg.width;
			}
		}

		// disallowedContent / pasteFromWordDisallow filtering (core applies these
		// via CKEDITOR.filter on paste - see preside.richeditor.js).
		var pasteTransform = createPasteTransform( cfg.defaultConfigs );

		var self   = this;
		var tiptap = new T.Editor( {
			  element    : mount
			, extensions : this.buildExtensions( cfg )
			, content    : detokenize( ta.value || "" )
			, editorProps: pasteTransform ? { transformPastedHTML: pasteTransform } : {}
		} );

		// jquery.validate delegates focusin/focusout/keyup on a selector that
		// includes `[contenteditable]`, and its handler reads `this.form` before any
		// ignore check (jquery.validate.js). CKEditor's editable lived in an iframe so
		// those events never reached the host form; Tiptap's editable is inline, and a
		// bare contenteditable div has no `.form`, so the delegate does
		// `$.data( undefined, "validator" )` -> throws on every focus/keystroke. Point
		// the editable at the host form (as form-associated elements natively are) so
		// the validator resolves. jquery.validate has explicit contenteditable support
		// and no-ops on our nameless editable.
		try { if ( tiptap.view && tiptap.view.dom ) { tiptap.view.dom.form = ta.form || null; } } catch ( e ) {}

		var instance = new CompatInstance( name, tiptap, cfg, ta, container );
		instance.initialdata = instance.getData();
		ta.value = instance.initialdata;

		// Toolbar: a config file may set config.toolbar to a CKEditor array
		// directly, and a bare toolbar NAME that reached the client unresolved
		// (i.e. not defined in settings.ckeditor.toolbars, which the server
		// resolves before rendering data-toolbar) is looked up against the config
		// file's `config.toolbar_<name>` definitions - CKEditor's named-toolbar
		// semantics.
		var parsedToolbar = Array.isArray( cfg.toolbar ) ? cfg.toolbar : this.parseToolbarConfig( cfg.toolbar );
		if ( typeof parsedToolbar === "string" && Array.isArray( cfg.defaultConfigs[ "toolbar_" + parsedToolbar ] ) ) {
			parsedToolbar = cfg.defaultConfigs[ "toolbar_" + parsedToolbar ];
		}
		var bubbleCleanup = null;
		if ( isInline ) {
			// No persistent toolbar: the selection bubble offers the same buttons
			// (same renderers - see selectionBubble.js), filtered per block.
			bubbleCleanup = createSelectionBubble( tiptap, container, parsedToolbar, cfg );
		} else {
			// Built BEFORE the footer: it reports whether a toolbar config placed the
			// light/dark toggle explicitly, which decides where the toggle ends up.
			var toolbarInfo = buildToolbar( toolbarEl, tiptap, parsedToolbar, cfg );

			// Footer status bar: word / char counts + estimated reading time, with the
			// light/dark toggle right-aligned on the same row.
			// Opt out per-site/per-field with defaultConfigs.wordcount = false.
			var wantsTheme = toolbarInfo.themeEnabled && !toolbarInfo.themeRendered;
			if ( cfg.defaultConfigs.wordcount !== false ) {
				container.appendChild( buildFooter( tiptap, wantsTheme ) );
			} else if ( wantsTheme ) {
				// No footer to host it - fall back to the far right of the toolbar.
				var right = document.createElement( "span" );
				right.className = "tiptap-toolbar-group tiptap-toolbar-right";
				right.appendChild( renderThemeToggle() );
				toolbarEl.appendChild( right );
			}
		}

		// Document outline navigator: a hover-expanding rail of heading markers on
		// the right edge of the container (chrome only - see src/outline.js).
		// Inline (Modern) it pins to the right edge of the VIEWPORT instead - the
		// page is the scroller there, so the rail must not scroll away with it.
		// Opt out per-site/per-field with defaultConfigs.outline = false.
		if ( outlineEnabled( cfg ) ) {
			container.appendChild( createOutline( tiptap, mount, { fixed: isInline } ) );
		}

		// Table bubble toolbar: row/column/cell controls over the table the caret
		// is in (chrome only - see src/tableTools.js).
		// Opt out per-site/per-field with defaultConfigs.tableTools = false.
		if ( tableToolsEnabled( cfg ) ) {
			createTableTools( tiptap, container, mount );
		}

		// Block drag handle: hover a block to get a grip in the left gutter
		// (chrome only - see src/dragHandle.js).
		// Opt out per-site/per-field with defaultConfigs.dragHandle = false.
		// The "+" only types a "/" for the author, so it is rendered only when the
		// slash menu is actually there to react to it.
		// Inline (Modern) editors get the FIXED variant: the container sits in the
		// site's page flow, where a gutter carved out of the theme's layout is one
		// overflow:hidden ancestor away from being clipped into invisibility.
		if ( dragHandleEnabled( cfg ) ) {
			createDragHandle( tiptap, container, mount, slashMenuEnabled( cfg ), { fixed: isInline } );
		}

		// contentsCss / stylesheets: load the app content CSS, scoped to the editor.
		// Not inline: the editable sits in the real page and inherits the site's
		// CSS directly - injecting the admin-configured content CSS again would
		// double-apply or fight it.
		if ( !isInline ) { applyContentStyles( cfg.stylesheets ); }

		// Teardown registry, run FIRST in destroy() - everything here wrote outside
		// the container (CSS vars on <html>, body-portalled elements, the inline
		// mount's original page nodes), so it must not outlive the editor.
		// fitFrontendEditor no-ops (null) outside core's modal wrapper.
		instance._cleanups = [
			  fitFrontendEditor( container )
			, isInline ? inlineMount.cleanup : null
			, bubbleCleanup
		].filter( Boolean );

		if ( name ) { CK.instances[ name ] = instance; }
		$ta.data( "ckeditorinstance", instance );

		this.editor = instance;

		// instanceReady fires async so callers (e.g. frontendEditors) can attach
		// first. Guarded: a frontend editor can legitimately be destroyed within
		// the same tick it was created (Modern mode's save -> re-enter churn), and
		// consumers' instanceReady handlers call getData() on a live editor.
		setTimeout( function() { if ( !tiptap.isDestroyed ) { instance.fire( "instanceReady" ); } }, 0 );
	};

	PresideRichEditor.prototype.buildExtensions = function( cfg ) {
		// Disable StarterKit's own link mark - PresideLink owns link serialization.
		var exts = [ T.StarterKit.configure( { link: false } ) ];
		var ext  = T.extensions || {};

		// Preserve class/style on blocks + spans (fidelity + class-based content CSS).
		if ( ext.createPresideAttributes )  { exts.push( ext.createPresideAttributes() ); }
		if ( ext.createPresideInlineStyle ) { exts.push( ext.createPresideInlineStyle() ); }

		if ( ext.createPresideLink ) {
			exts.push( ext.createPresideLink( {
				  $                 : $
				, buildAdminLink    : window.buildAdminLink
				, linkPickerCategory: cfg.linkPickerCategory
			} ) );
		}
		if ( ext.createPresideAnchor ) { exts.push( ext.createPresideAnchor() ); }

		var embedDeps = {
			  buildAdminLink    : window.buildAdminLink
			, buildAjaxLink     : window.buildAjaxLink
			, widgetCategories  : cfg.widgetCategories
			, linkPickerCategory: cfg.linkPickerCategory
			// Drag-to-resize + alignment chrome on embedded images
			// (defaultConfigs.imageTools = false opts a site/field out).
			, imageTools        : imageToolsEnabled( cfg )
		};
		if ( ext.createPresideImage )      { exts.push( ext.createPresideImage( embedDeps ) ); }
		if ( ext.createPresideAttachment ) { exts.push( ext.createPresideAttachment( embedDeps ) ); }
		if ( ext.createPresideWidget )     { exts.push( ext.createPresideWidget( embedDeps ) ); }

		// The "/" insert menu. Registered as an extension (it is a ProseMirror
		// plugin, unlike the other chrome), so it has to be built here rather than
		// appended to the container after mount.
		// Opt out per-site/per-field with defaultConfigs.slashMenu = false.
		if ( slashMenuEnabled( cfg ) && T.Suggestion && T.Extension ) {
			exts.push( createSlashMenu( T, cfg ) );
		}

		// Phase 4: wider toolbar support (subscript/superscript/text-align/table/placeholder)
		if ( ext.buildRichText ) {
			ext.buildRichText( { placeholder: cfg.placeholder } ).forEach( function( e ) { exts.push( e ); } );
		}

		// enterMode=br: Enter inserts <br> instead of a new paragraph (CKEditor's
		// ENTER_BR). Lists/code blocks keep their native Enter behaviour.
		if ( cfg.enterMode === "br" && T.Extension ) {
			exts.push( T.Extension.create( {
				  name    : "presideEnterBr"
				, priority: 1000
				, addKeyboardShortcuts: function() {
					return {
						Enter: function( args ) {
							var editor = args.editor;
							if ( editor.isActive( "listItem" ) || editor.isActive( "codeBlock" ) ) { return false; }
							return editor.commands.setHardBreak();
						}
					};
				}
			} ) );
		}

		return exts;
	};

	// ---- Footer status bar --------------------------------------------------
	// Words / chars / estimated reading time, refreshed on every doc change
	// ("transaction" rather than "update" so programmatic setData( emitUpdate:
	// false ) refreshes it too).
	var READING_WORDS_PER_MINUTE = 225;

	function buildFooter( tiptap, withThemeToggle ) {
		var footer = document.createElement( "div" );
		footer.className = "tiptap-footer";

		var wordsEl   = document.createElement( "span" );
		var charsEl   = document.createElement( "span" );
		var readingEl = document.createElement( "span" );
		wordsEl.className   = "tiptap-footer-words";
		charsEl.className   = "tiptap-footer-chars";
		readingEl.className = "tiptap-footer-reading";
		footer.appendChild( wordsEl );
		footer.appendChild( charsEl );
		footer.appendChild( readingEl );

		// Right-aligned (margin-left:auto in the css) light/dark toggle.
		if ( withThemeToggle ) {
			var themeWrap = document.createElement( "span" );
			themeWrap.className = "tiptap-footer-right";
			themeWrap.appendChild( renderThemeToggle() );
			footer.appendChild( themeWrap );
		}

		function refresh() {
			var doc   = tiptap.state.doc;
			var text  = doc.textBetween( 0, doc.content.size, " ", " " ).trim();
			var words = text.length ? text.split( /\s+/ ).length : 0;
			var mins  = Math.max( 1, Math.ceil( words / READING_WORDS_PER_MINUTE ) );

			wordsEl.textContent   = t( "footer.words", { count: words } );
			charsEl.textContent   = t( "footer.chars", { count: text.length } );
			readingEl.textContent = t( "footer.readingtime", { count: mins } );
		}

		tiptap.on( "transaction", function( args ) {
			if ( !args || !args.transaction || args.transaction.docChanged ) { refresh(); }
		} );
		refresh();

		return footer;
	}

	// Ported verbatim from core preside.richeditor.js.
	PresideRichEditor.prototype.parseToolbarConfig = function( rawToolbarText ) {
		rawToolbarText = rawToolbarText || "";

		var bars = rawToolbarText.split( "|" )
		  , barCount = bars.length
		  , toolbar = []
		  , buttons, bar, i, n;

		if ( rawToolbarText.match( /[\,\|]/g ) === null ) {
			return rawToolbarText;
		}

		for ( i = 0; i < barCount; i++ ) {
			if ( !$.trim( bars[ i ] ).length || bars[ i ] === "/" ) {
				toolbar.push( "/" );
				continue;
			}
			buttons = bars[ i ].split( "," );
			bar = { name: i, items: [] };
			for ( n = 0; n < buttons.length; n++ ) {
				bar.items.push( buttons[ n ] );
			}
			toolbar.push( bar );
		}
		return toolbar;
	};

	window.PresideRichEditor = PresideRichEditor;

	// ---- Bootstrap --------------------------------------------------------
	// presidecore's formFields.js runs `new PresideRichEditor(this)` on every
	// `textarea.richeditor` synchronously at parse time - BEFORE this facade
	// loads - using the CKEditor implementation, which the pre-presidecore
	// CKEDITOR shim turns into a DOM-less no-op. So the textareas are still
	// pristine here. Mount Tiptap on them now, guarding against double-init.
	function bootstrapRichEditors( root ) {
		var scope = ( root && root.querySelectorAll ) ? root : document;
		var tas   = scope.querySelectorAll( "textarea.richeditor:not(.frontend-container)" );
		for ( var i = 0; i < tas.length; i++ ) {
			var ta = tas[ i ];
			if ( ta.getAttribute( "data-tiptap-mounted" ) === "1" ) { continue; }
			ta.setAttribute( "data-tiptap-mounted", "1" );
			try {
				new PresideRichEditor( ta );
			} catch ( e ) {
				ta.removeAttribute( "data-tiptap-mounted" );
				if ( window.console ) { window.console.error( "[tiptap] mount failed", e ); }
			}
		}
	}
	// Expose so AJAX-loaded forms (quick-add modals etc.) can re-scan their content.
	PresideRichEditor.bootstrap = bootstrapRichEditors;

	// Warm the custom-config-file cache as early as possible so editor mounts
	// (DOM-ready) resolve it without getCustomConfig's blocking-XHR fallback.
	prefetchCustomConfig( cfreq().ckeditorConfig );

	// The frontend edit-mode dropdown (Off/Classic/Modern) composes on top of
	// core's parse-time frontendEditors.js wiring, so it must wait for
	// DOMContentLoaded even when this bundle executes late. No-ops in the admin.
	function initChrome() {
		bootstrapRichEditors( document );
		try { initEditModeSwitch(); } catch ( e ) {
			if ( window.console ) { window.console.error( "[tiptap] edit-mode switch failed", e ); }
		}
	}

	if ( document.readyState === "loading" ) {
		document.addEventListener( "DOMContentLoaded", initChrome );
	} else {
		initChrome();
	}
} )();
