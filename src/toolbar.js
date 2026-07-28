/**
 * Toolbar rendering + CKEditor-button-name -> Tiptap-command mapping.
 *
 * Preside toolbars are pipe/comma strings of CKEditor button names (parsed by the
 * facade's parseToolbarConfig). We map the names Preside uses to Tiptap commands.
 * Names with no analogue are skipped gracefully. "Format" renders a block-format
 * dropdown; "Source" toggles a raw-token view. Preside-specific buttons
 * (Widgets/ImagePicker/AttachmentPicker/PresideLink/Unlink) are registered by
 * their extensions' commands.
 */
import { tokenize, detokenize } from "./tokens.js";
import { ICONS } from "./icons.js";
import { getContentSelectors } from "./presideStyles.js";
import { t } from "./i18n.js";

function container( e ) { return e.view.dom.closest( ".tiptap-editor-container" ); }

// name -> { run(editor), active(editor) }; icons come from ICONS[name]
// (own MIT-licensed set — see icons.js), with `label` as a text fallback.
// Tooltips are resolved at render time via t( "toolbar.<name>" ) - see i18n.js.
export const COMMANDS = {
	  Bold          : { label: "B",  run: e => e.chain().focus().toggleBold().run(),        active: e => e.isActive( "bold" ) }
	, Italic        : { label: "I",  run: e => e.chain().focus().toggleItalic().run(),      active: e => e.isActive( "italic" ) }
	, Underline     : { label: "U",  run: e => e.chain().focus().toggleUnderline().run(),   active: e => e.isActive( "underline" ) }
	, Strike        : { label: "S",  run: e => e.chain().focus().toggleStrike().run(),      active: e => e.isActive( "strike" ) }
	, Subscript     : { label: "x₂", run: e => e.chain().focus().toggleSubscript().run(),   active: e => e.isActive( "subscript" ) }
	, Superscript   : { label: "x²", run: e => e.chain().focus().toggleSuperscript().run(), active: e => e.isActive( "superscript" ) }
	, Blockquote    : { label: "“", run: e => e.chain().focus().toggleBlockquote().run(),  active: e => e.isActive( "blockquote" ) }
	, NumberedList  : { label: "1.", run: e => e.chain().focus().toggleOrderedList().run(), active: e => e.isActive( "orderedList" ) }
	, BulletedList  : { label: "•", run: e => e.chain().focus().toggleBulletList().run(), active: e => e.isActive( "bulletList" ) }
	, Outdent       : { label: "⇤", run: e => e.chain().focus().liftListItem( "listItem" ).run() }
	, Indent        : { label: "⇥", run: e => e.chain().focus().sinkListItem( "listItem" ).run() }
	, JustifyLeft   : { label: "≡", run: e => e.chain().focus().setTextAlign( "left" ).run(),    active: e => e.isActive( { textAlign: "left" } ) }
	, JustifyCenter : { label: "≡", run: e => e.chain().focus().setTextAlign( "center" ).run(),  active: e => e.isActive( { textAlign: "center" } ) }
	, JustifyRight  : { label: "≡", run: e => e.chain().focus().setTextAlign( "right" ).run(),   active: e => e.isActive( { textAlign: "right" } ) }
	, JustifyBlock  : { label: "≡", run: e => e.chain().focus().setTextAlign( "justify" ).run(), active: e => e.isActive( { textAlign: "justify" } ) }
	, HorizontalRule: { label: "―", run: e => e.chain().focus().setHorizontalRule().run() }
	, Table         : { label: "▦", run: e => e.chain().focus().insertTable( { rows: 3, cols: 3, withHeaderRow: true } ).run() }
	, RemoveFormat  : { label: "Tx", run: e => e.chain().focus().unsetAllMarks().clearNodes().run() }
	, Undo          : { label: "↶", run: e => e.chain().focus().undo().run() }
	, Redo          : { label: "↷", run: e => e.chain().focus().redo().run() }
	, Maximize      : { label: "⛶", run: e => { const c = container( e ); if ( c ) { c.classList.toggle( "is-maximized" ); } }, active: e => { const c = container( e ); return !!( c && c.classList.contains( "is-maximized" ) ); } }
	, PresideLink      : { run: e => e.commands.openPresideLinkPicker(), active: e => e.isActive( "presideLink" ) }
	, PresideUnlink    : { run: e => e.chain().focus().unsetPresideLink().run() }
	, PresideAnchor    : { run: e => e.commands.openPresideAnchorDialog() }
	, Widgets          : { run: e => e.commands.openPresideWidgetPicker() }
	, ImagePicker      : { run: e => e.commands.openPresideImagePicker() }
	, AttachmentPicker : { run: e => e.commands.openPresideAttachmentPicker() }
	, CodeSnippet      : { run: e => e.chain().focus().toggleCodeBlock().run(), active: e => e.isActive( "codeBlock" ) }
};

