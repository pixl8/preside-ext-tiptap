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
		out = serialiseRules( probe.sheet.cssRules, scopes );
	} catch ( e ) {
		out = css; // last resort: inject as-is
	} finally {
		document.head.removeChild( probe );
	}
	return out;
}

function serialiseRules( rules, scopes ) {
	let out = "";
	for ( let i = 0; i < rules.length; i++ ) {
		const rule = rules[ i ];
		if ( rule.type === 1 /* STYLE_RULE */ ) {
			const scoped = [];
			rule.selectorText.split( "," ).forEach( function( s ) {
				scopes.forEach( function( sc ) { scoped.push( sc + " " + s.trim() ); } );
			} );
			out += scoped.join( "," ) + "{" + rule.style.cssText + "}";
		} else if ( rule.type === 4 /* MEDIA_RULE */ ) {
			out += "@media " + rule.media.mediaText + "{" + serialiseRules( rule.cssRules, scopes ) + "}";
		} else if ( rule.type === 12 /* SUPPORTS_RULE */ ) {
			out += "@supports " + rule.conditionText + "{" + serialiseRules( rule.cssRules, scopes ) + "}";
		} else if ( rule.cssText ) {
			out += rule.cssText; // @font-face, @keyframes, @import, etc. — pass through
		}
	}
	return out;
}
