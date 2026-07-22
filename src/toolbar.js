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

function container( e ) { return e.view.dom.closest( ".tiptap-editor-container" ); }

// name -> { label, title, run(editor), active(editor) }
export const COMMANDS = {
	  Bold          : { label: "B",  title: "Bold",          run: e => e.chain().focus().toggleBold().run(),        active: e => e.isActive( "bold" ) }
	, Italic        : { label: "I",  title: "Italic",        run: e => e.chain().focus().toggleItalic().run(),      active: e => e.isActive( "italic" ) }
	, Underline     : { label: "U",  title: "Underline",     run: e => e.chain().focus().toggleUnderline().run(),   active: e => e.isActive( "underline" ) }
	, Strike        : { label: "S",  title: "Strikethrough", run: e => e.chain().focus().toggleStrike().run(),      active: e => e.isActive( "strike" ) }
	, Subscript     : { label: "x₂", title: "Subscript",     run: e => e.chain().focus().toggleSubscript().run(),   active: e => e.isActive( "subscript" ) }
	, Superscript   : { label: "x²", title: "Superscript",   run: e => e.chain().focus().toggleSuperscript().run(), active: e => e.isActive( "superscript" ) }
	, Blockquote    : { label: "“", title: "Blockquote",    run: e => e.chain().focus().toggleBlockquote().run(),  active: e => e.isActive( "blockquote" ) }
	, NumberedList  : { label: "1.", title: "Numbered list", run: e => e.chain().focus().toggleOrderedList().run(), active: e => e.isActive( "orderedList" ) }
	, BulletedList  : { label: "•", title: "Bulleted list", run: e => e.chain().focus().toggleBulletList().run(), active: e => e.isActive( "bulletList" ) }
	, Outdent       : { label: "⇤", title: "Outdent",       run: e => e.chain().focus().liftListItem( "listItem" ).run() }
	, Indent        : { label: "⇥", title: "Indent",        run: e => e.chain().focus().sinkListItem( "listItem" ).run() }
	, JustifyLeft   : { label: "≡", title: "Align left",   run: e => e.chain().focus().setTextAlign( "left" ).run(),    active: e => e.isActive( { textAlign: "left" } ) }
	, JustifyCenter : { label: "≡", title: "Align center", run: e => e.chain().focus().setTextAlign( "center" ).run(),  active: e => e.isActive( { textAlign: "center" } ) }
	, JustifyRight  : { label: "≡", title: "Align right",  run: e => e.chain().focus().setTextAlign( "right" ).run(),   active: e => e.isActive( { textAlign: "right" } ) }
	, JustifyBlock  : { label: "≡", title: "Justify",      run: e => e.chain().focus().setTextAlign( "justify" ).run(), active: e => e.isActive( { textAlign: "justify" } ) }
	, HorizontalRule: { label: "―", title: "Horizontal rule", run: e => e.chain().focus().setHorizontalRule().run() }
	, Table         : { label: "▦", title: "Table",       run: e => e.chain().focus().insertTable( { rows: 3, cols: 3, withHeaderRow: true } ).run() }
	, RemoveFormat  : { label: "Tx", title: "Remove format", run: e => e.chain().focus().unsetAllMarks().clearNodes().run() }
	, Undo          : { label: "↶", title: "Undo", run: e => e.chain().focus().undo().run() }
	, Redo          : { label: "↷", title: "Redo", run: e => e.chain().focus().redo().run() }
	, Maximize      : { label: "⛶", title: "Maximize", run: e => { const c = container( e ); if ( c ) { c.classList.toggle( "is-maximized" ); } }, active: e => { const c = container( e ); return !!( c && c.classList.contains( "is-maximized" ) ); } }
	// Preside buttons — use the actual CKEditor icons (iconClass → background image)
	, PresideLink      : { iconClass: "ck-icon ck-presidelink",   title: "Link",       run: e => e.commands.openPresideLinkPicker(), active: e => e.isActive( "presideLink" ) }
	, PresideUnlink    : { iconClass: "ck-icon ck-presideunlink", title: "Unlink",     run: e => e.chain().focus().unsetPresideLink().run() }
	, PresideAnchor    : { iconClass: "ck-icon ck-presideanchor", title: "Anchor",     run: e => e.commands.openPresideAnchorDialog() }
	, Widgets          : { iconClass: "ck-icon ck-widgets",       title: "Widget",     run: e => e.commands.openPresideWidgetPicker() }
	, ImagePicker      : { iconClass: "ck-icon ck-imagepicker",   title: "Image",      run: e => e.commands.openPresideImagePicker() }
	, AttachmentPicker : { iconClass: "ck-icon ck-attachmentpicker", title: "Attachment", run: e => e.commands.openPresideAttachmentPicker() }
	, CodeSnippet      : { iconClass: "ck-icon ck-codesnippet",   title: "Code snippet", run: e => e.chain().focus().toggleCodeBlock().run(), active: e => e.isActive( "codeBlock" ) }
};

