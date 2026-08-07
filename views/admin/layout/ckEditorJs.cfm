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
	// translated HERE (admin user locale) and shipped to the facade as
	// cfrequest.tiptapI18n. The JS falls back to its built-in English defaults for
	// any missing/empty key.
	//
	// THE KEY LIST IS A SETTING (config/Config.cfc: settings.tiptap.i18nKeys), not a
	// literal in this view, because a view can only be overridden ONCE - a second
	// extension overriding ckEditorJs.cfm would silently drop this one's strings.
	// A dependent extension appends its keys to the setting instead, and may name
	// its own resource bundle per entry ("tiptapai:ai.button"); a bare key means
	// this extension's own "tiptap" bundle, so every existing entry is untouched.
	// The JS key stays unprefixed either way - src/i18n.js looks up "ai.button".
	tiptapI18nKeys = getSetting( name="tiptap.i18nKeys", defaultValue=[] );
	tiptapI18n     = {};
	for ( tiptapI18nKey in tiptapI18nKeys ) {
		if ( listLen( tiptapI18nKey, ":" ) > 1 ) {
			tiptapI18nBundle = listFirst( tiptapI18nKey, ":" );
			tiptapI18nJsKey  = listRest(  tiptapI18nKey, ":" );
		} else {
			tiptapI18nBundle = "tiptap";
			tiptapI18nJsKey  = tiptapI18nKey;
		}
		tiptapI18n[ tiptapI18nJsKey ] = translateResource( uri="#tiptapI18nBundle#:#tiptapI18nJsKey#", defaultValue="" );
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
