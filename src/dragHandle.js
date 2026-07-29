/**
 * Notion-style block drag handle: hovering a block shows a grip in the left
 * gutter; dragging it reorders the block, clicking it selects the block.
 *
 * HAND-ROLLED DELIBERATELY - do not "simplify" this to
 * @tiptap/extension-drag-handle. That package is MIT in v3, but it hard-imports
 * @tiptap/extension-collaboration + @tiptap/y-tiptap, so the build fails without
 * them and installing them drags real Yjs runtime code into the bundle:
 * measured at +139kb (+30% of the vendor bundle) for an editor that does zero
 * collaboration. Everything it would give us is already in what we ship -
 * nodeDOM for positioning, NodeSelection for the drag, prosemirror-dropcursor
 * (via StarterKit) for the drop indicator.
 *
 * CHROME ONLY - the handle lives on .tiptap-editor-container, never in the
 * editable, so getData() is unaffected by its existence. A drag is of course a
 * real edit, but it is an ordinary ProseMirror move: tokens survive byte-for-byte
 * and undo restores exactly (both covered in test-realworld.html).
 */
import { ICONS } from "./icons.js";
import { t } from "./i18n.js";

// Opt out per site/field, matching the wordcount / outline / tableTools opt-outs.
export function dragHandleEnabled( cfg ) {
	return !( cfg && cfg.defaultConfigs && cfg.defaultConfigs.dragHandle === false );
}

/**
 * @param editor     the Tiptap editor
 * @param container  .tiptap-editor-container (positioning parent + gutter class)
 * @param mount      .tiptap-editor-mount (the scroller)
 */
export function createDragHandle( editor, container, mount ) {
	// The gutter only exists when the handle does, so opting out leaves the
	// editable's padding exactly as it was.
	container.classList.add( "tiptap-has-draghandle" );

	const handle = document.createElement( "button" );
	handle.type = "button";
	handle.className = "tiptap-drag-handle";
	handle.draggable = true;
	handle.title = t( "draghandle.tooltip" );
	handle.setAttribute( "aria-label", t( "draghandle.tooltip" ) );
	handle.innerHTML = ICONS.DragGrip;
	container.appendChild( handle );

	let current = null;   // { node, offset, dom, rect }
	let dragging = false;

	/**
	 * The top-level block whose DOM box contains this viewport Y.
	 *
	 * Deliberately iterating the doc's own children rather than using
	 * view.posAtCoords: we want the TOP-LEVEL block (the draggable unit), and
	 * posAtCoords returns the innermost position, so a paragraph inside a list
	 * item or a table cell would have to be climbed back up - fiddly, and it
	 * behaves differently for leaf nodes like our embeds. Every top-level block
	 * has DOM (verified), so the boxes are authoritative.
	 */
	function blockAtY( y ) {
		let found = null;
		editor.state.doc.forEach( function( node, offset ) {
			if ( found ) { return; }
			const dom = editor.view.nodeDOM( offset );
			if ( !dom || !dom.getBoundingClientRect ) { return; }
			const rect = dom.getBoundingClientRect();
			if ( y >= rect.top - 2 && y <= rect.bottom + 2 ) {
				found = { node: node, offset: offset, dom: dom, rect: rect };
			}
		} );
		return found;
	}

	function hide() {
		if ( dragging ) { return; }   // never yank the grip out from under a drag
		current = null;
		handle.classList.remove( "is-visible" );
	}

	function show( block ) {
		const cRect = container.getBoundingClientRect();
		const mRect = mount.getBoundingClientRect();

		// Don't hover-show a block scrolled out of the (capped-height) mount.
		if ( block.rect.bottom < mRect.top || block.rect.top > mRect.bottom ) { hide(); return; }

		current = block;

		// Align to the block's first line rather than its centre: a tall block (a
		// list, a big image) with a centred grip reads as belonging to nothing.
		const size = handle.offsetHeight || 20;
		let top = block.rect.top - cRect.top + 2;
		// Keep it within the visible mount, so a half-scrolled block's grip does
		// not float over the toolbar.
		const minTop = mRect.top - cRect.top;
		const maxTop = mRect.bottom - cRect.top - size;
		if ( top < minTop ) { top = minTop; }
		if ( top > maxTop ) { top = maxTop; }

		handle.style.top = Math.round( top ) + "px";
		handle.classList.add( "is-visible" );
	}

	function onMove( e ) {
		if ( !editor.isEditable || dragging ) { return; }
		const block = blockAtY( e.clientY );
		if ( block ) { show( block ); } else { hide(); }
	}

	// Hovering the handle itself must not count as leaving the block (the handle
	// sits in the gutter, outside the editable), so listen on the container and
	// only hide when the pointer leaves the whole thing.
	container.addEventListener( "mousemove", onMove );
	container.addEventListener( "mouseleave", hide );
	mount.addEventListener( "scroll", hide, { passive: true } );

	// Clicking the grip selects the whole block - which is also what makes the
	// image tools / table bubble appear for it, so the grip doubles as "select
	// this thing".
	handle.addEventListener( "click", function( e ) {
		e.preventDefault();
		selectCurrent();
	} );

	function selectCurrent() {
		if ( !current || !window.PresideTiptap || !window.PresideTiptap.NodeSelection ) { return false; }
		const NodeSelection = window.PresideTiptap.NodeSelection;
		try {
			const sel = NodeSelection.create( editor.state.doc, current.offset );
			editor.view.dispatch( editor.state.tr.setSelection( sel ) );
			editor.view.focus();
			return true;
		} catch ( err ) { return false; }
	}

	handle.addEventListener( "dragstart", function( e ) {
		if ( !current ) { e.preventDefault(); return; }

		// Select the node first: ProseMirror's own drop handling moves whatever
		// view.dragging says is being dragged, and a NodeSelection's content is
		// exactly the block.
		if ( !selectCurrent() ) { e.preventDefault(); return; }

		dragging = true;
		handle.classList.add( "is-dragging" );

		const slice = editor.view.state.selection.content();
		editor.view.dragging = { slice: slice, move: true };

		if ( e.dataTransfer ) {
			e.dataTransfer.effectAllowed = "move";
			// Some browsers cancel a drag with no data attached.
			try { e.dataTransfer.setData( "text/html", current.dom.outerHTML ); } catch ( err ) {}
			// Drag the block itself as the ghost, so it is obvious what is moving.
			try { e.dataTransfer.setDragImage( current.dom, 12, 12 ); } catch ( err ) {}
		}
	} );

	handle.addEventListener( "dragend", function() {
		dragging = false;
		handle.classList.remove( "is-dragging" );
		editor.view.dragging = null;
		hide();
	} );

	editor.on( "destroy", function() {
		container.removeEventListener( "mousemove", onMove );
		container.removeEventListener( "mouseleave", hide );
		mount.removeEventListener( "scroll", hide );
	} );

	return handle;
}
