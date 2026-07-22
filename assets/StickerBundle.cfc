/**
 * Preside Extension StickerBundle - Tiptap
 *
 * This extension overrides the core Preside Sticker bundle to replace the
 * vendored CKEditor 4 with a self-contained Tiptap v3 rich editor.
 *
 * Preside registers every extension's `assets/` directory as a Sticker bundle
 * AFTER the core bundle (see StickerForPreside.cfc), and re-declaring an asset
 * id lets the last declaration win. So by re-declaring the SAME "ckeditor" id
 * core uses, this bundle serves the Tiptap vendor bundle instead of CKEditor -
 * with no core StickerBundle edit. (Same override mechanism as preside-ext-jsmodern.)
 *
 * Assets are served from this extension's own mount:
 *   /preside/system/assets/extension/preside-ext-tiptap/assets/dist/...
 * a stable (non-fingerprinted) directory mount, so the bundle's relative
 * `url(icons/*.png)` references keep resolving.
 */
component output=false {

	// Extension asset mount (StickerForPreside adds rootUrl
	// "/preside/system/assets/extension/<ext-dir>/assets" for each extension).
	variables.base    = "/preside/system/assets/extension/preside-ext-tiptap/assets/dist";
	variables.version = "0.0.7";

	public void function configure( required any bundle ) {
		var v = "?v=" & variables.version;

		// 1) Replace the CKEditor library with the Tiptap bundle (exposes window.PresideTiptap).
		bundle.addAsset( id="ckeditor", url=variables.base & "/tiptap.bundle.min.js" & v );

		// 2) The Tiptap facade - re-assigns window.PresideRichEditor after presidecore.
		bundle.addAsset( id="tiptap-facade", url=variables.base & "/facade.min.js" & v );

		// 3) Editor content / chrome styles.
		bundle.addAsset( id="tiptap-css", url=variables.base & "/tiptap.min.css" & v );

		// ORDER: the facade needs window.PresideTiptap (the "ckeditor" id now = the
		// Tiptap bundle) and must load AFTER presidecore so it can overwrite the
		// PresideRichEditor global defined there, but before the per-page scripts
		// that instantiate editors. The facade + css are pulled into the page by
		// the ckEditorJs.cfm view override this extension also ships.
		bundle.asset( "tiptap-facade" )
		      .dependsOn( "ckeditor" )
		      .after( "/js/admin/presidecore/" )
		      .before( "/js/admin/specific/*", "/js/admin/frontend/*" );
	}
}
