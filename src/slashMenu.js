/**
 * The "/" insert menu - type "/" in an empty block to filter and insert any of
 * the editor's block-level elements, INCLUDING Preside's own (image /
 * attachment / widget pickers, and individual widgets by name).
 *
 * Trigger detection is @tiptap/suggestion (MIT, framework-agnostic); the popup
 * is ours, because Tiptap only ships React/Vue renderers.
 *
 * WHY "/" ONLY AT THE START OF AN EMPTY-ISH BLOCK (see `allow` below): Preside
 * content is full of real slashes - dates, paths, "and/or" - and a menu that
 * opened mid-sentence would fight the author constantly. CKEditor had no such
 * trigger, so anything surprising here is a regression against the editor we
 * replace, not a missing feature.
 *
 * Every item is a command that already exists (the toolbar's COMMANDS, or the
 * picker commands the Preside extensions register), so this module adds a way to
 * REACH things, never a second implementation of them. Nothing here touches the
 * document beyond running that command, so getData() is unaffected by the menu's
 * existence.
 */
import { ICONS } from "./icons.js";
import { COMMANDS } from "./toolbar.js";
import { t } from "./i18n.js";

// Opt out per site/field, matching the wordcount / outline / tableTools opt-outs.
export function slashMenuEnabled( cfg ) {
	return !( cfg && cfg.defaultConfigs && cfg.defaultConfigs.slashMenu === false );
}

// ---- The item registry -------------------------------------------------------
// { key, icon, group, run(editor), keywords }
// `key` resolves the label via i18n ("slash.<key>"); `keywords` adds extra
// English search terms so "/pic" finds the image picker. Keywords are matched in
// ADDITION to the translated label, never instead of it - a localised admin must
// still be searchable in its own language.
function baseItems() {
	return [
		  { key: "h1",         icon: "Format",         group: "format", run: e => e.chain().focus().setNode( "heading", { level: 1 } ).run(), keywords: "heading title h1" }
		, { key: "h2",         icon: "Format",         group: "format", run: e => e.chain().focus().setNode( "heading", { level: 2 } ).run(), keywords: "heading subtitle h2" }
		, { key: "h3",         icon: "Format",         group: "format", run: e => e.chain().focus().setNode( "heading", { level: 3 } ).run(), keywords: "heading h3" }
		, { key: "paragraph",  icon: "Format",         group: "format", run: e => e.chain().focus().setParagraph().run(), keywords: "text body normal p" }
		, { key: "bulletlist", icon: "BulletedList",   group: "block",  run: e => e.chain().focus().toggleBulletList().run(), keywords: "unordered ul bullets" }
		, { key: "orderedlist",icon: "NumberedList",   group: "block",  run: e => e.chain().focus().toggleOrderedList().run(), keywords: "numbered ol" }
		, { key: "blockquote", icon: "Blockquote",     group: "block",  run: e => e.chain().focus().toggleBlockquote().run(), keywords: "quote citation" }
		, { key: "codeblock",  icon: "CodeSnippet",    group: "block",  run: e => e.chain().focus().toggleCodeBlock().run(), keywords: "code pre snippet" }
		, { key: "hr",         icon: "HorizontalRule", group: "block",  run: e => e.chain().focus().setHorizontalRule().run(), keywords: "divider rule separator line" }
		, { key: "table",      icon: "Table",          group: "block",  run: e => e.chain().focus().insertTable( { rows: 3, cols: 3, withHeaderRow: true } ).run(), keywords: "grid rows columns" }
		// Preside's own elements. These reuse the picker commands the embed
		// extensions register - the same ones the toolbar buttons call.
		, { key: "image",      icon: "ImagePicker",      group: "preside", cmd: "ImagePicker",      keywords: "picture photo asset media" }
		, { key: "attachment", icon: "AttachmentPicker", group: "preside", cmd: "AttachmentPicker", keywords: "file document download pdf" }
		, { key: "widget",     icon: "Widgets",          group: "preside", cmd: "Widgets",          keywords: "widget component embed" }
		, { key: "link",       icon: "PresideLink",      group: "preside", cmd: "PresideLink",      keywords: "url href page" }
		, { key: "anchor",     icon: "PresideAnchor",    group: "preside", cmd: "PresideAnchor",    keywords: "bookmark jump target" }
	];
}

