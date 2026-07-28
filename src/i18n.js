/**
 * i18n for the Tiptap editor UI.
 *
 * CKEditor 4 shipped its own language packs and auto-detected the browser
 * locale, so the old editor chrome was localised "for free". This module is
 * the Tiptap equivalent: every user-facing string lives here (English
 * defaults), keyed to match the extension's i18n/tiptap.properties resource
 * bundle. The ckEditorJs.cfm view override translates each key server-side
 * (admin user locale) and ships the result as `cfrequest.tiptapI18n`, so
 * sites localise the editor the standard Preside way - properties files.
 *
 * Lookup order (first non-empty wins):
 *   1. window.cfrequest.tiptapI18n[ key ]   (server-translated, Preside)
 *   2. window.PresideTiptapI18n[ key ]      (manual override, harness/standalone)
 *   3. DEFAULTS[ key ]                      (built-in English)
 *
 * Strings are resolved at RENDER time, never at script-parse time - the
 * cfrequest data block may be emitted after this bundle executes.
 *
 * `t( key, subs )` substitutes `{name}` placeholders from subs.
 */

export const DEFAULTS = {
	  "toolbar.bold"             : "Bold"
	, "toolbar.italic"           : "Italic"
	, "toolbar.underline"        : "Underline"
	, "toolbar.strike"           : "Strikethrough"
	, "toolbar.subscript"        : "Subscript"
	, "toolbar.superscript"      : "Superscript"
	, "toolbar.blockquote"       : "Blockquote"
	, "toolbar.numberedlist"     : "Numbered list"
	, "toolbar.bulletedlist"     : "Bulleted list"
	, "toolbar.outdent"          : "Outdent"
	, "toolbar.indent"           : "Indent"
	, "toolbar.justifyleft"      : "Align left"
	, "toolbar.justifycenter"    : "Align center"
	, "toolbar.justifyright"     : "Align right"
	, "toolbar.justifyblock"     : "Justify"
	, "toolbar.horizontalrule"   : "Horizontal rule"
	, "toolbar.table"            : "Table"
	, "toolbar.removeformat"     : "Remove format"
	, "toolbar.undo"             : "Undo"
	, "toolbar.redo"             : "Redo"
	, "toolbar.maximize"         : "Maximize"
	, "toolbar.presidelink"      : "Link"
	, "toolbar.presideunlink"    : "Unlink"
	, "toolbar.presideanchor"    : "Anchor"
	, "toolbar.widgets"          : "Widget"
	, "toolbar.imagepicker"      : "Image"
	, "toolbar.attachmentpicker" : "Attachment"
	, "toolbar.codesnippet"      : "Code snippet"
	, "toolbar.source"           : "Source"
	, "toolbar.theme.dark"       : "Switch to dark mode"
	, "toolbar.theme.light"      : "Switch to light mode"
	, "toolbar.format"           : "Format"
	, "toolbar.styles"           : "Styles"
	, "styles.none"              : "No styles available"
	, "format.p"                 : "Paragraph"
	, "format.h1"                : "Heading 1"
	, "format.h2"                : "Heading 2"
	, "format.h3"                : "Heading 3"
	, "format.h4"                : "Heading 4"
	, "format.h5"                : "Heading 5"
	, "format.h6"                : "Heading 6"
	, "format.pre"               : "Preformatted"
	, "format.div"               : "Normal (DIV)"
	, "picker.ok"                : "OK"
	, "picker.cancel"            : "Cancel"
	, "picker.close"             : "Close"
	, "picker.link.title"        : "Link"
	, "picker.image.title"       : "Image"
	, "picker.attachment.title"  : "Attachment"
	, "picker.widget.title"      : "Widget"
	, "anchor.dialog.title"      : "Anchor name"
	, "anchor.dialog.placeholder": "e.g. section-2"
	, "anchor.tooltip"           : "Anchor: {name} (double-click to edit)"
	, "embed.edithint"           : "Double-click to edit"
	, "embed.loading.image"      : "loading image..."
	, "embed.loading.attachment" : "loading attachment..."
	, "embed.error"              : "preview error"
	, "footer.words"             : "{count} words"
	, "footer.chars"             : "{count} chars"
	, "footer.readingtime"       : "~{count} min read"
};

function overrides() {
	var cf = window.cfrequest || {};
	return cf.tiptapI18n || window.PresideTiptapI18n || {};
}

export function t( key, subs ) {
	var o = overrides();
	var s = ( o[ key ] !== undefined && o[ key ] !== null && String( o[ key ] ).length ) ? o[ key ] : DEFAULTS[ key ];
	if ( s === undefined || s === null ) { return key; }
	s = String( s );
	if ( subs ) {
		Object.keys( subs ).forEach( function( k ) {
			s = s.split( "{" + k + "}" ).join( String( subs[ k ] ) );
		} );
	}
	return s;
}
