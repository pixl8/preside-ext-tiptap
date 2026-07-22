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
 *
 * PHASE 0/1 skeleton: StarterKit editing + save/load round-trip + registry hooks
 * + basic toolbar. Token nodes/marks and the picker iframe shim land in later phases.
 */
import { buildToolbar } from "./toolbar.js";
import { tokenize, detokenize } from "./tokens.js";
import { applyContentStyles } from "./presideStyles.js";
import { normalizeOutput } from "./normalize.js";

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
	function readConfig( ta ) {
		var $ta = $( ta ), cf = cfreq();
		return {
			  placeholder        : $ta.attr( "placeholder" )          || cf.ckeditorDefaultPlaceholder || ""
			, toolbar            : $ta.data( "toolbar" )              || cf.ckeditorDefaultToolbar     || ""
			, width              : $ta.data( "width" )                || cf.ckeditorDefaultWidth
			, minHeight          : $ta.data( "minHeight" )            || cf.ckeditorDefaultMinHeight
			, maxHeight          : $ta.data( "maxHeight" )            || cf.ckeditorDefaultMaxHeight
			, stylesheets        : $ta.data( "stylesheets" )
			, enterMode          : $ta.data( "enterMode" )
			, widgetCategories   : $ta.data( "widgetCategories" )     || cf.widgetCategories   || ""
			, linkPickerCategory : $ta.data( "linkPickerCategory" )   || cf.linkPickerCategory || ""
			, autoParagraph      : $ta.data( "autoParagraph" ) !== undefined ? $ta.data( "autoParagraph" ) : cf.ckeditorAutoParagraph
		};
	}

	// ---- Compat instance: CKEditor-shaped API over a Tiptap editor --------
	function CompatInstance( name, tiptap, cfg, textarea ) {
		this.name        = name;
		this._t          = tiptap;
		this.config      = cfg || {};
		this.mode        = "wysiwyg";
		this.commands    = { maximize: { state: 0 } };
		this._el         = textarea;
		this._handlers   = {};
		this.initialdata = "";

		var self = this;
		tiptap.on( "update", function() {
			self._sync();
			self._emit( "change" );
		} );
	}
	CompatInstance.prototype.getData = function() {
		return normalizeOutput( tokenize( this._t.getHTML() ) );
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
			this._t.view.dom.addEventListener( "keydown", function( e ) {
				fn( { editor: self, data: { keyCode: e.keyCode, domEvent: e } } );
			} );
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
	CompatInstance.prototype.destroy = function() {
		try { this._t.destroy(); } catch ( e ) {}
		if ( this.name && CK.instances[ this.name ] === this ) { delete CK.instances[ this.name ]; }
	};
	CompatInstance.prototype.execCommand = function( name ) {
		if ( name === "maximize" ) {
			var container = this._t.view.dom.closest( ".tiptap-editor-container" );
			if ( container ) {
				var max = container.classList.toggle( "is-maximized" );
				this.commands.maximize.state = max ? 1 : 0;
			}
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
		var toolbarEl = document.createElement( "div" );
		toolbarEl.className = "tiptap-toolbar";
		var mount = document.createElement( "div" );
		mount.className = "tiptap-editor-mount";
		container.appendChild( toolbarEl );
		container.appendChild( mount );

		ta.style.display = "none";
		ta.parentNode.insertBefore( container, ta.nextSibling );

		if ( cfg.minHeight ) { mount.style.minHeight = ( parseInt( cfg.minHeight, 10 ) || 0 ) + "px"; }
		if ( cfg.maxHeight ) { mount.style.maxHeight = ( parseInt( cfg.maxHeight, 10 ) || 0 ) + "px"; mount.style.overflowY = "auto"; }

		var self   = this;
		var tiptap = new T.Editor( {
			  element    : mount
			, extensions : this.buildExtensions( cfg )
			, content    : detokenize( ta.value || "" )
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

		var instance = new CompatInstance( name, tiptap, cfg, ta );
		instance.initialdata = instance.getData();
		ta.value = instance.initialdata;

		buildToolbar( toolbarEl, tiptap, this.parseToolbarConfig( cfg.toolbar ), cfg );

		// contentsCss / stylesheets: load the app content CSS, scoped to the editor.
		applyContentStyles( cfg.stylesheets );

		if ( name ) { CK.instances[ name ] = instance; }
		$ta.data( "ckeditorinstance", instance );

		this.editor = instance;

		// instanceReady fires async so callers (e.g. frontendEditors) can attach first.
		setTimeout( function() { instance.fire( "instanceReady" ); }, 0 );
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
		};
		if ( ext.createPresideImage )      { exts.push( ext.createPresideImage( embedDeps ) ); }
		if ( ext.createPresideAttachment ) { exts.push( ext.createPresideAttachment( embedDeps ) ); }
		if ( ext.createPresideWidget )     { exts.push( ext.createPresideWidget( embedDeps ) ); }

		// Phase 4: wider toolbar support (subscript/superscript/text-align/table/placeholder)
		if ( ext.buildRichText ) {
			ext.buildRichText( { placeholder: cfg.placeholder } ).forEach( function( e ) { exts.push( e ); } );
		}

		return exts;
	};

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

	if ( document.readyState === "loading" ) {
		document.addEventListener( "DOMContentLoaded", function() { bootstrapRichEditors( document ); } );
	} else {
		bootstrapRichEditors( document );
	}
} )();
