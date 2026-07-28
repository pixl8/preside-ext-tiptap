/**
 * Vendor bundle entry - exposes window.PresideTiptap.
 *
 * Wired into Sticker under the id "ckeditor" (replacing the CKEditor lib), so it
 * loads before presidecore. The facade (loaded after presidecore) consumes these
 * globals.
 *
 * Preside extensions (presideLink / presideWidget / presideImage /
 * presideAttachment / presideCodeSnippet) will be added to `extensions` in later
 * phases.
 */
import { Editor, Extension, Node, Mark, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Subscript } from "@tiptap/extension-subscript";
import { Superscript } from "@tiptap/extension-superscript";
import { TextAlign } from "@tiptap/extension-text-align";
import { Placeholder } from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import { createPresideLink } from "./extensions/presideLink.js";
import { createPresideAnchor } from "./extensions/presideAnchor.js";
import { createPresideImage, createPresideAttachment, createPresideWidget } from "./extensions/presideEmbeds.js";
import { createPresideAttributes, createPresideInlineStyle } from "./extensions/presideAttributes.js";

// ---- Pre-presidecore CKEDITOR shim ------------------------------------------
// This bundle is wired into Sticker under the id "ckeditor", so it loads BEFORE
// the presidecore bundle. presidecore's CKEditor `PresideRichEditor` runs
// synchronously at parse time (inside formFields.js's IIFE) - i.e. before our
// facade loads - and references the CKEDITOR global. Without this shim it throws
// "CKEDITOR is not defined", which aborts the rest of formFields.js (popovers,
// date/time pickers, file inputs, ...). Provide a safe no-op surface so that CK
// path completes silently and mounts nothing; the facade (loaded after
// presidecore) then re-scans the pristine textareas and mounts Tiptap.
( function() {
	var CK = window.CKEDITOR = window.CKEDITOR || {};
	CK.instances = CK.instances || {};
	if ( CK.ENTER_P   === undefined ) { CK.ENTER_P   = 1; }
	if ( CK.ENTER_BR  === undefined ) { CK.ENTER_BR  = 2; }
	if ( CK.ENTER_DIV === undefined ) { CK.ENTER_DIV = 3; }
	if ( CK.CTRL      === undefined ) { CK.CTRL      = 0x110000; }
	if ( CK.SHIFT     === undefined ) { CK.SHIFT     = 0x220000; }
	if ( CK.ALT       === undefined ) { CK.ALT       = 0x440000; }
	// preside.iframe.modal.js (nested picker modals: the widget/image "+" and edit
	// pencil) reads `parent.CKEDITOR.document.$` expecting the native document. Real
	// CKEditor exposes it as `CKEDITOR.dom.document.$`; mirror just the `.$` here.
	if ( !CK.document ) { CK.document = { $: document }; }
	if ( typeof CK.on !== "function" ) { CK.on = function() {}; }
	if ( typeof CK.replace !== "function" ) {
		CK.replace = function() {
			return { on: function() {}, getData: function() { return ""; }, setData: function() {}, destroy: function() {} };
		};
	}
} )();

// Simple-content <div> block — backs the "Normal (DIV)" Format entry and
// div-based Styles (core's format_tags default includes div). Only claims divs
// whose children are inline: wrapper divs (which contain blocks) keep today's
// behaviour of being unwrapped, so pasted layout markup is not mangled.
const BLOCK_CHILD = /^(P|DIV|UL|OL|LI|H[1-6]|TABLE|BLOCKQUOTE|PRE|FIGURE|SECTION|ARTICLE|HEADER|FOOTER|ASIDE|NAV|FORM|DL|HR)$/;
const PresideDiv = Node.create( {
	  name    : "presideDiv"
	, group   : "block"
	, content : "inline*"
	, priority: 50
	, parseHTML() {
		return [ {
			  tag     : "div"
			, priority: 40
			, getAttrs: function( el ) {
				for ( let i = 0; i < el.children.length; i++ ) {
					if ( BLOCK_CHILD.test( el.children[ i ].tagName ) ) { return false; }
				}
				return null;
			}
		} ];
	}
	, renderHTML( { HTMLAttributes } ) { return [ "div", mergeAttributes( HTMLAttributes ), 0 ]; }
} );

// Extra rich-text extensions backing the wider Preside toolbar (Phase 4).
function buildRichText( cfg ) {
	cfg = cfg || {};
	const exts = [
		  Subscript
		, Superscript
		, TextAlign.configure( { types: [ "heading", "paragraph", "presideDiv" ] } )
		, TableKit   // registers Table + TableRow + TableHeader + TableCell
		, PresideDiv
	];
	if ( cfg.placeholder ) {
		exts.push( Placeholder.configure( { placeholder: cfg.placeholder } ) );
	}
	return exts;
}

window.PresideTiptap = {
	  Editor
	, Extension
	, Node
	, Mark
	, mergeAttributes
	, StarterKit
	, extensions : {
		  createPresideLink        // Phase 2
		, createPresideAnchor      // Phase 2 (anchors)
		, createPresideImage       // Phase 3
		, createPresideAttachment  // Phase 3
		, createPresideWidget      // Phase 3
		, buildRichText            // Phase 4
		, createPresideAttributes  // Phase 4b (class/style on blocks)
		, createPresideInlineStyle // Phase 4b (class/style on spans)
	  }
	, version    : "0.0.1"
};
