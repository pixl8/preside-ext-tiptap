/**
 * Content stylesheet handling (the CKEditor `contentsCss` / Preside `stylesheets`
 * equivalent).
 *
 * THE EDITABLE GETS THE STYLESHEET UNMODIFIED, as a plain <link> inside the
 * editing iframe (src/editorFrame.js) - exactly what CKEditor did. No scoping, no
 * selector rewriting, no unit rebasing. That is the whole point of the frame:
 * `html`/`:root`/`body` selectors match because the frame HAS an html and a body,
 * `rem` resolves against the frame's own root, and `vw`/media queries resolve
 * against the frame's own box.
 *
 * The TRANSFORMED path below survives for ONE consumer: the Format/Styles
 * dropdown previews (`.tiptap-fmt-preview`), which are toolbar chrome in the HOST
 * document and cannot be inside the frame. They are decorative - a preview that
 * is slightly off is a cosmetic issue, where the editable being off was a
 * fidelity bug - but the transforms are still needed to get them close:
 *
 *  1. `html` / `:root` / `body` selectors are mapped ONTO the preview element.
 *     A site sets its content font with `body{font-family}`; scoped naively as a
 *     descendant that matches nothing, because there is no <body> in a preview.
 *  2. `rem` is rebased to px. The host admin root is `html{font-size:10px}`
 *     (Ace/bootstrap), not the 16px the frame has, so a rem-based preview came
 *     out at 62.5% of its size. Nothing in CSS can rebase rem for a subtree -
 *     not scoping, not shadow DOM; only a separate document can, which is
 *     precisely why the editable is in one and the preview still needs this.
 *
 * Uses the browser CSSOM to parse robustly (handles @media/@supports/@font-face).
 * If a sheet can't be fetched (cross-origin without CORS) the previews simply go
 * unstyled - the editable is unaffected either way, since its <link> does not
 * depend on us being able to read the bytes.
 */

// The transformed copy is for the dropdown previews ONLY - the editable is served
// by an unmodified <link> in the frame (injectFrameStyles below).
const SCOPES = [ ".tiptap-fmt-preview" ];

/**
 * The editable's copy: the sheet as the site wrote it, in the frame's own head.
 *
 * Deliberately a <link> and not a fetched-and-inlined <style>: it keeps the
 * bytes byte-identical, it shares the browser cache with the site itself, and it
 * works cross-origin. The frame's auto-height re-measures on load, since a late
 * stylesheet changes the content height.
 */
export function injectFrameStyles( doc, stylesheetsCsv, onLoad ) {
	if ( !doc || !stylesheetsCsv ) { return; }
	urlList( stylesheetsCsv ).forEach( function( url ) {
		if ( doc.querySelector( 'link[data-preside-content-css="' + cssAttr( url ) + '"]' ) ) { return; }
		const link = doc.createElement( "link" );
		link.rel = "stylesheet";
		link.href = url;
		link.setAttribute( "data-preside-content-css", url );
		if ( onLoad ) { link.addEventListener( "load", onLoad ); }
		doc.head.appendChild( link );
	} );
}

function urlList( csv ) {
	return String( csv ).split( "," ).map( s => s.trim() ).filter( Boolean );
}

// Raw selectors harvested from the fetched content stylesheets — the Styles
// dropdown (CKEditor stylesheetParser equivalent) filters these against
// stylesheetParser_validSelectors. Populated asynchronously as sheets load.
const contentSelectors = [];

export function getContentSelectors() { return contentSelectors; }

function collectSelectors( rules ) {
	for ( let i = 0; i < rules.length; i++ ) {
		const rule = rules[ i ];
		if ( rule.type === 1 /* STYLE_RULE */ ) {
			if ( contentSelectors.indexOf( rule.selectorText ) === -1 ) { contentSelectors.push( rule.selectorText ); }
		} else if ( rule.cssRules && rule.cssRules.length ) {
			collectSelectors( rule.cssRules );
		}
	}
}

// The preview copy. Failure is silent by design: the editable has its own
// unmodified <link> in the frame and does not depend on this succeeding.
export function applyContentStyles( stylesheetsCsv ) {
	if ( !stylesheetsCsv ) { return; }
	const urls = urlList( stylesheetsCsv );

	urls.forEach( function( url ) {
		if ( document.querySelector( 'style[data-preside-content-css="' + cssAttr( url ) + '"]' ) ) { return; } // already injected

		fetch( url, { credentials: "same-origin" } )
			.then( r => r.ok ? r.text() : Promise.reject() )
			.then( function( css ) {
				const style = document.createElement( "style" );
				style.setAttribute( "data-preside-content-css", url );
				style.textContent = scopeCss( css, SCOPES );
				document.head.appendChild( style );
			} )
			.catch( function() {
				// Previews go unstyled. There used to be an "unscoped <link>" fallback
				// here, on the reasoning that bleeding beat no styling - but it dumped a
				// whole site stylesheet into the ADMIN's head, restyling the admin UI
				// itself. The editable no longer depends on this path at all (it has its
				// own unmodified <link> inside the frame), so the only thing the
				// fallback could still buy is a styled dropdown preview, which is not
				// worth that.
			} );
	} );
}

