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
		, "toolbar.horizontalrule", "toolbar.table", "toolbar.removeformat"
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
		, "footer.words", "footer.chars", "footer.readingtime"
	];
	tiptapI18n = {};
	for ( tiptapI18nKey in tiptapI18nKeys ) {
		tiptapI18n[ tiptapI18nKey ] = translateResource( uri="tiptap:#tiptapI18nKey#", defaultValue="" );
	}

	event.includeData( {
		  tiptapI18n                    = tiptapI18n
		, ckeditorConfig                = configFile
		, ckeditorDefaultToolbar        = ckeditorSettings.defaults.toolbar               ?: ""
		, ckeditorDefaultWidth          = ckeditorSettings.defaults.width                 ?: "auto"
		, ckeditorDefaultMinHeight      = ckeditorSettings.defaults.minHeight             ?: "auto"
		, ckeditorDefaultMaxHeight      = ckeditorSettings.defaults.maxHeight             ?: 300
		, ckeditorAutoParagraph         = ckeditorSettings.defaults.autoParagraph         ?: true
		, ckeditorDefaultConfigs        = ckeditorSettings.defaults.defaultConfigs        ?: {}
	} );
</cfscript>
