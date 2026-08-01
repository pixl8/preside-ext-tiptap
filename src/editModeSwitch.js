/**
 * The admin frontend toolbar's edit-mode switch: Off / Classic / Modern.
 *
 * Core renders a binary "Quick edit" checkbox switch (_adminToolbar.cfm,
 * `#edit-mode-options`) whose delegated handler owns the `_presideEditMode`
 * cookie and the `show-frontend-editors` body class, plus an "e" hotkey that
 * flips it. This module - extension-only, zero core edits - REPLACES the
 * visible switch with a three-option dropdown styled like the adjacent
 * "Draft view" dropdown, while keeping core's checkbox in the DOM (hidden) as
 * the single source of truth for "is editing on": Off/Classic drive it
 * programmatically, so core's cookie restore, delegated handler and hotkey all
 * keep working untouched.
 *
 *   Off     - no editing affordances (checkbox unchecked)
 *   Classic - core's existing behaviour (overlays -> fixed modal editor)
 *   Modern  - inline editing of the page's single rich region (inlineMode.js);
 *             disabled with a tooltip when the page does not qualify.
 *
 * The STYLE (classic vs modern) is ours, in a `_presideEditModeStyle` cookie
 * set the same call shape as core's (`$.cookie( name, value )`, path-scoped
 * identically so the pair travels together). On a non-qualifying page a
 * "modern" cookie is left untouched - Classic renders active, and the next
 * qualifying page resumes Modern.
 *
 * No dropdown JS of our own: core's patched bootstrap binds
 * `[data-toggle$=dropdown]` under `.presidecms` via a document-level delegate,
 * so dynamically-inserted markup just works.
 *
 * Init timing: called on DOMContentLoaded (facade.js), which fires after core's
 * parse-time frontendEditors.js has decoded the region templates, wired its
 * handlers and restored the `_presideEditMode` cookie - we compose on top of
 * that state, never race it.
 */
import { t } from "./i18n.js";
import { ICONS } from "./icons.js";
import { pageQualifies, isActive as inlineActive, enter as enterInline, exit as exitInline } from "./inlineMode.js";

var STYLE_COOKIE = "_presideEditModeStyle";

var ui         = null;  // { checkbox, trigger, triggerLabel, items: { off, classic, modern } }
var suppressed = false; // guards our own programmatic checkbox flips

function jq() { return window.presideJQuery || window.jQuery; }

// ---- Cookie (same shape as core's _presideEditMode handling) -----------------
function getStyle() {
	var $ = jq();
	var v = ( $ && $.cookie ) ? $.cookie( STYLE_COOKIE ) : readRawCookie( STYLE_COOKIE );
	return v === "modern" ? "modern" : "classic";
}
function setStyle( v ) {
	var $ = jq();
	if ( $ && $.cookie ) { $.cookie( STYLE_COOKIE, v ); }
	else { document.cookie = STYLE_COOKIE + "=" + v; }
}
function readRawCookie( name ) {
	var m = document.cookie.match( new RegExp( "(?:^|;\\s*)" + name + "=([^;]*)" ) );
	return m ? decodeURIComponent( m[ 1 ] ) : null;
}

// ---- State --------------------------------------------------------------------
function currentMode() {
	if ( !ui.checkbox.checked ) { return "off"; }
	return inlineActive() ? "modern" : "classic";
}

// Flip core's checkbox without our change listener reacting to it.
function setCheckbox( checked ) {
	if ( ui.checkbox.checked === checked ) { return; }
	suppressed = true;
	try { jq()( ui.checkbox ).prop( "checked", checked ).trigger( "change" ); }
	finally { suppressed = false; }
}

function enterModern() {
	return enterInline( { onExit: onInlineExit } );
}

function onInlineExit( reason ) {
	if ( reason === "cancel" ) {
		// User decision: Cancel/Esc discards the edits AND leaves edit mode.
		setCheckbox( false );
	} else if ( reason === "save" ) {
		// Modern means "the page is editable" - a save is just a checkpoint, so
		// re-enter on the freshly rendered content (core's setContent re-emitted
		// the region; the .content-editor div and its comments are still there).
		if ( ui && ui.checkbox.checked && getStyle() === "modern" && pageQualifies() ) {
			enterModern();
		}
	}
	// "switch": the mode change that requested the exit finishes the job.
	render();
}

function setMode( mode ) {
	if ( mode === "modern" ) {
		if ( !pageQualifies() ) { return; }
		setStyle( "modern" );
		setCheckbox( true );
		if ( !inlineActive() && !enterModern() ) {
			// Could not build the inline editor - fail into Classic, visibly.
			setStyle( "classic" );
		}
	} else if ( mode === "classic" ) {
		setStyle( "classic" );
		if ( inlineActive() ) { exitInline(); }
		setCheckbox( true );
	} else {
		if ( inlineActive() ) { exitInline(); }
		setCheckbox( false );
	}
	render();
}

