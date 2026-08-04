/**
 * Content stylesheet handling (the CKEditor `contentsCss` / Preside `stylesheets`
 * equivalent).
 *
 * CKEditor renders content inside an <iframe>, so it can load the site/app content
 * CSS there without affecting the admin chrome. Tiptap edits in the page DOM, so we
 * fetch each stylesheet and re-inject it with every selector SCOPED to the editor
 * mount (`.tiptap-editor-mount .ProseMirror`). This gives WYSIWYG fidelity without
 * the app CSS bleeding into the admin UI.
 *
 * Uses the browser CSSOM to parse robustly (handles @media/@supports/@font-face);
 * falls back to an unscoped <link> only if the stylesheet can't be fetched (e.g.
 * cross-origin without CORS).
 *
 * Two things the iframe gave for free and scoping has to reproduce:
 *
 *  1. `html` / `:root` / `body` selectors ARE the editable. In CKEditor the
 *     iframe's <body> was the editing surface, so a content stylesheet's
 *     `body{font-family:...}` - how nearly every site sets its content font -
 *     styled the content. Scoped naively as a DESCENDANT it matches nothing:
 *     there is no <body> inside the editable. That was the "the body font is the
 *     admin's, but it picked up my heading font" symptom. scopeSelector() maps
 *     those tokens ONTO the scope instead.
 *  2. `rem` resolves against the DOCUMENT root, which in the Preside admin is
 *     `html{font-size:10px}` (Ace/bootstrap), not the 16px an iframe with no
 *     html rule had. Nothing in CSS can rebase rem for a subtree - not scoping,
 *     not shadow DOM - so rem lengths are converted to px at injection time
 *     against the base the sheet itself would have had in the iframe: its own
 *     `html`/`:root` font-size if it declares one, else 16px.
 */

// Apply content CSS to the editing surface AND to the Format/Styles dropdown
// previews, so menu items render in the real content styles (e.g. a green H2)
// exactly like CKEditor.
const SCOPES = [ ".tiptap-editor-mount .ProseMirror", ".tiptap-fmt-preview" ];

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

export function applyContentStyles( stylesheetsCsv ) {
	if ( !stylesheetsCsv ) { return; }
	const urls = String( stylesheetsCsv ).split( "," ).map( s => s.trim() ).filter( Boolean );

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
				// Fallback: load unscoped (may bleed, but better than no styling).
				if ( document.querySelector( 'link[data-preside-content-css="' + cssAttr( url ) + '"]' ) ) { return; }
				const link = document.createElement( "link" );
				link.rel = "stylesheet";
				link.href = url;
				link.setAttribute( "data-preside-content-css", url );
				document.head.appendChild( link );
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
