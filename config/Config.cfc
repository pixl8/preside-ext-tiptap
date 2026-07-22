/**
 * Preside config for the Tiptap extension.
 *
 * Auto-discovered and merged by Preside (extensions/preside-ext-tiptap/config/Config.cfc).
 * Kept intentionally small: the stored-content contract is unchanged, so the existing
 * settings.ckeditor.* config (toolbars, linkPicker types, defaults) is reused as-is.
 *
 * NB we deliberately do NOT override settings.ckeditor.defaults.configFile: the Tiptap
 * facade ignores the CKEditor customConfig, so pointing it at a non-existent config.js
 * would only mint a phantom 404.
 */
component {

	public void function configure( required struct config ) {
		var settings = arguments.config.settings ?: {};

		// Which rich-editor engine is active (kept explicit for rollout/rollback; unread by core).
		settings.richeditorEngine = "tiptap";
	}
}