/**
 * Individual widgets, from cfrequest.tiptapWidgets (emitted server-side by the
 * ckEditorJs.cfm override - translated titles/descriptions, already filtered to
 * the active site template).
 *
 * Filtered here by the FIELD's own widgetCategories, applying Preside's own rule
 * (WidgetsService._isWidgetInCategories): an empty list on either side means
 * "default". Doing it client-side is what lets one server-rendered list serve
 * every field on the page, since widgetCategories is a per-field setting.
 *
 * Selecting one opens the picker PRE-POINTED at that widget (core's
 * Widgets.dialog() renders a widget's configForm whenever rc.widget is set), so
 * "/news" lands on the news widget's own form. Deliberately not short-circuited
 * into building a {{widget:...}} token here even for widgets with no config
 * form: the token would then be ours rather than Preside's, and byte fidelity
 * with what the picker commits is the whole point of tokens.
 */
function widgetItems( cfg ) {
	const all = ( window.cfrequest && window.cfrequest.tiptapWidgets ) || [];
	if ( !all.length ) { return []; }

	const wanted = String( ( cfg && cfg.widgetCategories ) || "" )
		.split( "," ).map( s => s.trim() ).filter( Boolean );
	const want = wanted.length ? wanted : [ "default" ];

	return all.filter( function( w ) {
		const cats = ( w.categories && w.categories.length ) ? w.categories : [ "default" ];
		return cats.some( c => want.some( x => x.toLowerCase() === String( c ).toLowerCase() ) );
	} ).map( function( w ) {
		return {
			  key      : null                 // label comes straight from the server
			, label    : w.title || w.id
			, hint     : w.description || ""
			, icon     : "Widgets"
			, group    : "widget"
			, keywords : w.id + " " + ( w.description || "" )
			, run      : function( editor ) { editor.commands.openPresideWidgetPicker( { widget: w.id } ); }
		};
	} );
}

function itemsFor( cfg ) {
	const items = [];
	baseItems().forEach( function( it ) {
		// Drop anything whose command this build/field does not have (a toolbar
		// without pickers, a Preside extension not registered).
		if ( it.cmd && !COMMANDS[ it.cmd ] ) { return; }
		items.push( {
			  label   : t( "slash." + it.key )
			, hint    : t( "slash." + it.key + ".hint" )
			, icon    : it.icon
			, group   : it.group
			, keywords: it.keywords || ""
			, run     : it.run || ( e => COMMANDS[ it.cmd ].run( e ) )
		} );
	} );
	widgetItems( cfg ).forEach( it => items.push( it ) );
	return items;
}

function filterItems( items, query ) {
	const q = String( query || "" ).trim().toLowerCase();
	if ( !q ) { return items; }
	// Label match first, then keyword/hint match, so "/table" puts Table above
	// anything that merely mentions tables.
	const starts = [], contains = [], loose = [];
	items.forEach( function( it ) {
		const label = String( it.label || "" ).toLowerCase();
		if ( label.startsWith( q ) )      { starts.push( it ); }
		else if ( label.includes( q ) )   { contains.push( it ); }
		else if ( ( it.keywords + " " + ( it.hint || "" ) ).toLowerCase().includes( q ) ) { loose.push( it ); }
	} );
	return starts.concat( contains, loose );
}

/**
 * Build the Tiptap extension. `cfg` is the facade's field config (for
 * widgetCategories + the opt-out).
 */
export function createSlashMenu( T, cfg ) {
	const items = () => itemsFor( cfg );

	return T.Extension.create( {
		  name: "presideSlashMenu"

		, addProseMirrorPlugins() {
			const editor = this.editor;
			const popup  = createPopup();

			return [ T.Suggestion( {
				  editor
				, char     : "/"
				, pluginKey: new T.PluginKey( "presideSlashMenu" )

				// Only at the very start of an empty-ish top-level block, and never
				// inside a code block (where "/" is just code) - see the header note.
				, allow: function( { state, range } ) {
					const $from = state.doc.resolve( range.from );
					if ( $from.parent.type.name === "codeBlock" ) { return false; }
					// The text before the "/" must be nothing at all.
					const before = $from.parent.textBetween( 0, Math.max( 0, range.from - $from.start() ) );
					return before.trim() === "";
				}

				, command: function( { editor, range, props } ) {
					// Drop the "/query" text, then run the item. Deleting first means
					// the item's own command sees a clean block - important for the
					// pickers, which insert a block-level node at the selection.
					editor.chain().focus().deleteRange( range ).run();
					props.run( editor );
				}

				, items: function( { query } ) { return filterItems( items(), query ); }

				, render: function() {
					let list = [], active = 0, cmd = null, rect = null;

					// Render BEFORE positioning, always: the flip-above decision needs the
					// popup's real height, and measuring an empty box put a full-length
					// menu off the bottom of the screen.
					function paint() {
						popup.render( list, active, function( i ) {
							if ( cmd ) { cmd( list[ i ] ); }
						} );
						popup.move( rect );
					}

					return {
						  onStart: function( props ) {
							list = props.items; active = 0; cmd = props.command; rect = props.clientRect;
							popup.open();
							paint();
						}
						, onUpdate: function( props ) {
							list = props.items; cmd = props.command; rect = props.clientRect;
							if ( active >= list.length ) { active = 0; }
							paint();
						}
						, onKeyDown: function( props ) {
							const k = props.event.key;
							if ( k === "Escape" )    { popup.close(); return true; }
							if ( !list.length )      { return false; }
							if ( k === "ArrowDown" ) { active = ( active + 1 ) % list.length; paint(); return true; }
							if ( k === "ArrowUp" )   { active = ( active - 1 + list.length ) % list.length; paint(); return true; }
							if ( k === "Enter" || k === "Tab" ) {
								if ( cmd ) { cmd( list[ active ] ); }
								return true;
							}
							return false;
						}
						, onExit: function() { popup.close(); list = []; cmd = null; }
					};
				}
			} ) ];
		}
	} );
}

