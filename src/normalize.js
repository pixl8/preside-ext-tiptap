/**
 * Output normaliser — bring Tiptap's persisted HTML closer to CKEditor's stored
 * form, so migrating an existing CKEditor-authored corpus produces clean diffs
 * rather than churn/bloat. Applied in getData() AFTER tokenize().
 *
 * Handles the *structural* divergences (not cosmetic whitespace, which the browser
 * renders identically):
 *   - unwrap a single attribute-less <p> inside <li>/<td>/<th>/<blockquote>
 *     (StarterKit wraps block content in <p>; CKEditor stores it bare)
 *   - slim Tiptap table markup (drop <colgroup>, min-width style, default
 *     colspan/rowspan="1")
 *   - drop a trailing empty <p></p> that setContent can append
 *
 * Must stay idempotent: normalize(normalize(x)) === normalize(x). A <p> carrying a
 * class/style is left wrapped so those attributes are never lost.
 */

export function normalizeOutput( html, opts ) {
	if ( !html ) { return ""; }
	opts = opts || {};

	const root = document.createElement( "div" );
	root.innerHTML = html;

	// Unwrap single, attribute-less <p> inside block containers.
	root.querySelectorAll( "li, td, th, blockquote" ).forEach( function( el ) {
		const kids = elementChildren( el );
		if ( kids.length === 1 && kids[ 0 ].tagName === "P" && kids[ 0 ].attributes.length === 0 ) {
			unwrap( kids[ 0 ] );
		}
	} );

	// Slim tables.
	root.querySelectorAll( "table" ).forEach( function( t ) {
		t.removeAttribute( "style" );
		const cg = t.querySelector( ":scope > colgroup" );
		if ( cg ) { cg.remove(); }
	} );
	root.querySelectorAll( "td, th" ).forEach( function( c ) {
		if ( c.getAttribute( "colspan" ) === "1" ) { c.removeAttribute( "colspan" ); }
		if ( c.getAttribute( "rowspan" ) === "1" ) { c.removeAttribute( "rowspan" ); }
	} );

	// Drop a trailing empty paragraph.
	const last = root.lastElementChild;
	if ( last && last.tagName === "P" && last.innerHTML.trim() === "" ) { last.remove(); }

	// enterMode=br (CKEditor ENTER_BR): paragraphs are not the line separator -
	// unwrap every top-level attribute-less <p>, joining consecutive ones with
	// <br />, matching what CKEditor stores for such fields.
	if ( opts.enterMode === "br" ) {
		let prevWasP = false;
		Array.prototype.slice.call( root.children ).forEach( function( el ) {
			const isBareP = el.tagName === "P" && el.attributes.length === 0;
			if ( isBareP && prevWasP ) { root.insertBefore( document.createElement( "br" ), el ); }
			if ( isBareP ) { unwrap( el ); }
			prevWasP = isBareP;
		} );
	} else if ( isFalse( opts.autoParagraph ) ) {
		// autoParagraph=false: CKEditor does not wrap lone inline content in <p>.
		// Mirror that when the whole document is a single attribute-less paragraph.
		const kids = elementChildren( root );
		if ( kids.length === 1 && kids[ 0 ].tagName === "P" && kids[ 0 ].attributes.length === 0 ) {
			unwrap( kids[ 0 ] );
		}
	}

	return root.innerHTML;
}

function isFalse( v ) {
	return v === false || v === "false" || v === 0;
}

function elementChildren( el ) {
	// Ignore whitespace-only text nodes (getHTML is compact, but be safe).
	const out = [];
	for ( let i = 0; i < el.childNodes.length; i++ ) {
		const n = el.childNodes[ i ];
		if ( n.nodeType === 1 ) { out.push( n ); }
		else if ( n.nodeType === 3 && n.nodeValue.trim() !== "" ) { out.push( n ); }
	}
	return out;
}

function unwrap( el ) {
	const parent = el.parentNode;
	while ( el.firstChild ) { parent.insertBefore( el.firstChild, el ); }
	parent.removeChild( el );
}
