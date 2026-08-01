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
import { themeEnabled, renderThemeToggle } from "./theme.js";
import { toggleMaximize, isMaximized } from "./maximize.js";
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
	// Table is rendered as a grid-size picker (renderTable), not a plain button —
	// `run` is the keyboard/fallback path and the picker's default size.
	, Table         : { label: "▦", run: e => e.chain().focus().insertTable( { rows: 3, cols: 3, withHeaderRow: true } ).run(), active: e => e.isActive( "table" ) }
	, RemoveFormat  : { label: "Tx", run: e => e.chain().focus().unsetAllMarks().clearNodes().run() }
	, Undo          : { label: "↶", run: e => e.chain().focus().undo().run() }
	, Redo          : { label: "↷", run: e => e.chain().focus().redo().run() }
	, Maximize      : { label: "⛶", run: e => toggleMaximize( container( e ), e ), active: e => isMaximized( container( e ) ) }
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

// Render a list of CKEditor button names into `groupEl`, sharing the exact
// per-name behaviour of the main toolbar (Justify* collapse into one dropdown,
// Format/Styles/Table/Source/Theme special cases, plain buttons with is-active
// updaters). Extracted so the selection bubble (Modern inline mode) builds its
// filtered button set from the SAME renderers — one implementation, two hosts.
// `opts.skip` drops names entirely (the bubble excludes insert/global commands).
// Returns { themeRendered } (whether a Theme/DarkMode toggle was rendered).
export function renderNames( groupEl, names, editor, cfg, updaters, opts ) {
	opts = opts || {};
	const skip = opts.skip || [];
	let themeRendered = false;

	// The four Justify* buttons collapse into ONE dropdown (renderAlign) to save
	// a lot of toolbar width. Scoped to the group, and only when the group names
	// more than one of them: a toolbar naming a single alignment gets a plain
	// button, because a one-item menu is worse than the button it replaced.
	const alignNames    = names.filter ? names.filter( function( n ) { return ALIGN_NAMES.indexOf( n ) !== -1 && skip.indexOf( n ) === -1; } ) : [];
	const collapseAlign = alignNames.length > 1;

	names.forEach( function( name ) {
		if ( skip.indexOf( name ) !== -1 ) { return; }
		// Render the dropdown where the first alignment button sat and drop the
		// rest. The menu offers EXACTLY the ones this toolbar named - never all
		// four - so a site that deliberately withheld e.g. Justify keeps it out.
		if ( collapseAlign && ALIGN_NAMES.indexOf( name ) !== -1 ) {
			if ( name === alignNames[ 0 ] ) { groupEl.appendChild( renderAlign( editor, updaters, alignNames ) ); }
			return;
		}
		if ( name === "-" ) {
			const sep = document.createElement( "span" );
			sep.className = "tiptap-toolbar-sep";
			groupEl.appendChild( sep );
			return;
		}
		if ( name === "Format" ) { groupEl.appendChild( renderFormat( editor, updaters, cfg ) ); return; }
		if ( name === "Styles" ) { groupEl.appendChild( renderStyles( editor, updaters, cfg ) ); return; }
		if ( name === "Table"  ) { groupEl.appendChild( renderTable( editor, updaters ) ); return; }
		if ( name === "Source" ) { groupEl.appendChild( renderSource( editor ) ); return; }
		if ( name === "Theme" || name === "DarkMode" ) {
			if ( themeEnabled( cfg ) ) { groupEl.appendChild( renderThemeToggle() ); themeRendered = true; }
			return;
		}

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

	return { themeRendered: themeRendered };
}

export function buildToolbar( el, editor, parsedToolbar, cfg ) {
	el.innerHTML = "";

	const groups   = normaliseToolbar( parsedToolbar );
	const updaters = [];
	// The light/dark toggle normally lives in the footer status bar (the facade
	// puts it there); the toolbar only renders one when a toolbar config names it
	// explicitly ("Theme" / "DarkMode"), which is reported back so the facade
	// doesn't add a second.
	let themeRendered = false;

	groups.forEach( function( group ) {
		if ( group === "/" ) { el.appendChild( document.createElement( "br" ) ); return; }

		const groupEl = document.createElement( "span" );
		groupEl.className = "tiptap-toolbar-group";

		const res = renderNames( groupEl, group, editor, cfg, updaters );
		if ( res.themeRendered ) { themeRendered = true; }

		if ( groupEl.childNodes.length ) { el.appendChild( groupEl ); }
	} );

	const refresh = function() { updaters.forEach( function( u ) { u(); } ); };
	editor.on( "selectionUpdate", refresh );
	editor.on( "transaction", refresh );
	refresh();

	return { themeEnabled: themeEnabled( cfg ), themeRendered: themeRendered };
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

// ---- Alignment dropdown ------------------------------------------------------
// CKEditor gave alignment four separate toolbar buttons; four buttons for one
// mutually-exclusive property is a lot of width, so they collapse into one
// trigger + a compact row of icons (as reactjs-tiptap-editor does).
//
// Unlike that editor's fixed "AlignJustify" trigger icon, ours shows the CURRENT
// alignment, so the state is readable without opening the menu - matching how the
// Format dropdown displays its current value.
//
// Button name -> the textAlign value it applies. Order here is CKEditor's
// canonical order, but the menu follows the toolbar's own order (see renderAlign).
const ALIGN_VALUES = {
	  JustifyLeft  : "left"
	, JustifyCenter: "center"
	, JustifyRight : "right"
	, JustifyBlock : "justify"
};
const ALIGN_NAMES = Object.keys( ALIGN_VALUES );

function currentAlign( editor ) {
	for ( let i = 0; i < ALIGN_NAMES.length; i++ ) {
		const v = ALIGN_VALUES[ ALIGN_NAMES[ i ] ];
		if ( editor.isActive( { textAlign: v } ) ) { return ALIGN_NAMES[ i ]; }
	}
	return null;
}

function renderAlign( editor, updaters, names ) {
	const wrap = document.createElement( "span" );
	wrap.className = "tiptap-dropdown tiptap-align-picker";

	const title   = t( "toolbar.align" );
	const trigger = document.createElement( "button" );
	trigger.type = "button";
	trigger.className = "tiptap-btn";
	trigger.title = title;
	trigger.setAttribute( "aria-label", title );
	trigger.setAttribute( "data-cmd", "Align" );
	trigger.setAttribute( "aria-haspopup", "true" );

	// Icon slot + caret. The icon is swapped by the updater below, so the caret
	// lives in its own span rather than being rewritten with it.
	const iconEl = document.createElement( "span" );
	iconEl.className = "tiptap-align-icon";
	const caret = document.createElement( "span" );
	caret.className = "caret";
	caret.innerHTML = "&#9662;";
	trigger.appendChild( iconEl );
	trigger.appendChild( caret );

	const menu = document.createElement( "div" );
	menu.className = "tiptap-dropdown-menu tiptap-align-menu";

	function closeMenu() { menu.classList.remove( "open" ); document.removeEventListener( "mousedown", onDocDown, true ); }
	function openMenu()  { menu.classList.add( "open" );    document.addEventListener( "mousedown", onDocDown, true ); }
	function onDocDown( e ) { if ( !wrap.contains( e.target ) ) { closeMenu(); } }

	const itemBtns = {};
	names.forEach( function( name ) {
		const label = t( "toolbar." + name.toLowerCase() );
		const item  = document.createElement( "button" );
		item.type = "button";
		item.className = "tiptap-btn tiptap-align-item";
		item.title = label;
		item.setAttribute( "aria-label", label );
		item.innerHTML = ICONS[ name ];
		item.addEventListener( "mousedown", function( e ) { e.preventDefault(); } ); // keep the selection
		item.addEventListener( "click", function( e ) {
			e.preventDefault();
			COMMANDS[ name ].run( editor );
			closeMenu();
		} );
		itemBtns[ name ] = item;
		menu.appendChild( item );
	} );

	trigger.addEventListener( "click", function( ev ) {
		ev.preventDefault();
		if ( menu.classList.contains( "open" ) ) { closeMenu(); } else { openMenu(); }
	} );

	wrap.appendChild( trigger );
	wrap.appendChild( menu );

	updaters.push( function() {
		const cur = currentAlign( editor );
		// Show the current alignment, falling back to the first option this toolbar
		// offers (left, in every real config) when nothing is explicitly set.
		iconEl.innerHTML = ICONS[ cur && itemBtns[ cur ] ? cur : names[ 0 ] ];
		// Only "active" when an alignment really is applied - the fallback icon
		// above must not make the button look permanently on.
		trigger.classList.toggle( "is-active", !!( cur && itemBtns[ cur ] ) );
		names.forEach( function( n ) { itemBtns[ n ].classList.toggle( "is-active", cur === n ); } );
	} );

	return wrap;
}

// ---- Table grid-size picker --------------------------------------------------
// Click the toolbar button -> a grid of cells; hover (or drag) to choose the
// size, release/click to insert. Replaces the old fixed 3x3 insert.
//
// The grid GROWS towards the max as you reach its current edge, rather than
// showing the full 10x10 up front: the common table is small, and a big grid
// makes the small sizes a fiddly target. Dragging past the edge keeps extending,
// so the large sizes stay reachable without a second interaction.
const TABLE_GRID_MAX  = 10;
const TABLE_GRID_INIT = 5;

// "With header row" choice, remembered across opens and across editors on the
// page (a page-level preference, not a per-field one - same reasoning as the
// theme toggle, minus the persistence: it is a per-insert decision, so it is not
// worth a localStorage entry).
let withHeaderRowPref = true;

function renderTable( editor, updaters ) {
	const wrap = document.createElement( "span" );
	wrap.className = "tiptap-dropdown tiptap-table-picker";

	const title   = t( "toolbar.table" );
	// Deliberately NOT .tiptap-dropdown-trigger: that class means "a control whose
	// label is its current value" (Format/Styles), and things that enumerate the
	// toolbar skip those. This is an ordinary icon button that happens to open a
	// popover, so it keeps its stable title and stays enumerable.
	const trigger = document.createElement( "button" );
	trigger.type = "button";
	trigger.className = "tiptap-btn";
	trigger.title = title;
	trigger.setAttribute( "aria-label", title );
	trigger.setAttribute( "data-cmd", "Table" );
	trigger.setAttribute( "aria-haspopup", "true" );
	trigger.innerHTML = ICONS.Table;

	const menu = document.createElement( "div" );
	menu.className = "tiptap-dropdown-menu tiptap-table-grid-menu";

	const grid = document.createElement( "div" );
	grid.className = "tiptap-table-grid";
	grid.style.touchAction = "none";

	const caption = document.createElement( "div" );
	caption.className = "tiptap-table-grid-caption";

	// "With header row" is a real choice, not a hidden default: Preside content
	// uses <th> widely, and the old fixed insert always made one. Sticky within
	// the session so a user who never wants headers stops fighting it.
	const hdrLabel = document.createElement( "label" );
	hdrLabel.className = "tiptap-table-grid-header";
	const hdrBox = document.createElement( "input" );
	hdrBox.type = "checkbox";
	hdrBox.checked = withHeaderRowPref;
	hdrLabel.appendChild( hdrBox );
	hdrLabel.appendChild( document.createTextNode( " " + t( "table.withheaderrow" ) ) );
	hdrBox.addEventListener( "change", function() { withHeaderRowPref = hdrBox.checked; } );
	// Toggling the box must not count as picking a cell, nor close the menu.
	hdrLabel.addEventListener( "mousedown", function( e ) { e.stopPropagation(); } );
	hdrLabel.addEventListener( "pointerdown", function( e ) { e.stopPropagation(); } );

	let rows = TABLE_GRID_INIT, cols = TABLE_GRID_INIT;   // grid extent
	let selR = 0, selC = 0;                               // hovered size
	let dragging = false;

	function build() {
		grid.innerHTML = "";
		for ( let r = 1; r <= rows; r++ ) {
			const rowEl = document.createElement( "div" );
			rowEl.className = "tiptap-table-grid-row";
			for ( let c = 1; c <= cols; c++ ) {
				const cell = document.createElement( "span" );
				cell.className = "tiptap-table-grid-cell";
				cell.setAttribute( "data-r", r );
				cell.setAttribute( "data-c", c );
				rowEl.appendChild( cell );
			}
			grid.appendChild( rowEl );
		}
		paint();
	}

	function paint() {
		Array.prototype.forEach.call( grid.querySelectorAll( ".tiptap-table-grid-cell" ), function( cell ) {
			const r = +cell.getAttribute( "data-r" ), c = +cell.getAttribute( "data-c" );
			cell.classList.toggle( "is-on", r <= selR && c <= selC );
		} );
		caption.textContent = selR && selC
			? t( "table.gridsize", { rows: selR, cols: selC } )
			: t( "table.insert" );
	}

	// Grow towards the max when the pointer reaches the current edge.
	function select( r, c ) {
		selR = r; selC = c;
		let grew = false;
		if ( r === rows && rows < TABLE_GRID_MAX ) { rows++; grew = true; }
		if ( c === cols && cols < TABLE_GRID_MAX ) { cols++; grew = true; }
		if ( grew ) { build(); } else { paint(); }
	}

	// elementFromPoint (not the event target) so a pointer-captured drag still
	// tracks cells: with capture set, every move event targets the grid itself.
	function cellAt( e ) {
		const el = document.elementFromPoint( e.clientX, e.clientY );
		const cell = el && el.closest ? el.closest( ".tiptap-table-grid-cell" ) : null;
		return ( cell && grid.contains( cell ) ) ? cell : null;
	}
	function trackFrom( e ) {
		const cell = cellAt( e );
		if ( !cell ) { return false; }
		select( +cell.getAttribute( "data-r" ), +cell.getAttribute( "data-c" ) );
		return true;
	}

	grid.addEventListener( "pointerdown", function( e ) {
		if ( !e.isPrimary || ( e.pointerType === "mouse" && e.button !== 0 ) ) { return; }
		if ( !trackFrom( e ) ) { return; }
		e.preventDefault();
		dragging = true;
		try { grid.setPointerCapture( e.pointerId ); } catch ( err ) {}
	} );
	grid.addEventListener( "pointermove", function( e ) {
		// Hover tracks even without a drag - a plain click-then-click is the
		// mouse-friendly path, the drag is the touch-friendly one.
		trackFrom( e );
	} );
	grid.addEventListener( "pointerup", function( e ) {
		trackFrom( e );
		if ( dragging ) {
			dragging = false;
			try { if ( grid.hasPointerCapture( e.pointerId ) ) { grid.releasePointerCapture( e.pointerId ); } } catch ( err ) {}
		}
		if ( selR && selC ) { insert(); }
	} );
	grid.addEventListener( "pointercancel", function( e ) {
		dragging = false;
		try { if ( grid.hasPointerCapture( e.pointerId ) ) { grid.releasePointerCapture( e.pointerId ); } } catch ( err ) {}
	} );
	grid.addEventListener( "pointerleave", function() {
		if ( !dragging ) { selR = 0; selC = 0; paint(); }
	} );

	function insert() {
		const r = selR, c = selC;
		closeMenu();
		editor.chain().focus().insertTable( { rows: r, cols: c, withHeaderRow: hdrBox.checked } ).run();
	}

	function reset() {
		rows = TABLE_GRID_INIT; cols = TABLE_GRID_INIT;
		selR = 0; selC = 0;
		hdrBox.checked = withHeaderRowPref;
		build();
	}
	function closeMenu() {
		menu.classList.remove( "open" );
		document.removeEventListener( "mousedown", onDocDown, true );
		document.removeEventListener( "keydown", onKeyDown, true );
	}
	function openMenu() {
		reset();
		menu.classList.add( "open" );
		document.addEventListener( "mousedown", onDocDown, true );
		document.addEventListener( "keydown", onKeyDown, true );
	}
	function onDocDown( e ) { if ( !wrap.contains( e.target ) ) { closeMenu(); } }
	function onKeyDown( e ) { if ( e.key === "Escape" ) { e.stopPropagation(); closeMenu(); } }

	trigger.addEventListener( "click", function( ev ) {
		ev.preventDefault();
		if ( menu.classList.contains( "open" ) ) { closeMenu(); } else { openMenu(); }
	} );

	menu.appendChild( grid );
	menu.appendChild( caption );
	menu.appendChild( hdrLabel );
	wrap.appendChild( trigger );
	wrap.appendChild( menu );

	updaters.push( function() { trigger.classList.toggle( "is-active", editor.isActive( "table" ) ); } );

	return wrap;
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

export function styleItems( cfg ) {
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

export function normaliseToolbar( parsed ) {
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
