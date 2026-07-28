/**
 * PresideAttributes — preserve `class` and `style` on content.
 *
 * StarterKit drops unknown attributes, so content authored in CKEditor with
 * classes/inline-styles (e.g. `<p class="lead">`, `<span class="hl">`) would lose
 * them on save — a round-trip data-loss bug — and class-based content CSS would not
 * apply in the editor. This adds:
 *
 *   createPresideAttributes()  — a global `class`/`style` attribute on block nodes
 *   createPresideInlineStyle() — an inline mark that keeps `<span class|style>`
 *
 * It is also the foundation a stylesheetParser-style "Styles" dropdown would build
 * on (apply a class from the parsed content stylesheet).
 */
import { Extension, Mark, mergeAttributes } from "@tiptap/core";

// Block/text node types that legitimately carry class/style in Preside content.
const BLOCK_TYPES = [
	"paragraph", "heading", "blockquote", "codeBlock",
	"bulletList", "orderedList", "listItem",
	"table", "tableRow", "tableHeader", "tableCell",
	"presideDiv"
];

function passthroughAttr( name ) {
	return {
		  default   : null
		, parseHTML : el => el.getAttribute( name )
		, renderHTML: attrs => attrs[ name ] ? ( { [ name ]: attrs[ name ] } ) : {}
	};
}

export function createPresideAttributes() {
	return Extension.create( {
		name: "presideAttributes",
		addGlobalAttributes() {
			return [ {
				types: BLOCK_TYPES,
				attributes: { "class": passthroughAttr( "class" ), style: passthroughAttr( "style" ) }
			} ];
		}
	} );
}

export function createPresideInlineStyle() {
	return Mark.create( {
		name: "presideInlineStyle",
		priority: 90,        // below the embed nodes + PresideLink
		inclusive: false,

		addAttributes() {
			return { "class": passthroughAttr( "class" ), style: passthroughAttr( "style" ) };
		},

		parseHTML() {
			return [ {
				tag: "span",
				getAttrs: function( el ) {
					// Leave the embed placeholder spans to their own atom nodes.
					if ( el.hasAttribute( "data-preside-image" ) || el.hasAttribute( "data-preside-attachment" ) || el.hasAttribute( "data-preside-widget" ) ) {
						return false;
					}
					// Only claim spans that actually carry class/style worth keeping.
					if ( !el.getAttribute( "class" ) && !el.getAttribute( "style" ) ) { return false; }
					return {};
				}
			} ];
		},

		renderHTML( { HTMLAttributes } ) {
			const attrs = {};
			Object.keys( HTMLAttributes ).forEach( function( k ) {
				if ( HTMLAttributes[ k ] !== null && HTMLAttributes[ k ] !== undefined ) { attrs[ k ] = HTMLAttributes[ k ]; }
			} );
			return [ "span", mergeAttributes( attrs ), 0 ];
		}
	} );
}
