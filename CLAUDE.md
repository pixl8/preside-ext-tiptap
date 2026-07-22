# preside-ext-tiptap — Claude Code Guide

## What this is

A **Preside CMS extension** that replaces the vendored **CKEditor 4** rich editor
with a self-contained **Tiptap v3** editor. It is a *drop-in* replacement: it
reproduces Preside's editor integration contract exactly, so no other Preside
code (forms, renderers, AJAX endpoints, pickers) has to change.

Source of truth for this repo:
`/Users/alexskinner/Repos/opensource/preside-ext/preside-ext-tiptap`

It replaces an earlier approach that edited two core Preside files
(`system/assets/StickerBundle.cfc`, `system/views/admin/layout/ckEditorJs.cfm`).
Those edits have been reverted — **everything is now done as extension-level
overrides, with zero core Preside edits** (the same philosophy as
`preside-ext-jsmodern`).

## Repo layout

```
preside-ext-tiptap/
  manifest.json           Preside extension manifest (id=preside-ext-tiptap)
  box.json                ForgeBox manifest (type: preside-extensions)
  config/Config.cfc        Preside settings (auto-merged); intentionally minimal
  views/
    admin/layout/ckEditorJs.cfm   VIEW OVERRIDE (adds tiptap-facade + tiptap-css includes)
  assets/
    StickerBundle.cfc     auto-discovered Sticker bundle — the asset-id override
    dist/                 BUILT + committed, web-served
      tiptap.bundle.min.js  Tiptap v3 + Preside extensions (window.PresideTiptap)
      facade.min.js         window.PresideRichEditor (the CKEditor-API facade)
      tiptap.min.css        editor chrome + content styles
      icons/*.png           toolbar icons (referenced RELATIVELY from the css)
  src/                    esbuild input (NOT shipped in the installed extension)
    index.js              vendor bundle entry -> window.PresideTiptap
    facade.js             -> window.PresideRichEditor + CKEDITOR.instances shim
    toolbar.js            CKEditor-button-name -> Tiptap-command map + renderer
    tokens.js             {{…}} token <-> HTML conversion
    normalize.js          output normalisation (byte-fidelity vs CKEditor)
    presideStyles.js      applies Preside content styles into the editor
    presideLinkSerialization.js  link href <-> {{link|asset|custom}} tokens
    presidePickerModal.js iframe picker + onDialogEvent protocol
    extensions/
      presideLink.js        link mark
      presideAnchor.js      anchor mark
      presideEmbeds.js      image / attachment / widget nodes
      presideAttributes.js  generic attribute + inline-style support
  harness/                standalone browser harness for editor dev (see harness/README.md)
  esbuild.mjs             build script (outdir = assets/dist)
  package.json            Tiptap v3 deps + esbuild; scripts: build, watch
```

## Build

```bash
npm install
npm run build      # -> assets/dist/{tiptap.bundle.min.js, facade.min.js} (+ css is committed/hand-maintained)
npm run watch      # rebuild on change
```

- `assets/dist/` is **committed** so the extension works with no build step at deploy.
- `esbuild.mjs` builds two IIFE bundles. `@tiptap/*` is `external` in the facade
  build so Tiptap is not bundled twice (the facade reads `window.PresideTiptap`).
- **`tiptap.min.css` is not an esbuild entrypoint** — it is maintained directly in
  `assets/dist/`. If you change styles, edit that file (or wire css into the build).

## How it plugs into Preside (the important part)

Preside registers every extension's `assets/` directory as a Sticker bundle
**after** the core bundle (see `Preside-CMS/system/services/sticker/StickerForPreside.cfc`,
lines ~59–66). Re-declaring an asset **id** lets the last declaration win. So:

1. **`assets/StickerBundle.cfc`** (auto-discovered) re-declares:
   - `ckeditor`      → the Tiptap vendor bundle (was CKEditor's `ckeditor.js`)
   - `tiptap-facade` → the facade
   - `tiptap-css`    → the styles

   and sets ordering: `tiptap-facade` `.dependsOn("ckeditor")`
   `.after("/js/admin/presidecore/")` `.before("/js/admin/specific/*","/js/admin/frontend/*")`.

2. **`views/admin/layout/ckEditorJs.cfm`** is a **view override**. Core only
   `event.include("ckeditor")`; Sticker only emits an asset that is explicitly
   included, so this override adds `event.include("tiptap-facade")` +
   `event.include("tiptap-css")`. **Ordering is enforced by the `.after()` rule
   on the bundle, not by where `include()` is called** — so the facade always
   loads after presidecore even though the include lines sit early in the view.

Why the facade must load after presidecore: presidecore's `preside.richeditor.js`
defines `window.PresideRichEditor` (the CKEditor impl) at parse time; the facade
must run **after** to overwrite it, but **before** `formFields.js` binds
`$('textarea.richeditor')` on DOM-ready. The vendor bundle (`ckeditor` id) must
load before both (it exposes `window.PresideTiptap`, and provides a no-op
`CKEDITOR` shim so presidecore doesn't throw before the facade loads — see the
top of `src/index.js`).

### Asset URLs / the extension mount

Assets are served from the stable, non-fingerprinted **extension mount**:

```
/preside/system/assets/extension/preside-ext-tiptap/assets/dist/...
```

`Preside-CMS/system/handlers/admin/StaticAssetDownload.cfc::_translatePath` maps
`/preside/system/assets/extension/<id>/...` → `application/extensions/<id>/...`.
Because it's a directory mount (not per-file fingerprinted), the css's relative
`url(icons/*.png)` refs resolve. The `StickerBundle.cfc` `variables.version` is
appended as `?v=` — **bump it when you change dist** so browsers refetch.

## ⚠️ CRITICAL serving constraint — do NOT symlink `assets/dist`

`StaticAssetDownload._fileExists` is a security guard: it rejects any served file
whose path does not physically live under `application/extensions/` (or
`extensions_app/`, or core `system/assets`). **RustCFML canonicalizes symlinks**,
so a symlinked `dist/` resolves to this repo's path *outside* the extensions dir
→ the guard returns false → **404** on every asset.

Therefore:
- **Served files (`assets/dist/**`) MUST be real files** under the website's
  `application/extensions/preside-ext-tiptap/`.
- **CFML-side files** (`StickerBundle.cfc`, `views/**`, `config/**`, `manifest.json`,
  `box.json`) are loaded via component/view resolution — **no such guard** — so
  those *can* be symlinked safely.

(The CFML view/component path did work through symlinks in testing; only the
HTTP-served static assets are affected.)

## Installing into a website

Target website: `/Users/alexskinner/Projects/Websites/readyintelligencewebsite/website`
(extensions live in `application/extensions/`, which is box-managed —
`.gitignore` is `*`, so the install copy is never committed to the website repo).

Two supported approaches:

1. **box.json local dependency (recommended, reproducible).** Add to the
   website's `box.json`:
   ```json
   "dependencies": { "preside-ext-tiptap": "/Users/alexskinner/Repos/opensource/preside-ext/preside-ext-tiptap/" },
   "installPaths": { "preside-ext-tiptap": "application/extensions/preside-ext-tiptap/" }
   ```
   `box install` **copies** the folder in (real files → guard is happy). Trade-off:
   it's a copy, so re-run `box install` after editing the source. No symlink needed.

2. **Symlink hybrid (live CFML edits).** Real install dir; symlink the CFML files,
   keep `dist` a real copy:
   ```
   ln -s <repo>/{manifest.json,box.json,README.md,config,views}  <install>/
   mkdir <install>/assets && ln -s <repo>/assets/StickerBundle.cfc <install>/assets/
   rsync -a --delete --exclude '*.map' <repo>/assets/dist/ <install>/assets/dist/
   ```
   CFML edits are live; re-`rsync` (or rebuild-then-rsync) `dist` after JS changes.

After changing the extension structure or a `.cfc`, **restart the server or
`fwreinit`** — production mode caches Sticker bundles, views, and the extension list.

## Preside integration contract (must be preserved)

The facade (`src/facade.js`) reproduces the CKEditor-facing API Preside depends on:
- `window.PresideRichEditor` constructor `( textareaEl )`; Tiptap instance on `.editor`.
- **`CKEDITOR.instances[name]`** registry with `getData()`/`setData()`/`initialdata`
  — used by serialize-object (AJAX submit), dirtyforms, quick-add reset, frontend
  version restore.
- **`$textarea.data('ckeditorinstance')`** with `getData()` — used by jquery.validate.
- instance API: `getData/setData/on/fire/focus/destroy/execCommand/commands`.
- **Content tokens round-trip byte-identically** (`tokens.js` / `normalize.js`):
  `{{image:…:image}}`, `{{attachment:…:attachment}}`, `{{widget:id:cfg:widget}}`,
  and link hrefs `{{link:…}}` / `{{asset:…}}` / `{{custom:…}}`
  (`presideLinkSerialization.js`).
- **Picker iframe + `onDialogEvent` protocol** (`presidePickerModal.js`) reused
  verbatim — the admin link/asset/widget picker forms are untouched.

Server-side renderers, forms and AJAX endpoints assume the stored `{{…}}` markup
is unchanged. Never alter the token format; keep it a client-side detail.

## Local dev server (current environment)

- **RustCFML** serves the website: `rustcfml --serve <website> --port 8611 --production`.
  RustCFML is a Rust CFML engine (repo `Repos/opensource/CFMLs/RustCFML`) that
  reports as Lucee; the extension also runs on stock Lucee/Preside.
- Admin: `http://127.0.0.1:8611/admin/` — sysadmin / password.
- DB: MySQL `pcms_ritest`, root / freeze, port 3306.
- `.cfconfig.json` in the website root holds `debugging.enabled`, the `/preside`
  mapping (→ the Preside-CMS repo), and the datasource.
- **Production mode caches aggressively** — after editing a `.cfc`, the view, or
  `dist`, restart the server (or hit `?fwreinit=…`) to see changes. A version bump
  of `StickerBundle.cfc` `variables.version` busts the browser asset cache.
- Quick asset sanity check:
  ```bash
  curl -s -o /dev/null -w '%{http_code}\n' \
    "http://127.0.0.1:8611/preside/system/assets/extension/preside-ext-tiptap/assets/dist/facade.min.js"
  ```

## Testing changes end-to-end

1. Rebuild (`npm run build`) and get fresh `dist` into the install (rsync, or
   `box install`, per the approach above).
2. Restart / `fwreinit`.
3. In the admin, open any record with a rich-editor field (e.g. a page's body).
   Verify: editor renders with toolbar + icons; type + save round-trips; the
   **link**, **image/asset**, and **widget** pickers open, insert, AND re-open
   (double-click an inserted widget to prepopulate). These three picker flows are
   the historically fragile paths.

## Gotchas / history

- The `ckeditor` **id** is deliberately reused (not a new id) so all existing
  `event.include("ckeditor")` call-sites and `ckeditorConfig` data still work.
- `config/Config.cfc` deliberately does **not** override
  `settings.ckeditor.defaults.configFile` — the facade ignores the CKEditor
  `customConfig`, and pointing it at a non-existent `config.js` only mints a 404.
- Icons are static committed files in `assets/dist/icons/`; esbuild does not build
  them. The css references them relatively, which only works via the directory
  mount (see above).
- If assets 404 after an install change, first suspect a **symlinked `dist`**
  (see the CRITICAL section) or a stale cache (restart / bump `?v=`).
```