// Format dropdown entries come from defaultConfigs.format_tags (CKEditor's
// `format_tags`, core default 'p;h1;h2;h3;h4;h5;h6;pre;div') filtered to the
// block formats the editor can actually apply. Labels come from i18n
// ("format.<tag>" keys).
const FORMAT_TAGS = [ "p", "h1", "h2", "h3", "h4", "h5", "h6", "pre", "div" ];
const DEFAULT_FORMAT_TAGS = "p;h1;h2;h3;h4;h5;h6;pre";

function formatOpts( cfg ) {
	const raw  = ( cfg && cfg.defaultConfigs && cfg.defaultConfigs.format_tags ) || DEFAULT_FORMAT_TAGS;
	const opts = [];
	String( raw ).split( ";" ).forEach( function( tag ) {
		tag = tag.trim().toLowerCase();
		if ( FORMAT_TAGS.indexOf( tag ) !== -1 ) { opts.push( { v: tag, label: t( "format." + tag ) } ); }
	} );
	return opts.length ? opts : formatOpts( { defaultConfigs: { format_tags: DEFAULT_FORMAT_TAGS } } );
}

export function buildToolbar( el, editor, parsedToolbar, cfg ) {
	el.innerHTML = "";

	const groups   = normaliseToolbar( parsedToolbar );
	const updaters = [];

	groups.forEach( function( group ) {
		if ( group === "/" ) { el.appendChild( document.createElement( "br" ) ); return; }

		const groupEl = document.createElement( "span" );
		groupEl.className = "tiptap-toolbar-group";

		group.forEach( function( name ) {
			if ( name === "-" ) {
				const sep = document.createElement( "span" );
				sep.className = "tiptap-toolbar-sep";
				groupEl.appendChild( sep );
				return;
			}
			if ( name === "Format" ) { groupEl.appendChild( renderFormat( editor, updaters, cfg ) ); return; }
			if ( name === "Styles" ) { groupEl.appendChild( renderStyles( editor, updaters, cfg ) ); return; }
			if ( name === "Source" ) { groupEl.appendChild( renderSource( editor ) ); return; }

			const cmd = COMMANDS[ name ];
			if ( !cmd ) { return; } // unknown / not-implemented button — skip

			const btn   = document.createElement( "button" );
			const title = t( "toolbar." + name.toLowerCase() );
			btn.type = "button";
			btn.className = "tiptap-btn";
			btn.title = title;
			btn.setAttribute( "aria-label", title );
			if ( ICONS[ name ] ) { btn.innerHTML = ICONS[ name ]; }
			else { btn.textContent = cmd.label || name; }
			btn.setAttribute( "data-cmd", name );
			btn.addEventListener( "click", function( ev ) { ev.preventDefault(); cmd.run( editor ); } );
			groupEl.appendChild( btn );

			if ( cmd.active ) { updaters.push( function() { btn.classList.toggle( "is-active", !!cmd.active( editor ) ); } ); }
		} );

		if ( groupEl.childNodes.length ) { el.appendChild( groupEl ); }
	} );

	const refresh = function() { updaters.forEach( function( u ) { u(); } ); };
	editor.on( "selectionUpdate", refresh );
	editor.on( "transaction", refresh );
	refresh();
}