const FORMAT_OPTS = [
	  { v: "p",   label: "Paragraph" }
	, { v: "h1",  label: "Heading 1" }
	, { v: "h2",  label: "Heading 2" }
	, { v: "h3",  label: "Heading 3" }
	, { v: "h4",  label: "Heading 4" }
	, { v: "h5",  label: "Heading 5" }
	, { v: "h6",  label: "Heading 6" }
	, { v: "pre", label: "Preformatted" }
];

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
			if ( name === "Format" ) { groupEl.appendChild( renderFormat( editor, updaters ) ); return; }
			if ( name === "Source" ) { groupEl.appendChild( renderSource( editor ) ); return; }

			const cmd = COMMANDS[ name ];
			if ( !cmd ) { return; } // unknown / not-implemented button — skip

			const btn = document.createElement( "button" );
			btn.type = "button";
			btn.className = "tiptap-btn" + ( cmd.iconClass ? " tiptap-btn-img " + cmd.iconClass : "" );
			btn.title = cmd.title || name;
			if ( cmd.iconClass ) { btn.setAttribute( "aria-label", cmd.title || name ); }
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
function renderFormat( editor, updaters ) {
	const wrap = document.createElement( "span" );
	wrap.className = "tiptap-dropdown";

	const trigger = document.createElement( "button" );
	trigger.type = "button";
	trigger.className = "tiptap-btn tiptap-dropdown-trigger";
	trigger.setAttribute( "data-cmd", "Format" );
	trigger.innerHTML = '<span class="lbl">Format</span><span class="caret">&#9662;</span>';

	const menu = document.createElement( "div" );
	menu.className = "tiptap-dropdown-menu";

	function closeMenu() { menu.classList.remove( "open" ); document.removeEventListener( "mousedown", onDocDown, true ); }
	function openMenu() { menu.classList.add( "open" ); document.addEventListener( "mousedown", onDocDown, true ); }
	function onDocDown( e ) { if ( !wrap.contains( e.target ) ) { closeMenu(); } }

	FORMAT_OPTS.forEach( function( o ) {
		const item = document.createElement( "div" );
		item.className = "tiptap-dropdown-item tiptap-fmt-preview fmt-" + o.v;
		// Render the item AS the real element (h1..h6/p/pre) so the injected content
		// CSS (scoped to .tiptap-fmt-preview) styles it — e.g. a green H2, like CKEditor.
		const inner = document.createElement( o.v ); // p / h1..h6 / pre are all valid tags
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
		trigger.querySelector( ".lbl" ).textContent = labelFor( v );
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
	else { c.setNode( "heading", { level: parseInt( v.slice( 1 ), 10 ) } ).run(); }
}
function currentFormat( editor ) {
	for ( let n = 1; n <= 6; n++ ) { if ( editor.isActive( "heading", { level: n } ) ) { return "h" + n; } }
	if ( editor.isActive( "codeBlock" ) ) { return "pre"; }
	return "p";
}
function labelFor( v ) {
	for ( let i = 0; i < FORMAT_OPTS.length; i++ ) { if ( FORMAT_OPTS[ i ].v === v ) { return FORMAT_OPTS[ i ].label; } }
	return "Format";
}

function renderSource( editor ) {
	const btn = document.createElement( "button" );
	btn.type = "button";
	btn.className = "tiptap-btn";
	btn.title = "Source";
	btn.textContent = "</>";
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
