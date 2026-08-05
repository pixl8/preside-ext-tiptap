<!---@feature admin--->
<!---
	Extension view override (preside-ext-tiptap).

	Core Preside only includes the "ckeditor" asset. This extension re-points that
	id at the Tiptap vendor bundle (see assets/StickerBundle.cfc) and additionally
	needs the Tiptap facade + css on the page. Sticker only emits an asset that is
	explicitly included, so this override adds the two extra includes. Ordering
	(facade AFTER /js/admin/presidecore/) is handled by the .after() rule on the
	bundle, so where include() is called here does not matter.

	This override lives in the extension - core views are left untouched.
--->
<cfscript>
	ckeditorSettings = getSetting( name="ckeditor", defaultValue={} );
	configFile       = ckeditorSettings.defaults.configFile ?: "/ckeditorExtensions/config.js";
	configFileName   = listFirst( configFile, "?" );

	if ( FileExists( "/assets" & configFileName ) ) {
		configFile = getSetting( name="static.siteAssetsUrl", defaultValue="/assets" ) & configFile;
	} else {
		configFile = event.buildLink( systemStaticAsset = configFile );
	}

	event.include( "ckeditor" );

	// Tiptap drop-in: the facade must load AFTER presidecore so it can override
	// window.PresideRichEditor before formFields.js bootstraps the .richeditor
	// textareas; the tiptap-facade bundle rule enforces that ordering.
	event.include( "tiptap-facade" );
	event.include( "tiptap-css" );

	// i18n: CKEditor 4 shipped its own language packs; Tiptap's UI strings are
	// translated HERE (admin user locale) via the extension's i18n/tiptap.properties
	// bundle and shipped to the facade as cfrequest.tiptapI18n. Keep this key list
	// in sync with i18n/tiptap.properties + src/i18n.js (the JS falls back to its
	// built-in English defaults for any missing/empty key).
	tiptapI18nKeys = [
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
		, "styles.none"
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
	];
	tiptapI18n = {};
	for ( tiptapI18nKey in tiptapI18nKeys ) {
		tiptapI18n[ tiptapI18nKey ] = translateResource( uri="tiptap:#tiptapI18nKey#", defaultValue="" );
	}

	// Widget list for the "/" insert menu (src/slashMenu.js), so "/news" can offer
	// the news widget by name rather than only "Widget…". Emitted here rather than
	// fetched over ajax because we already render server-side once per page and the
	// data is small - no new endpoint, same pattern as tiptapI18n above.
	//
	// widgetCategories is a PER-FIELD setting while this view renders once per page,
	// so we emit each widget WITH its categories and let the client filter per field
	// (slashMenu.js widgetItems). The categories we can know about here are the
	// "default" one - which is also what a field with no explicit categories
	// resolves to (WidgetsService._isWidgetInCategories) - plus anything the site
	// configures. A field naming some other category still gets the "Widget…" entry,
	// so no widget is ever unreachable; it just loses the by-name shortcut.
	tiptapWidgets = [];
	try {
		widgetsService  = getModel( "widgetsService" );
		slashCategories = [ "default" ];
		for ( slashCategory in listToArray( ckeditorSettings.defaults.defaultConfigs.widgetCategories ?: "" ) ) {
			if ( !slashCategories.findNoCase( trim( slashCategory ) ) ) {
				slashCategories.append( trim( slashCategory ) );
			}
		}

		slashWidgets       = widgetsService.getWidgets( categories=slashCategories );
		activeSiteTemplate = isFeatureEnabled( "sites" ) ? getModel( "siteService" ).getActiveSiteTemplate() : "";

		for ( slashWidgetId in slashWidgets ) {
			slashWidget = slashWidgets[ slashWidgetId ];

			// Mirrors core's Widgets._getSortedAndTranslatedWidgets: skip widgets not
			// available to the active site template, and translate for this admin user.
			if ( isFeatureEnabled( "sites" ) && slashWidget.siteTemplates != "*" && !listFindNoCase( slashWidget.siteTemplates ?: "", activeSiteTemplate ) ) {
				continue;
			}

			tiptapWidgets.append( {
				  id          = slashWidgetId
				, title       = translateResource( uri=slashWidget.title      , defaultValue=slashWidgetId )
				, description = translateResource( uri=slashWidget.description, defaultValue="" )
				, categories  = slashWidget.categories ?: []
			} );
		}

		tiptapWidgets.sort( function( a, b ){
			return a.title == b.title ? 0 : ( a.title > b.title ? 1 : -1 );
		} );
	} catch ( any e ) {
		// The slash menu is a convenience; a site with an unusual widget setup must
		// not take the whole editor down with it. Falling back to an empty list just
		// means "/" offers the picker entry without the by-name shortcuts.
		tiptapWidgets = [];
	}

	event.includeData( {
		  tiptapI18n                    = tiptapI18n
		, tiptapWidgets                 = tiptapWidgets
		, ckeditorConfig                = configFile
		, ckeditorDefaultToolbar        = ckeditorSettings.defaults.toolbar               ?: ""
		, ckeditorDefaultWidth          = ckeditorSettings.defaults.width                 ?: "auto"
		, ckeditorDefaultMinHeight      = ckeditorSettings.defaults.minHeight             ?: "auto"
		, ckeditorDefaultMaxHeight      = ckeditorSettings.defaults.maxHeight             ?: 300
		, ckeditorAutoParagraph         = ckeditorSettings.defaults.autoParagraph         ?: true
		, ckeditorDefaultConfigs        = ckeditorSettings.defaults.defaultConfigs        ?: {}
	} );
</cfscript>