// Custom dropdown (not a native <select>) so it opens directly under the button
// and each item previews its own style — matching CKEditor's Format menu.
function renderFormat( editor, updaters, cfg ) {
	const wrap = document.createElement( "span" );
	wrap.className = "tiptap-dropdown";

	const trigger = document.createElement( "button" );
	trigger.type = "button";
	trigger.className = "tiptap-btn tiptap-dropdown-trigger";
	trigger.setAttribute( "data-cmd", "Format" );
	trigger.innerHTML = '<span class="lbl"></span><span class="caret">&#9662;</span>';
	trigger.querySelector( ".lbl" ).textContent = t( "toolbar.format" );

	const menu = document.createElement( "div" );
	menu.className = "tiptap-dropdown-menu";

	function closeMenu() { menu.classList.remove( "open" ); document.removeEventListener( "mousedown", onDocDown, true ); }
	function openMenu() { menu.classList.add( "open" ); document.addEventListener( "mousedown", onDocDown, true ); }
	function onDocDown( e ) { if ( !wrap.contains( e.target ) ) { closeMenu(); } }

	formatOpts( cfg ).forEach( function( o ) {
		const item = document.createElement( "div" );
		item.className = "tiptap-dropdown-item tiptap-fmt-preview fmt-" + o.v;
		// Render the item AS the real element (h1..h6/p/pre/div) so the injected
		// content CSS (scoped to .tiptap-fmt-preview) styles it — e.g. a green H2,
		// like CKEditor.
		const inner = document.createElement( o.v );
		inner.textContent = o.label;
		item.appendChild( inner );
		item.addEventListener( "mousedown", function( ev ) {
			ev.preventDefault(); // keep the editor selection
			applyFormat( editor, o.v );
			closeMenu();
		} );
		menu.appendChild( item );
	} );

	trigger.addEventListener( "click", function( ev ) {
		ev.preventDefault();
		if ( menu.classList.contains( "open" ) ) { closeMenu(); } else { openMenu(); }
	} );

	wrap.appendChild( trigger );
	wrap.appendChild( menu );

	updaters.push( function() {
		const v = currentFormat( editor );
		trigger.querySelector( ".lbl" ).textContent = FORMAT_TAGS.indexOf( v ) !== -1 ? t( "format." + v ) : t( "toolbar.format" );
		Array.prototype.forEach.call( menu.children, function( el ) {
			el.classList.toggle( "active", el.classList.contains( "fmt-" + v ) );
		} );
	} );

	return wrap;
}

function applyFormat( editor, v ) {
	const c = editor.chain().focus();
	if ( v === "p" ) { c.setParagraph().run(); }
	else if ( v === "pre" ) { c.setNode( "codeBlock" ).run(); }
	else if ( v === "div" ) { c.setNode( "presideDiv" ).run(); }
	else { c.setNode( "heading", { level: parseInt( v.slice( 1 ), 10 ) } ).run(); }
}
function currentFormat( editor ) {
	for ( let n = 1; n <= 6; n++ ) { if ( editor.isActive( "heading", { level: n } ) ) { return "h" + n; } }
	if ( editor.isActive( "codeBlock" ) ) { return "pre"; }
	if ( editor.isActive( "presideDiv" ) ) { return "div"; }
	return "p";
}

// ---- Styles dropdown ---------------------------------------------------------
// CKEditor's stylesheetParser feature: class-based styles are harvested from the
// field's content stylesheets (selectors matching stylesheetParser_validSelectors)
// plus any static defaultConfigs.stylesSet entries. Built lazily on open, because
// the stylesheets load asynchronously.

