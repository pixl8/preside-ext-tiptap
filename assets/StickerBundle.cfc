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
 * Cache busting is done via CONTENT-HASHED FILENAMES: the build (esbuild.mjs)
 * emits e.g. facade.<hash>.min.js, and each asset is declared with a WILDCARD
 * `path` - Sticker itself resolves the single matching file at configure time
 * (https://sticker.readthedocs.io/ - wildcard asset paths). The build prunes
 * stale hashed outputs so each pattern only ever matches one file.
 * (Toolbar icons are inline SVGs in the js bundle - no separate icon files.)
 */
component output=false {

	public void function configure( required any bundle ) {
		// 1) Replace the CKEditor library with the Tiptap bundle (exposes window.PresideTiptap).
		bundle.addAsset( id="ckeditor", path="/dist/tiptap.bundle.*.min.js" );

		// 2) The Tiptap facade - re-assigns window.PresideRichEditor after presidecore.
		bundle.addAsset( id="tiptap-facade", path="/dist/facade.*.min.js" );

		// 3) Editor content / chrome styles.
		bundle.addAsset( id="tiptap-css", path="/dist/tiptap.*.min.css" );

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
