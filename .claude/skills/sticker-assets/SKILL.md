---
name: sticker-assets
description: Get JavaScript and CSS onto a Preside page in the right order via Sticker asset bundles. Use when adding a JS/CSS file to a Preside extension, overriding a core asset, fixing script load-order problems, cache-busting with content hashes, or debugging a 404 on an extension asset.
---

# Sticker asset bundles in Preside

Sticker is Preside's asset dependency manager. Every extension's `assets/`
directory is auto-registered as a bundle, **after** core's and in extension
dependency order. Declaring an asset gives it an **id**, a path, and ordering
rules; the page then emits it only if something explicitly **includes** it.

## The two-step nobody remembers

1. **Declare** it in `assets/StickerBundle.cfc`.
2. **Include** it from a view/handler: `event.include( "my-asset" )`.

Declaring alone renders nothing. This is the single most common "my script isn't
on the page" cause.

## Declaring

```cfml
component output=false {
	public void function configure( required any bundle ) {
		bundle.addAsset( id="my-thing", path="/dist/my-thing.*.min.js" );

		bundle.asset( "my-thing" )
		      .dependsOn( "tiptap-facade" )                 // load after this asset
		      .after( "/js/admin/presidecore/" )            // ...and after this path
		      .before( "/js/admin/specific/*" );            // ...but before these
	}
}
```

- `path` is **relative to the extension's `assets/` directory**.
- `dependsOn( id )` — a hard dependency on another *asset id*.
- `.after( … )` / `.before( … )` — ordering against ids or **path globs**. This
  is how you sit between two core bundles you do not own.
- Ordering is enforced by these rules, **not** by where `include()` is called.
  An `include()` at the top of a view can still emit last.

## Overriding a core asset

**Re-declare the same id.** Extensions register after core, and the last
declaration of an id wins. That is the entire mechanism — no core edit.

```cfml
bundle.addAsset( id="ckeditor", path="/dist/tiptap.bundle.*.min.js" );
```

Every existing `event.include( "ckeditor" )` call site now serves your file.
Reusing the id (rather than inventing a new one) is what keeps those call sites
and any related `cfrequest` data working.

## Cache busting: content-hashed filenames + wildcard paths

Preferred over `?v=` query strings. The build emits `facade.<HASH>.min.js`; the
declaration uses a **wildcard path** and Sticker resolves it to the single
matching file at configure time:

```cfml
bundle.addAsset( id="tiptap-facade", path="/dist/facade.*.min.js" );
```

Consequences you must design for:

- **The pattern must match exactly one file.** Sticker throws
  `Sticker.multipleAssets` at configure time otherwise. So your build must prune
  stale hashed outputs, and any rsync to an install **must use `--delete`**.
- **Resolution happens at configure time**, so after a rebuild the server needs
  a restart or `fwreinit` before the new filename is served.
- Filenames change only when content changes, which is the point.

## Where extension assets are served from

```
/preside/system/assets/extension/<extension-id>/assets/<path>
```

`StaticAssetDownload.cfc::_translatePath` maps that to
`application/extensions/<id>/…`. The URL is stable and not fingerprinted —
cache busting is the filename, not the URL.

## ⚠️ Never symlink a served asset directory

`StaticAssetDownload._fileExists` is a security guard: it **rejects any served
file whose canonical path is not physically under** `application/extensions/`
(or `extensions_app/`, or core `system/assets`). CFML engines canonicalise
symlinks, so a symlinked `dist/` resolves to your repo *outside* the extensions
directory and the guard returns false — **404 on every asset**.

- **Served files must be real files** under the install.
- **CFML files** (`StickerBundle.cfc`, `views/**`, `config/**`, `manifest.json`)
  are loaded by component/view resolution, which has no such guard — those
  *can* be symlinked safely.

Some CFML engines do not canonicalise the same way and will happily serve a
symlink, so a local setup that works proves nothing about stock Lucee. Do not
generalise from "it works on my machine".

## Debugging

| Symptom | First suspects |
|---|---|
| 404 on the asset | symlinked `dist` (above); stale Sticker bundle (restart / `fwreinit`); wrong `path` (it is relative to `assets/`) |
| Asset never appears in the HTML | it was declared but never `include()`d |
| Script runs too early / too late | ordering comes from `dependsOn`/`.after`/`.before`, never from where `include()` sits |
| `Sticker.multipleAssets` | two hashed builds in the directory — rsync with `--delete`, prune stale outputs |
| New build not served | Sticker resolved the wildcard at configure time — restart / `fwreinit` |
| Works locally, 404 in CI/prod | the symlink guard, almost every time |

## Worked example: adding a bundle that extends another extension

```cfml
// preside-ext-tiptap-spellcheck/assets/StickerBundle.cfc
component output=false {
	public void function configure( required any bundle ) {
		bundle.addAsset( id="tiptap-spellcheck", path="/dist/spellcheck.*.min.js" );

		// The facade defines PresideTiptap.api and the plugin registry must be
		// written to before formFields.js mounts editors on DOM-ready. Ordering
		// after "tiptap-facade" is what buys both.
		bundle.asset( "tiptap-spellcheck" )
		      .dependsOn( "tiptap-facade" )
		      .after( "tiptap-facade" );
	}
}
```

Plus `dependsOn: [ "preside-ext-tiptap" ]` in `manifest.json` — that is what
guarantees the other extension's bundle is registered first — and an
`event.include( "tiptap-spellcheck" )` from wherever the editor is used. See the
`preside-extension-anatomy` and `tiptap-plugin-api` skills.