// tag -> [ tiptap node name, attrs, needsExistingNode ]
const STYLE_BLOCK_TYPES = {
	  p    : { type: "paragraph" }
	, h1   : { type: "heading", attrs: { level: 1 } }
	, h2   : { type: "heading", attrs: { level: 2 } }
	, h3   : { type: "heading", attrs: { level: 3 } }
	, h4   : { type: "heading", attrs: { level: 4 } }
	, h5   : { type: "heading", attrs: { level: 5 } }
	, h6   : { type: "heading", attrs: { level: 6 } }
	, pre  : { type: "codeBlock" }
	, div  : { type: "presideDiv" }
	, ul   : { type: "bulletList",  existingOnly: true }
	, ol   : { type: "orderedList", existingOnly: true }
	, li   : { type: "listItem",    existingOnly: true }
	, table: { type: "table",       existingOnly: true }
};
const DEFAULT_VALID_SELECTORS = "^(h[1-6]|p|span|pre|li|ul|ol|dl|dt|dd|small|i|b|em|strong|table)\\.\\w+";

function styleItems( cfg ) {
	const dc    = ( cfg && cfg.defaultConfigs ) || {};
	const items = [];
	const seen  = {};

	let valid;
	try { valid = new RegExp( dc.stylesheetParser_validSelectors || DEFAULT_VALID_SELECTORS ); }
	catch ( e ) { valid = new RegExp( DEFAULT_VALID_SELECTORS ); }

	function add( tag, className, name ) {
		tag = tag.toLowerCase();
		const supported = tag === "span" || STYLE_BLOCK_TYPES[ tag ];
		const key = tag + "." + className;
		if ( !supported || !className || seen[ key ] ) { return; }
		seen[ key ] = true;
		items.push( { tag: tag, className: className, name: name || key } );
	}

	// Static stylesSet entries ({ name, element, attributes: { class } }).
	( Array.isArray( dc.stylesSet ) ? dc.stylesSet : [] ).forEach( function( s ) {
		const cls = s && s.attributes && s.attributes[ "class" ];
		if ( s && s.element && cls ) { add( s.element, cls, s.name ); }
	} );

	// Selectors harvested from the fetched content stylesheets.
	getContentSelectors().forEach( function( selector ) {
		selector.split( "," ).forEach( function( s ) {
			s = s.trim();
			if ( !valid.test( s ) ) { return; }
			const parts = s.split( "." );
			add( parts[ 0 ], parts.slice( 1 ).join( " " ) );
		} );
	} );

	return items;
}

function applyStyle( editor, item ) {
	if ( item.tag === "span" ) {
		if ( editor.isActive( "presideInlineStyle", { "class": item.className } ) ) {
			editor.chain().focus().unsetMark( "presideInlineStyle" ).run();
		} else {
			editor.chain().focus().setMark( "presideInlineStyle", { "class": item.className } ).run();
		}
		return;
	}

	const t = STYLE_BLOCK_TYPES[ item.tag ];
	if ( !t ) { return; }
	if ( t.existingOnly && !editor.isActive( t.type ) ) { return; } // e.g. table style with no table selected

	if ( !t.existingOnly ) { applyFormat( editor, item.tag ); }
	const current = editor.getAttributes( t.type )[ "class" ];
	editor.chain().focus().updateAttributes( t.type, { "class": current === item.className ? null : item.className } ).run();
}

function styleIsActive( editor, item ) {
	if ( item.tag === "span" ) { return editor.isActive( "presideInlineStyle", { "class": item.className } ); }
	const t = STYLE_BLOCK_TYPES[ item.tag ];
	return !!t && editor.isActive( t.type, t.attrs || {} ) && editor.getAttributes( t.type )[ "class" ] === item.className;
}

