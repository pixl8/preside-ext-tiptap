/**
 * Content-token conversion.
 *
 * Preside stores rich content with placeholder tokens that the server-side
 * ContentRendererService expands to HTML:
 *
 *   {{image:<urlenc-json>:image}}
 *   {{attachment:<urlenc-json>:attachment}}
 *   {{widget:<id>:<urlenc-json>:widget}}
 *   links (in <a href>):  {{link:…}} | {{asset:…}} | {{custom:…}}   (handled by PresideLink)
 *
 * detokenize (load / setData): turn the image/attachment/widget tokens into the
 *   placeholder <span data-preside-*> elements the nodes' parseHTML recognises.
 *   Mirrors the CKEditor dataFilter text rule. Link/asset/custom tokens live in
 *   href attributes and are left untouched (PresideLink owns them).
 *
 * tokenize (save / getData): turn those placeholder spans (as emitted by the
 *   nodes' renderHTML) straight back into the raw token text. Mirrors downcast.
 */

const IMAGE_RE      = /{{image:[\s\S]*?:image}}/gi;
const ATTACHMENT_RE = /{{attachment:[\s\S]*?:attachment}}/gi;
const WIDGET_RE     = /{{widget:[a-zA-Z$_][a-zA-Z0-9$_]*:[\s\S]*?:widget}}/gi;

function attrEscape( s ) {
	return String( s ).replace( /&/g, "&amp;" ).replace( /"/g, "&quot;" ).replace( /</g, "&lt;" ).replace( />/g, "&gt;" );
}
function embedSpan( dataAttr, cssClass, raw ) {
	return '<span ' + dataAttr + '="true" class="' + cssClass + '" data-raw="' + attrEscape( raw ) + '"></span>';
}

export function detokenize( stored ) {
	if ( !stored ) { return ""; }
	return stored
		.replace( IMAGE_RE,      m => embedSpan( "data-preside-image",      "img-placeholder",        m ) )
		.replace( ATTACHMENT_RE, m => embedSpan( "data-preside-attachment", "attachment-placeholder", m ) )
		.replace( WIDGET_RE,     m => embedSpan( "data-preside-widget",     "widget-placeholder",     m ) );
}

export function tokenize( html ) {
	if ( !html || html.indexOf( "data-raw" ) === -1 ) { return html || ""; }
	// Browser DOM pass: replace each placeholder span with its raw token text.
	// Only our embed nodes carry data-raw (links do not), so this is targeted.
	const tmp = document.createElement( "div" );
	tmp.innerHTML = html;
	const nodes = tmp.querySelectorAll( "[data-raw]" );
	for ( let i = 0; i < nodes.length; i++ ) {
		const el = nodes[ i ];
		el.replaceWith( document.createTextNode( el.getAttribute( "data-raw" ) ) );
	}
	return tmp.innerHTML;
}
