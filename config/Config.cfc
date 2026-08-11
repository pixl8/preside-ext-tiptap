/**
 * Preside config for the Tiptap extension.
 *
 * Auto-discovered and merged by Preside (extensions/preside-ext-tiptap/config/Config.cfc).
 * Kept intentionally small: the stored-content contract is unchanged, so the existing
 * settings.ckeditor.* config (toolbars, linkPicker types, defaults) is reused as-is.
 *
 * NB we deliberately do NOT override settings.ckeditor.defaults.configFile: the facade
 * loads and honours custom CKEditor config files (src/customConfig.js), so site
 * overrides of configFile keep working, and the stock /ckeditorExtensions/config.js
 * executes harmlessly (its plugin registration no-ops against the CKEDITOR shim).
 */
component {

	public void function configure( required struct config ) {
		var settings = arguments.config.settings ?: {};

		settings.features.tiptapEditor = { enabled=true };

		// Which rich-editor engine is active (kept explicit for rollout/rollback; unread by core).
		settings.richeditorEngine = "tiptap";

		// ---- Editor UI strings shipped to the client -------------------------
		//
		// CKEditor 4 shipped its own language packs; Tiptap's chrome is localised the
		// normal Preside way instead. views/admin/layout/ckEditorJs.cfm translates
		// every key in THIS list (admin user locale) into cfrequest.tiptapI18n, and
		// src/i18n.js falls back to its built-in English for anything missing.
		//
		// The list lives here, in a setting, rather than in the view, because A VIEW
		// CAN ONLY BE OVERRIDDEN ONCE: two extensions both overriding ckEditorJs.cfm
		// means the last one wins and the other's strings vanish. A dependent
		// extension (preside-ext-tiptap-*) appends its own keys to this setting and
		// needs no view override at all.
		//
		// An entry may name its own resource bundle - "tiptapai:ai.button" - and a
		// bare key defaults to this extension's own "tiptap" bundle. The JS key stays
		// UNPREFIXED either way, so the client never learns which bundle a string
		// came from and src/i18n.js needs no change.
		//
		// APPEND, NEVER ASSIGN - here as well as in a dependent extension. Extension
		// config merges in dependency order, so `dependsOn` should make us run first
		// anyway; writing both defensively means nothing depends on that ordering
		// being what we think it is, and it costs nothing.
		settings.tiptap           = settings.tiptap ?: {};
		settings.tiptap.i18nKeys  = settings.tiptap.i18nKeys ?: [];
		settings.tiptap.i18nKeys.append( [
			  "toolbar.bold", "toolbar.italic", "toolbar.underline", "toolbar.strike"
			, "toolbar.subscript", "toolbar.superscript", "toolbar.blockquote"
			, "toolbar.numberedlist", "toolbar.bulletedlist", "toolbar.outdent", "toolbar.indent"
			, "toolbar.justifyleft", "toolbar.justifycenter", "toolbar.justifyright", "toolbar.justifyblock"
			, "toolbar.align"
			, "toolbar.horizontalrule", "toolbar.table", "toolbar.removeformat"
			, "toolbar.specialchar", "toolbar.find", "toolbar.replace"
			, "toolbar.bidiltr", "toolbar.bidirtl"
			, "toolbar.undo", "toolbar.redo", "toolbar.maximize"
			, "toolbar.presidelink", "toolbar.presideunlink", "toolbar.presideanchor"
			, "toolbar.widgets", "toolbar.imagepicker", "toolbar.attachmentpicker"
			, "toolbar.codesnippet", "toolbar.source", "toolbar.format", "toolbar.styles"
			, "toolbar.theme.dark", "toolbar.theme.light"
			, "styles.none", "styles.block", "styles.inline", "styles.object"
			, "format.panelTitle"
			, "format.p", "format.h1", "format.h2", "format.h3", "format.h4", "format.h5", "format.h6", "format.pre", "format.div"
			, "picker.ok", "picker.cancel", "picker.close"
			, "picker.link.title", "picker.image.title", "picker.attachment.title", "picker.widget.title"
			, "anchor.dialog.title", "anchor.dialog.placeholder", "anchor.tooltip"
			, "embed.edithint", "embed.loading.image", "embed.loading.attachment", "embed.error"
			, "embed.edit", "embed.remove"
			, "image.resize", "image.align.left", "image.align.center", "image.align.right"
			, "image.size.percent", "image.size.original", "image.refresh", "image.edit", "image.remove"
			, "find.title", "find.find", "find.replace", "find.replaceall"
			, "find.findwhat", "find.replacewith", "find.findoptions"
			, "find.matchcase", "find.matchword", "find.matchcyclic"
			, "find.notfound", "find.replaced"
			, "specialchar.title", "specialchar.options"
			, "table.insert", "table.gridsize", "table.gridcell", "table.withheaderrow"
			, "table.column.before", "table.column.after", "table.column.delete"
			, "table.row.before", "table.row.after", "table.row.delete"
			, "table.cells.merge", "table.cells.split"
			, "table.headerrow", "table.headercolumn", "table.delete"
			, "draghandle.tooltip", "draghandle.insert"
			, "slash.title", "slash.empty"
			, "slash.group.format", "slash.group.block", "slash.group.preside", "slash.group.widget"
			, "slash.h1", "slash.h1.hint", "slash.h2", "slash.h2.hint", "slash.h3", "slash.h3.hint"
			, "slash.paragraph", "slash.paragraph.hint", "slash.bulletlist", "slash.bulletlist.hint"
			, "slash.orderedlist", "slash.orderedlist.hint", "slash.blockquote", "slash.blockquote.hint"
			, "slash.codeblock", "slash.codeblock.hint", "slash.hr", "slash.hr.hint"
			, "slash.table", "slash.table.hint", "slash.image", "slash.image.hint"
			, "slash.attachment", "slash.attachment.hint", "slash.widget", "slash.widget.hint"
			, "slash.link", "slash.link.hint", "slash.anchor", "slash.anchor.hint"
			, "outline.title", "outline.empty", "outline.untitled"
			, "footer.words", "footer.chars", "footer.readingtime", "resize.tooltip"
			, "editmode.trigger", "editmode.off", "editmode.classic", "editmode.modern"
			, "editmode.modern.unavailable", "editmode.unsaved.confirm"
			, "bubble.title"
		], true );
	}
}