// ---- Rendering ------------------------------------------------------------------
// Markup cloned from the Draft-view dropdown so the admin toolbar CSS styles it:
// a .dropdown-toggle anchor (orange when non-default) + a .dropdown-menu of
// plain links where the active item carries a check icon.
function render() {
	if ( !ui ) { return; }
	var mode = currentMode();

	ui.trigger.classList.toggle( "orange", mode !== "off" );
	ui.triggerLabel.textContent = " " + ui.coreLabel + ": " + t( "editmode." + mode ) + " ";

	var canModern = pageQualifies();
	Object.keys( ui.items ).forEach( function( m ) {
		var li   = ui.items[ m ];
		var icon = li.querySelector( "i" );
		icon.className = m === mode ? "fa fa-check fa-fw grey smaller-80" : "fa fa-fw smaller-80";
		if ( m === "modern" ) {
			li.classList.toggle( "disabled", !canModern );
			li.querySelector( "a" ).title = canModern ? "" : t( "editmode.modern.unavailable" );
		}
	} );
}

function buildDropdown() {
	var li = document.createElement( "li" );
	li.className = "tiptap-editmode-switch";

	var trigger = document.createElement( "a" );
	trigger.href = "#";
	trigger.className = "dropdown-toggle";
	trigger.setAttribute( "data-toggle", "preside-dropdown" );

	// Our own inline SVG (Tabler "article"), NOT font-awesome's pencil - the
	// pencil already means "Full edit" one control to the right.
	var icon = document.createElement( "span" );
	icon.className = "tiptap-editmode-icon";
	icon.innerHTML = ICONS.EditMode;
	var label = document.createElement( "span" );
	var caret = document.createElement( "i" );
	caret.className = "fa fa-caret-down";
	trigger.appendChild( icon );
	trigger.appendChild( label );
	trigger.appendChild( caret );

	var menu = document.createElement( "ul" );
	menu.className = "user-menu dropdown-menu dropdown-yellow dropdown-caret dropdown-close";

	var items = {};
	// Off first (the default), then Modern before Classic - the modern editor is
	// the one being promoted; Classic is the legacy fallback.
	[ "off", "modern", "classic" ].forEach( function( mode ) {
		var itemLi = document.createElement( "li" );
		var a      = document.createElement( "a" );
		a.href = "#";
		var icon = document.createElement( "i" );
		icon.className = "fa fa-fw smaller-80";
		a.appendChild( icon );
		a.appendChild( document.createTextNode( " " + t( "editmode." + mode ) ) );
		a.addEventListener( "click", function( e ) {
			e.preventDefault();
			if ( mode === "modern" && itemLi.classList.contains( "disabled" ) ) {
				e.stopPropagation(); // keep the menu open on a dead option
				return;
			}
			setMode( mode );
		} );
		itemLi.appendChild( a );
		menu.appendChild( itemLi );
		items[ mode ] = itemLi;
	} );

	li.appendChild( trigger );
	li.appendChild( menu );

	return { li: li, trigger: trigger, triggerLabel: label, items: items };
}

// ---- Init -----------------------------------------------------------------------
export function initEditModeSwitch() {
	var toolbar  = document.getElementById( "preside-admin-toolbar" );
	var checkbox = document.getElementById( "edit-mode-options" );
	if ( !toolbar || !checkbox || ui ) { return; } // admin pages / quick edit disabled / already done

	var toggleAnchor = checkbox.closest( ".edit-mode-toggle-container" );
	var hostLi       = toggleAnchor && toggleAnchor.closest( "li" );
	if ( !toggleAnchor || !hostLi || !hostLi.parentNode ) { return; }

	// Hide - never remove - the original switch: core's delegated handler,
	// cookie restore and "e" hotkey all address this checkbox.
	toggleAnchor.style.display = "none";

	var built = buildDropdown();
	ui = {
		  checkbox    : checkbox
		, trigger     : built.trigger
		, triggerLabel: built.triggerLabel
		, items       : built.items
		// Reuse core's own translated label ("Quick edit") from the hidden control.
		, coreLabel   : ( toggleAnchor.textContent || "" ).trim() || t( "editmode.trigger" )
	};
	hostLi.parentNode.insertBefore( built.li, hostLi );

	// Absorb every other way the checkbox flips - the "e" hotkey, core's cookie
	// restore, other scripts. Document-level so it runs AFTER core's own
	// delegated handler has done its setEditMode() work.
	jq()( document ).on( "change", "#edit-mode-options", function() {
		if ( suppressed ) { render(); return; }
		if ( this.checked ) {
			if ( getStyle() === "modern" && pageQualifies() && !inlineActive() ) { enterModern(); }
		} else if ( inlineActive() ) {
			exitInline();
		}
		render();
	} );

	// Restore: core already restored the checkbox from its cookie; if the user
	// was in Modern, resume it (the whole point of Modern is "this page is
	// editable" - a navigation must not silently demote it to Classic).
	if ( checkbox.checked && getStyle() === "modern" && pageQualifies() ) {
		enterModern();
	}
	render();
}
