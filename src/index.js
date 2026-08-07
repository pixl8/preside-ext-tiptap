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
import { Plugin, PluginKey, NodeSelection, TextSelection } from "@tiptap/pm/state";
import { Slice, Fragment, DOMSerializer, DOMParser } from "@tiptap/pm/model";
import { Transform } from "@tiptap/pm/transform";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { createPluginRegistry, API_VERSION } from "./plugins.js";
import { Suggestion } from "@tiptap/suggestion";
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
		// registers Table + TableRow + TableHeader + TableCell.
		//
		// allowTableNodeSelection MUST be true for the block drag handle
		// (src/dragHandle.js) to move a table. prosemirror-tables defaults it to
		// false, which silently NORMALISES AWAY a NodeSelection on a table - so the
		// grip's selection collapsed to a cell inside it, and ProseMirror's
		// move-on-drop deleted that inner selection instead of the table, leaving
		// the original behind: the table was DUPLICATED rather than moved.
		//
		// resizable: drag a column border to set its width. The widths PERSIST -
		// see the table section of normalize.js for exactly what is kept and why.
		, TableKit.configure( { table: {
			  allowTableNodeSelection: true
			, resizable             : true
			, lastColumnResizable   : true
			// MUST match the `min-width` on td/th in src/tiptap.css. The plugin's
			// own default (25) is smaller, which let a column be dragged narrower
			// than the editor will render it - storing a width the editor showed as
			// 44px but the SITE would render at 25px.
			, cellMinWidth           : 44
		  } } )
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
	// ProseMirror primitives the facade needs for view-only decorations (the
	// outline navigator's "you landed here" highlight). A class set directly on
	// the rendered node DOM does not survive ProseMirror's next DOM sync, so
	// anything visual over the document has to be a decoration.
	, Plugin
	, PluginKey
	, Decoration
	, DecorationSet
	// Whole-block selection, for the drag handle (src/dragHandle.js): dragging a
	// block means selecting the node, not a text range.
	, NodeSelection
	// For PLUGINS (see `plugins` below). Nothing in this repo needs these yet, and
	// they cost nothing - all four are already in the bundle via @tiptap/pm, so
	// only the reference is new - but an add-on that puts content anywhere other
	// than straight into the document cannot be written without them:
	//   Slice / Fragment          - hold content OUTSIDE the document (a proposed
	//                               AI rewrite, a diff, a preview) before deciding
	//                               whether to apply it
	//   DOMSerializer / DOMParser - content <-> DOM without going through the
	//                               editor, i.e. without dirtying the form
	//   TextSelection             - place a selection over a range that was
	//                               computed rather than clicked
	//   Transform                 - build a document change and inspect it before
	//                               it is ever dispatched
	, Slice
	, Fragment
	, DOMSerializer
	, DOMParser
	, TextSelection
	, Transform
	// The "/" menu's trigger detection (src/slashMenu.js). @tiptap/suggestion is
	// framework-agnostic - only the popup renderer is ours - and pulls nothing but
	// core/pm/floating-ui, unlike @tiptap/extension-drag-handle (see CLAUDE.md).
	, Suggestion
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
	// The plugin registry for dependent extensions (preside-ext-tiptap-*). It is
	// created HERE, in the first bundle on the page, so a plugin's parse-time
	// register() can never run before the registry exists - see src/plugins.js.
	// `PresideTiptap.api` (the shared helpers) is populated by the FACADE bundle,
	// which is where those helpers live.
	, plugins    : createPluginRegistry()
	, apiVersion : API_VERSION
	, version    : "0.0.1"
};
