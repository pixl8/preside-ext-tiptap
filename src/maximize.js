/**
 * Maximize (full-viewport) toggle for an editor container.
 *
 * `position:fixed` alone is not enough: on the FRONT END the editor is rendered
 * inside `.content-editor-editor-container` (see Preside's
 * views/admin/frontendEditing/_editorTemplate.cfm + frontend/frontendEditor.less),
 * which is itself `position:fixed; max-width:810px; z-index:100`. That ancestor
 * creates a stacking context, so no z-index we set can lift the maximized editor
 * above the admin toolbar (z-index 103) - it renders *under* the bar. And the
 * frontend control is rendered with `width=800`, which the facade applies as an
 * INLINE width on the container, beating `inset:0` - so it grew in height only.
 *
 * So maximizing PORTALS the container to <body> (escaping any ancestor stacking
 * context / containing block) and neutralises the inline width + max-height for
 * the duration, restoring everything - including the exact DOM position - on exit.
 */

// Class put on <html> while any editor is maximized (kills page scrolling behind
// the editor, as CKEditor's maximize plugin did).
const HOST_CLASS = "tiptap-maximized-host";
const MAX_CLASS  = "is-maximized";

export function isMaximized( container ) {
	return !!( container && container.classList.contains( MAX_CLASS ) );
}

function mountOf( container ) {
	return container.querySelector( ".tiptap-editor-mount" );
}

export function enterMaximize( container ) {
	if ( !container || isMaximized( container ) ) { return; }

	var mount       = mountOf( container );
	var placeholder = document.createComment( "tiptap-maximized" );

	container.parentNode.insertBefore( placeholder, container );
	container._ttMaximizeState = {
		  placeholder : placeholder
		, width       : container.style.width
		, maxHeight   : mount ? mount.style.maxHeight : ""
		, overflowY   : mount ? mount.style.overflowY : ""
		, scrollTop   : window.pageYOffset || document.documentElement.scrollTop || 0
	};

	// Inline width/max-height come from the field's width/maxHeight config and
	// would otherwise win over the maximized layout.
	container.style.width = "";
	if ( mount ) { mount.style.maxHeight = ""; mount.style.overflowY = "auto"; }

	document.body.appendChild( container );
	container.classList.add( MAX_CLASS );
	document.documentElement.classList.add( HOST_CLASS );
}

export function exitMaximize( container ) {
	if ( !container ) { return; }

	var state = container._ttMaximizeState;
	container.classList.remove( MAX_CLASS );
	container._ttMaximizeState = null;

	if ( state ) {
		container.style.width = state.width;

		var mount = mountOf( container );
		if ( mount ) {
			mount.style.maxHeight = state.maxHeight;
			mount.style.overflowY = state.overflowY;
		}

		if ( state.placeholder && state.placeholder.parentNode ) {
			state.placeholder.parentNode.insertBefore( container, state.placeholder );
			state.placeholder.parentNode.removeChild( state.placeholder );
		}
		window.scrollTo( 0, state.scrollTop );
	}

	// Only unlock the page once no editor is left maximized.
	if ( !document.querySelector( ".tiptap-editor-container." + MAX_CLASS ) ) {
		document.documentElement.classList.remove( HOST_CLASS );
	}
}

/**
 * Toggle, returning the new maximized state. `editor` (optional) is refocused
 * afterwards - re-parenting a contenteditable drops the selection.
 */
export function toggleMaximize( container, editor ) {
	if ( isMaximized( container ) ) {
		exitMaximize( container );
	} else {
		enterMaximize( container );
	}

	if ( editor ) {
		try { editor.commands.focus(); } catch ( e ) {}
	}
	return isMaximized( container );
}
