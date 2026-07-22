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

	event.includeData( {
		  ckeditorConfig                = configFile
		, ckeditorDefaultToolbar        = ckeditorSettings.defaults.toolbar               ?: ""
		, ckeditorDefaultWidth          = ckeditorSettings.defaults.width                 ?: "auto"
		, ckeditorDefaultMinHeight      = ckeditorSettings.defaults.minHeight             ?: "auto"
		, ckeditorDefaultMaxHeight      = ckeditorSettings.defaults.maxHeight             ?: 300
		, ckeditorAutoParagraph         = ckeditorSettings.defaults.autoParagraph         ?: true
		, ckeditorDefaultConfigs        = ckeditorSettings.defaults.defaultConfigs        ?: {}
	} );
</cfscript>