function cssAttr( s ) { return String( s ).replace( /"/g, "&quot;" ); }

// Parse via CSSOM and re-serialise with each selector prefixed by every scope.
function scopeCss( css, scopes ) {
	const probe = document.createElement( "style" );
	probe.textContent = css;
	document.head.appendChild( probe );
	let out = "";
	try {
		collectSelectors( probe.sheet.cssRules );
		out = serialiseRules( probe.sheet.cssRules, scopes, remBase( probe.sheet.cssRules ) );
	} catch ( e ) {
		out = css; // last resort: inject as-is
	} finally {
		document.head.removeChild( probe );
	}
	return out;
}

function serialiseRules( rules, scopes, base ) {
	let out = "";
	for ( let i = 0; i < rules.length; i++ ) {
		const rule = rules[ i ];
		if ( rule.type === 1 /* STYLE_RULE */ ) {
			const scoped = [];
			rule.selectorText.split( "," ).forEach( function( s ) {
				scopes.forEach( function( sc ) { scoped.push( scopeSelector( s, sc ) ); } );
			} );
			out += scoped.join( "," ) + "{" + declarations( rule.style, base ) + "}";
		} else if ( rule.type === 4 /* MEDIA_RULE */ ) {
			// NB the media query's own lengths are left alone: `rem` in a media
			// query always resolves against the initial font size, in the admin
			// page exactly as in the iframe.
			out += "@media " + rule.media.mediaText + "{" + serialiseRules( rule.cssRules, scopes, base ) + "}";
		} else if ( rule.type === 12 /* SUPPORTS_RULE */ ) {
			out += "@supports " + rule.conditionText + "{" + serialiseRules( rule.cssRules, scopes, base ) + "}";
		} else if ( rule.cssText ) {
			out += rule.cssText; // @font-face, @keyframes, @import, etc. — pass through
		}
	}
	return out;
}

// `html` / `:root` / `body` (and `html > body`, `html body p`, ...) refer to what
// IS the editable here, so they replace the scope's last element rather than
// becoming a descendant of it. Any qualifier on them is kept ON the scope
// (`body.night p` -> `<scope>.night p`), which matches nothing - just as it did
// not match CKEditor's own iframe body.
const ROOT_TOKEN = /^(?:html|:root|body)(?![-\w])/i;
const QUALIFIER  = /^(?:\.[-\w]+|#[-\w]+|\[[^\]]*\]|::?[-\w]+(?:\([^)]*\))?)/;

export function scopeSelector( selector, scope ) {
	let rest = String( selector ).trim(), quals = "", isRoot = false, m;

	while ( ROOT_TOKEN.test( rest ) ) {
		isRoot = true;
		rest = rest.replace( ROOT_TOKEN, "" );
		while ( ( m = QUALIFIER.exec( rest ) ) ) { quals += m[ 0 ]; rest = rest.slice( m[ 0 ].length ); }
		rest = rest.replace( /^\s*>?\s*/, "" ); // `html > body`, `body p` — descend
	}

	if ( !isRoot )    { return scope + " " + rest; }
	if ( rest.length ) { return scope + quals + " " + rest; }
	return scope + quals;
}

// The rem base the sheet would have had inside CKEditor's iframe: its own
// html/:root font-size, else the browser default. `body{font-size}` is
// deliberately ignored — it never affected rem.
const REM_LENGTH  = /(-?(?:\d*\.)?\d+)rem\b/gi;
const HTML_TOKEN  = /^(?:html|:root)(?![-\w])/i;
const DEFAULT_REM = 16;

export function remBase( rules ) {
	let base = DEFAULT_REM;
	for ( let i = 0; i < rules.length; i++ ) {
		const rule = rules[ i ];
		if ( rule.type !== 1 /* STYLE_RULE */ ) { continue; }
		const size = rule.style && rule.style.getPropertyValue( "font-size" );
		if ( !size ) { continue; }
		const isRoot = rule.selectorText.split( "," ).some( function( s ) {
			s = s.trim();
			return HTML_TOKEN.test( s ) && s.replace( HTML_TOKEN, "" ).trim() === "";
		} );
		if ( isRoot ) { base = toPx( size, base ) || base; }
	}
	return base;
}

function toPx( value, current ) {
	const m = /^(-?(?:\d*\.)?\d+)(px|pt|%|r?em)?$/.exec( String( value ).trim() );
	if ( !m ) { return 0; }
	const n = parseFloat( m[ 1 ] );
	switch ( m[ 2 ] ) {
		case "pt"  : return n * 4 / 3;
		case "%"   : return n / 100 * DEFAULT_REM; // relative to the browser default
		case "em"  :
		case "rem" : return n * DEFAULT_REM;
		default    : return n;
	}
}

// Serialise a rule's declarations, rebasing rem lengths to px. Iterated
// property-by-property rather than regexed over `cssText` so quoted values
// (`content`) and url() payloads are never touched.
function declarations( style, base ) {
	let out = "";
	for ( let i = 0; i < style.length; i++ ) {
		const prop = style.item( i );
		let value  = style.getPropertyValue( prop );
		const pri  = style.getPropertyPriority( prop );
		if ( base && prop !== "content" && value.indexOf( "url(" ) === -1 ) {
			value = value.replace( REM_LENGTH, function( _, n ) { return ( parseFloat( n ) * base ) + "px"; } );
		}
		out += prop + ":" + value + ( pri ? " !" + pri : "" ) + ";";
	}
	return out;
}
