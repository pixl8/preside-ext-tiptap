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

		// Which rich-editor engine is active (kept explicit for rollout/rollback; unread by core).
		settings.richeditorEngine = "tiptap";
	}
}
