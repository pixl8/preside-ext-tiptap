/**
 * esbuild build for the Preside Tiptap external.
 *
 * Produces two self-contained IIFE bundles under assets/dist/ (committed,
 * web-served by Preside from the extension asset mount
 * /preside/system/assets/extension/preside-ext-tiptap/assets/dist/):
 *
 *   tiptap.bundle.min.js  - Tiptap v3 + Preside extensions, exposes window.PresideTiptap.
 *                           Wired into Sticker under id "ckeditor" (replaces CKEditor lib).
 *   facade.min.js         - defines window.PresideRichEditor (Tiptap facade). References
 *                           window.PresideTiptap; @tiptap/* kept external so Tiptap is
 *                           never bundled twice.
 *
 * Usage:  npm install && npm run build   (or: npm run watch)
 */
import * as esbuild from "esbuild";

const watch = process.argv.includes( "--watch" );

const common = {
	  bundle        : true
	, minify        : true
	, sourcemap     : true
	, format        : "iife"
	, target        : [ "es2019" ]
	, legalComments : "none"
	, logLevel      : "info"
	, outdir        : "assets/dist"
	, entryNames    : "[name].min"
};

const vendor = {
	...common
	, entryPoints : { "tiptap.bundle": "src/index.js" }
};

const facade = {
	...common
	, entryPoints : { "facade": "src/facade.js" }
	, external    : [ "@tiptap/*" ]
};

if ( watch ) {
	const ctxV = await esbuild.context( vendor );
	const ctxF = await esbuild.context( facade );
	await Promise.all( [ ctxV.watch(), ctxF.watch() ] );
	console.log( "[preside-tiptap] watching for changes..." );
} else {
	await Promise.all( [ esbuild.build( vendor ), esbuild.build( facade ) ] );
	console.log( "[preside-tiptap] build complete -> assets/dist/" );
}