function renderStyles( editor, updaters, cfg ) {
	const wrap = document.createElement( "span" );
	wrap.className = "tiptap-dropdown";

	const trigger = document.createElement( "button" );
	trigger.type = "button";
	trigger.className = "tiptap-btn tiptap-dropdown-trigger";
	trigger.setAttribute( "data-cmd", "Styles" );
	trigger.innerHTML = '<span class="lbl"></span><span class="caret">&#9662;</span>';
	trigger.querySelector( ".lbl" ).textContent = t( "toolbar.styles" );

	const menu = document.createElement( "div" );
	menu.className = "tiptap-dropdown-menu";

	function closeMenu() { menu.classList.remove( "open" ); document.removeEventListener( "mousedown", onDocDown, true ); }
	function onDocDown( e ) { if ( !wrap.contains( e.target ) ) { closeMenu(); } }

	function openMenu() {
		menu.innerHTML = "";
		const items = styleItems( cfg );
		if ( !items.length ) {
			const none = document.createElement( "div" );
			none.className = "tiptap-dropdown-item tiptap-dropdown-empty";
			none.textContent = t( "styles.none" );
			menu.appendChild( none );
		}
		items.forEach( function( it ) {
			const item = document.createElement( "div" );
			item.className = "tiptap-dropdown-item tiptap-fmt-preview";
			// Preview AS tag.class so the scoped content CSS styles the entry.
			const inner = document.createElement( it.tag );
			inner.className = it.className;
			inner.textContent = it.name;
			item.appendChild( inner );
			item.classList.toggle( "active", styleIsActive( editor, it ) );
			item.addEventListener( "mousedown", function( ev ) {
				ev.preventDefault(); // keep the editor selection
				applyStyle( editor, it );
				closeMenu();
			} );
			menu.appendChild( item );
		} );
		menu.classList.add( "open" );
		document.addEventListener( "mousedown", onDocDown, true );
	}

	trigger.addEventListener( "click", function( ev ) {
		ev.preventDefault();
		if ( menu.classList.contains( "open" ) ) { closeMenu(); } else { openMenu(); }
	} );

	wrap.appendChild( trigger );
	wrap.appendChild( menu );
	return wrap;
}

function renderSource( editor ) {
	const btn = document.createElement( "button" );
	btn.type = "button";
	btn.className = "tiptap-btn";
	btn.title = t( "toolbar.source" );
	btn.setAttribute( "aria-label", t( "toolbar.source" ) );
	if ( ICONS.Source ) { btn.innerHTML = ICONS.Source; } else { btn.textContent = "</>"; }
	btn.setAttribute( "data-cmd", "Source" );
	btn.addEventListener( "click", function( ev ) {
		ev.preventDefault();
		const mount = editor.view.dom.parentNode; // .tiptap-editor-mount
		if ( !mount.__srcTa ) {
			const ta = document.createElement( "textarea" );
			ta.className = "tiptap-source";
			ta.value = tokenize( editor.getHTML() );
			editor.view.dom.style.display = "none";
			mount.appendChild( ta );
			mount.__srcTa = ta;
			btn.classList.add( "is-active" );
		} else {
			editor.commands.setContent( detokenize( mount.__srcTa.value ) );
			mount.__srcTa.remove();
			mount.__srcTa = null;
			editor.view.dom.style.display = "";
			btn.classList.remove( "is-active" );
		}
	} );
	return btn;
}

function normaliseToolbar( parsed ) {
	if ( Array.isArray( parsed ) ) {
		return parsed.map( function( g ) {
			if ( g === "/" ) { return "/"; }
			if ( Array.isArray( g ) ) { return g; }
			if ( g && Array.isArray( g.items ) ) { return g.items; }
			return [];
		} );
	}
	return [ [ "Bold", "Italic", "Strike", "-", "BulletedList", "NumberedList", "Blockquote", "-", "RemoveFormat", "-", "Undo", "Redo" ] ];
}