// ---- The popup ---------------------------------------------------------------
// Appended to <body>, positioned from the caret rect suggestion hands us. On
// <body> rather than inside the container so a capped-height or overflow-hidden
// field cannot clip it - the same reason the picker overlays live there.
function createPopup() {
	let el = null;

	function ensure() {
		if ( el ) { return el; }
		el = document.createElement( "div" );
		el.className = "tiptap-slash-menu";
		el.setAttribute( "role", "listbox" );
		el.setAttribute( "aria-label", t( "slash.title" ) );
		document.body.appendChild( el );
		return el;
	}

	return {
		  // Only makes it visible - positioning happens in move(), after render(),
		  // because it needs the rendered height.
		  open: function() { ensure().classList.add( "is-open" ); }

		, move: function( getRect ) {
			if ( !el ) { return; }
			const r = typeof getRect === "function" ? getRect() : getRect;
			if ( !r ) { return; }
			// Measured now, with content in place (see paint()).
			const h = el.offsetHeight;
			const w = el.offsetWidth;
			// Below the caret by preference; above when that would overflow the
			// viewport, and clamped if it will not comfortably fit either way.
			let top = r.bottom + 6;
			if ( top + h > window.innerHeight - 8 ) {
				const above = r.top - h - 6;
				top = above >= 8 ? above : Math.max( 8, window.innerHeight - h - 8 );
			}
			let left = r.left;
			if ( left + w > window.innerWidth - 8 ) { left = Math.max( 8, window.innerWidth - w - 8 ); }
			el.style.top  = Math.round( top ) + "px";
			el.style.left = Math.round( left ) + "px";
		}

		, render: function( items, active, pick ) {
			const box = ensure();
			box.innerHTML = "";

			if ( !items.length ) {
				const empty = document.createElement( "div" );
				empty.className = "tiptap-slash-empty";
				empty.textContent = t( "slash.empty" );
				box.appendChild( empty );
				return;
			}

			let lastGroup = null;
			items.forEach( function( it, i ) {
				if ( it.group !== lastGroup ) {
					lastGroup = it.group;
					const h = document.createElement( "div" );
					h.className = "tiptap-slash-group";
					h.textContent = t( "slash.group." + it.group );
					box.appendChild( h );
				}

				const row = document.createElement( "div" );
				row.className = "tiptap-slash-item" + ( i === active ? " is-active" : "" );
				row.setAttribute( "role", "option" );
				row.setAttribute( "aria-selected", i === active ? "true" : "false" );

				const ico = document.createElement( "span" );
				ico.className = "tiptap-slash-icon";
				ico.innerHTML = ICONS[ it.icon ] || "";
				row.appendChild( ico );

				const txt = document.createElement( "span" );
				txt.className = "tiptap-slash-text";
				const lbl = document.createElement( "span" );
				lbl.className = "tiptap-slash-label";
				lbl.textContent = it.label;
				txt.appendChild( lbl );
				if ( it.hint ) {
					const hint = document.createElement( "span" );
					hint.className = "tiptap-slash-hint";
					hint.textContent = it.hint;
					txt.appendChild( hint );
				}
				row.appendChild( txt );

				// mousedown-preventDefault keeps the editor selection: the suggestion
				// range is resolved against it, so losing focus would break the insert.
				row.addEventListener( "mousedown", e => e.preventDefault() );
				row.addEventListener( "click", function( e ) { e.preventDefault(); pick( i ); } );
				box.appendChild( row );
			} );

			// Keep the highlighted row in view for keyboard-only use.
			const activeEl = box.querySelector( ".tiptap-slash-item.is-active" );
			if ( activeEl && activeEl.scrollIntoView ) { activeEl.scrollIntoView( { block: "nearest" } ); }
		}

		, close: function() { if ( el ) { el.classList.remove( "is-open" ); el.innerHTML = ""; } }
	};
}
