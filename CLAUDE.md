# preside-ext-tiptap — Claude Code Guide

> **Local environment** (machine paths, dev-server URL, credentials, sync
> commands) lives in **`devlocal.md`** — gitignored, per-developer. If it is
> missing, create it from the template in that section's headings; never put
> local paths or credentials in this file.

## What this is

A **Preside CMS extension** that replaces the vendored **CKEditor 4** rich editor
with a self-contained **Tiptap v3** editor. It is a *drop-in* replacement: it
reproduces Preside's editor integration contract exactly, so no other Preside
code (forms, renderers, AJAX endpoints, pickers) has to change.

It replaces an earlier approach that edited two core Preside files
(`system/assets/StickerBundle.cfc`, `system/views/admin/layout/ckEditorJs.cfm`).
Those edits have been reverted — **everything is now done as extension-level
overrides, with zero core Preside edits** (the same philosophy as
`preside-ext-jsmodern`).

`Architecture.md` has the full architectural walkthrough (layers, diagrams,
data flow); this file is the working guide.

## Repo layout

```
preside-ext-tiptap/
  manifest.json           Preside extension manifest (id=preside-ext-tiptap)
  box.json                ForgeBox manifest (type: preside-extensions)
  config/Config.cfc        Preside settings (auto-merged); intentionally minimal
  i18n/tiptap.properties   editor UI strings (resource bundle; see i18n section)
  views/
    admin/layout/ckEditorJs.cfm   VIEW OVERRIDE (adds tiptap-facade + tiptap-css includes + tiptapI18n data)
  assets/
    StickerBundle.cfc     auto-discovered Sticker bundle — the asset-id override;
                          declares the CONTENT-HASHED dist files via Sticker
                          wildcard paths (path="/dist/facade.*.min.js")
    dist/                 BUILT + committed, web-served (all filenames content-hashed)
      tiptap.bundle.<hash>.min.js  Tiptap v3 + Preside extensions (window.PresideTiptap)
      facade.<hash>.min.js         window.PresideRichEditor (the CKEditor-API facade)
      tiptap.<hash>.min.css        editor chrome + content styles
  src/                    esbuild input (NOT shipped in the installed extension)
    index.js              vendor bundle entry -> window.PresideTiptap
    facade.js             -> window.PresideRichEditor + CKEDITOR.instances shim + footer status bar
    toolbar.js            CKEditor-button-name -> Tiptap-command map + renderer
    i18n.js               UI-string lookup: cfrequest.tiptapI18n -> English defaults
    theme.js              light/dark chrome theme (localStorage per-user preference) + its toggle button
    maximize.js           full-viewport toggle (portals the container to <body>)
    outline.js            document outline navigator (heading rail -> hover panel -> scroll to)
    imageTools.js         smart images: drag-resize + alignment bubble over an embedded image
    tableTools.js         table chrome: bubble toolbar (row/col/cell ops) over the caret's table
    slashMenu.js          the "/" insert menu (blocks + Preside pickers + widgets by name)
    dragHandle.js         Notion-style block grip: hover -> drag to reorder / click to select
    tiptap.css            css SOURCE (built minified+hashed into dist)
    icons.js              inline SVG toolbar icons (Tabler Icons, MIT)
    pasteFilter.js        disallowedContent / pasteFromWordDisallow paste filtering
    customConfig.js       custom CKEditor config-file (configFile/customConfig) loader
    tokens.js             {{…}} token <-> HTML conversion
    normalize.js          output normalisation (byte-fidelity vs CKEditor)
    presideStyles.js      applies Preside content styles into the editor
    presideLinkSerialization.js  link href <-> {{link|asset|custom}} tokens
    presidePickerModal.js iframe picker + onDialogEvent protocol
    extensions/
      presideLink.js        link mark
      presideAnchor.js      anchor mark
      presideEmbeds.js      image / attachment / widget nodes (block-level)
      presideAttributes.js  generic attribute + inline-style support
  harness/                standalone browser harness for editor dev (see harness/README.md)
  esbuild.mjs             build script (outdir = assets/dist)
  package.json            Tiptap v3 deps + esbuild; scripts: build, watch
  devlocal.md             LOCAL-ONLY (gitignored): paths, URLs, credentials
```

## Build

```bash
npm ci             # package-lock.json IS committed - builds must be reproducible
npm run build      # -> assets/dist/{tiptap.bundle.<hash>.min.js, facade.<hash>.min.js, tiptap.<hash>.min.css}
npm run watch      # rebuild on change
```

- `assets/dist/` is **committed** so the extension works with no build step at deploy.
- Runtime deps are `@tiptap/*` only. `@tiptap/suggestion` backs the "/" menu;
  `@tiptap/extension-drag-handle` is deliberately NOT used (see the drag handle
  section for the measured +139kb Yjs cost).
- `esbuild.mjs` builds two IIFE bundles + the css. `@tiptap/*` is `external` in the
  facade build so Tiptap is not bundled twice (the facade reads `window.PresideTiptap`).
- Styles live in **`src/tiptap.css`** (an esbuild entrypoint) — edit there, never in dist.
- **All dist filenames are content-hashed** (`facade.<hash>.min.js`) — that IS the
  cache buster; there is no `?v=` to bump. `StickerBundle.cfc` and
  `harness/server.mjs` resolve the current names by globbing the dist dir. A full
  build clears dist first, and watch mode prunes stale hashed outputs, so dist only
  ever contains the current build (a rebuild changes filenames → `git add -A assets/dist`).
- **`package-lock.json` is committed** and CI uses `npm ci`, because the build output
  is committed too: without a lockfile a floating `@tiptap/*` or `esbuild` version
  would change the bundle bytes (and therefore the content hashes) on every CI run.

## Releasing / publishing to ForgeBox

`.github/workflows/ci.yml` runs on every push/PR and **publishes only from a
`release-*` or `v*` ref** (never from a PR) — the same twgit flow as
`preside-ext-jsmodern`. **The ref name IS the version number** — there is no
version to edit anywhere:

| push this ref            | published version    | ForgeBox / GitHub release |
|--------------------------|----------------------|---------------------------|
| tag `v1.2.0`             | `1.2.0+<build>`      | stable                    |
| branch `release-1.2.0`   | `1.2.0-SNAPSHOT<build>` | prerelease             |

`<build>` is the GitHub run number, zero-padded. So a stable release is just
`git tag v1.2.0 && git push origin v1.2.0`.

Pipeline:

1. every run: `npm ci` → `npm run build` → **fail if `assets/dist` differs from a
   fresh build** (i.e. someone edited `src/` without committing a rebuild);
2. publish runs only: `pixl8/github-action-twgit-release-version-generator`
   generates the semver, envsubst injects it into the `$VERSION_NUMBER`
   placeholders in **`box.json` + `manifest.json`** (both files ship with the
   literal placeholder — don't hardcode a version);
3. the project is zipped (excluding everything in `box.json`'s `ignore` list —
   `src/`, `harness/`, `node_modules/`, the npm/esbuild files, `CLAUDE.md`),
   a GitHub release is created with the zip attached, that asset URL is substituted
   into `box.json`'s `$DOWNLOAD_URL`, and `pixl8/github-action-box-publish` pushes
   to ForgeBox.

Requires repo/org secrets **`FORGEBOX_USER`** and **`FORGEBOX_PASS`**.

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
Cache busting is **filename-based**: dist files are content-hashed and each
asset is declared with a **Sticker wildcard path** (`path="/dist/facade.*.min.js"`)
— Sticker resolves the pattern to the single matching file at configure time,
throwing if it matches zero or multiple files (so dist must contain exactly one
build). No version bumping is needed when dist changes — but a server
restart/`fwreinit` still is, so the cached Sticker bundle re-resolves the new
filenames.

## ⚠️ CRITICAL serving constraint — do NOT symlink `assets/dist`

`StaticAssetDownload._fileExists` is a security guard: it rejects any served file
whose path does not physically live under `application/extensions/` (or
`extensions_app/`, or core `system/assets`). CFML engines canonicalize symlinks,
so a symlinked `dist/` resolves to the repo's path *outside* the extensions dir
→ the guard returns false → **404** on every asset.

Therefore:
- **Served files (`assets/dist/**`) MUST be real files** under the website's
  `application/extensions/preside-ext-tiptap/`.
- **CFML-side files** (`StickerBundle.cfc`, `views/**`, `config/**`, `manifest.json`,
  `box.json`) are loaded via component/view resolution — **no such guard** — so
  those *can* be symlinked safely.

## Installing into a website

Two supported approaches (concrete paths + ready-made commands: see `devlocal.md`):

1. **box.json local dependency (recommended, reproducible).** Add to the
   website's `box.json`:
   ```json
   "dependencies": { "preside-ext-tiptap": "<path-to-this-repo>/" },
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
- instance API: `getData/setData/on/fire/focus/destroy/execCommand/commands`
  (the `key` event applies CKEditor's CTRL/SHIFT/ALT keyCode masks and honours
  `return false` as cancel — frontend editors depend on this).
- **Content tokens round-trip byte-identically** (`tokens.js` / `normalize.js`):
  `{{image:…:image}}`, `{{attachment:…:attachment}}`, `{{widget:id:cfg:widget}}`,
  and link hrefs `{{link:…}}` / `{{asset:…}}` / `{{custom:…}}`
  (`presideLinkSerialization.js`). All three embed tokens are **block-level**
  (CKEditor treats them as block widgets — stored tokens are never `<p>`-wrapped).
- **Picker iframe + `onDialogEvent` protocol** (`presidePickerModal.js`) reused
  verbatim — the admin link/asset/widget picker forms are untouched. Prefill data
  posted to `ajaxhelper.temporarilyStoreData` must be form-encoded with arrays as
  comma lists (the picker JS `split(",")`s them) — never JSON-encoded.

Server-side renderers, forms and AJAX endpoints assume the stored `{{…}}` markup
is unchanged. Never alter the token format; keep it a client-side detail.

## i18n (editor UI strings)

CKEditor 4 shipped its own language packs (browser-locale auto-detect), so the old
editor chrome localised itself. The Tiptap replacement localises the standard
Preside way instead:

- **Every user-facing string** goes through `src/i18n.js` `t( key, subs )` —
  never hardcode UI text in the editor js. Lookup order: `cfrequest.tiptapI18n`
  (server-translated) → `window.PresideTiptapI18n` (harness/manual) → built-in
  English defaults. Strings resolve at **render time**, never script-parse time
  (the cfrequest data block may be emitted after the bundles execute).
- **`i18n/tiptap.properties`** is the resource bundle; sites localise by adding
  `tiptap_<lang>.properties` overrides (normal Preside resource-bundle rules).
- **`views/admin/layout/ckEditorJs.cfm`** translates each key server-side (admin
  user locale) into `event.includeData({ tiptapI18n = … })`.
- Adding a string = add the key in **three places**: `src/i18n.js` DEFAULTS,
  `i18n/tiptap.properties`, and the key list in `ckEditorJs.cfm`.
- `{count}` / `{name}` placeholders are substituted client-side by `t()`.

## Footer status bar

The facade renders a `.tiptap-footer` under each editor with live word / char
counts and estimated reading time (225 wpm), refreshed on every doc change, plus
the right-aligned light/dark toggle (`.tiptap-footer-right`). Disable per
site/field with `defaultConfigs.wordcount = false`. Strings are the `footer.*`
i18n keys.

## Document outline navigator

`src/outline.js` renders a collapsed **rail** of short horizontal lines on the
right edge of the container — one per heading, wider line = higher level — that
expands on hover (or focus, or click to pin) into a panel of heading titles;
clicking a line or an entry drops the caret in that heading and scrolls it into
view, and the current heading highlights as you scroll past it. Disable per
site/field with `defaultConfigs.outline = false`. Strings are the `outline.*`
i18n keys.

- **The outline adapts to the space it has** (`railPlan()`): it shows the
  **deepest heading level that fits** — h1–h6, else h1–h5, … — then, if even the
  shallowest level present outnumbers the room, **every Nth** of them
  (`.is-sampled`, plus `.is-partial` whenever anything was dropped). Levels are
  never shed below the shallowest level the document actually uses, so a doc
  starting at h2 still gets a rail.
- **The rail and the panel show the SAME set** — the panel is the label list for
  the markers, so it can never offer a heading the rail does not mark. Capacity is
  `min( (editable − 24)/8px rail rows, (editable − 20)/24px panel rows )`; the
  panel's taller rows are the binding constraint, which is also what stops either
  list overflowing the editor. `PANEL_ROW_HEIGHT`/`PANEL_PADDING` in
  `src/outline.js` MUST track `.tiptap-outline-item`/`.tiptap-outline-panel` in
  the CSS.
- Capacity is **measured**, not read from CSS: the computed value of a
  percentage `max-height` stays a percentage, so `getComputedStyle` cannot give
  it in px. Same reason the rail has no percentage `max-height` of its own — it
  would not resolve against the wrapper (whose height is capped, not set) and
  the rail would run off the bottom of the editor.
- **Chrome only** — it lives on `.tiptap-editor-container`, never in the
  editable, so `getData()` is unaffected and the rail does not scroll with the
  content (the scroller is `.tiptap-editor-mount`, one level in).
- **It stays vertically centred on the editable** at any heading count. Two
  things are load-bearing: the panel is **out of flow** (as a hidden flex sibling
  it still contributed its full height, making the wrapper tall and pushing the
  top-aligned rail upwards — the bug that made the rail "creep up" as content
  grew), and `place()` sets the wrapper's `top` in px from the **editable's** box,
  not the container's (a two-row toolbar puts those centres ~20px apart).
- The active heading comes from **scroll position** while scrolling (mount or
  window, rAF-throttled) and from the **caret** otherwise; the rail highlights
  the marker at or above it, since the rail is a subset.
- **Colours come from the Preside admin palette** (Preside-CMS
  `system/assets/css/admin/lessglobals/colours.less`), not from anywhere else:
  entry hover is `@pale-blue` (`@default-row-hover-colour`), the current entry
  gets the `@blue` tree-list highlight bar, rail markers are `@grey12` idling and
  `@blue-darker` active, and the landed-on heading flashes the admin's highlight
  `@yellow`. The variable-to-admin mapping is listed in the `src/tiptap.css`
  header - add colours as `--tt-*` variables sourced from that file, never as
  new hex values.
- The panel has **no visible heading** - `outline.title` is only its accessible
  name (`aria-label`).
- The wrapper is `pointer-events:none`; only the drawn rows and the open panel
  take clicks, so the right edge of the editable stays usable. Don't "simplify"
  that away.
- **Scrolling is scoped, and often skipped entirely.** Clicking scrolls the
  **mount** when the mount is the scroller (field `maxHeight`, or maximized). When
  the field shows all its content there is nothing to scroll to, so a click only
  moves the caret + highlight — do NOT reinstate a `scrollIntoView()` fallback
  there: with no scroller of its own the browser satisfies it by scrolling the
  admin PAGE, yanking the form around under a heading that was already visible.
  The page is only moved when the heading is genuinely outside the viewport (a
  tall uncapped field), and then with `block:"nearest"`.
- The landed-on-heading highlight is a **ProseMirror node decoration**
  (`tiptap-outline-target`), NOT a class on the heading element: ProseMirror's
  next DOM sync rewrites node attributes and wipes any class we set. That is why
  `src/index.js` exports `Plugin`/`PluginKey`/`Decoration`/`DecorationSet` on
  `window.PresideTiptap`. Being a decoration also keeps the doc clean — no
  `update` event, so the form never goes dirty from navigating.

## Smart images (drag-resize + alignment)

`src/imageTools.js` puts corner drag handles and a bubble toolbar over the
**selected** embedded image (align left/centre/right, 25/50/100%-of-editor-width
presets, original size, edit-in-picker, remove), and writes the result back into
the same `{{image:...:image}}` token the picker produces. Disable per site/field
with `defaultConfigs.imageTools = false`. Strings are the `image.*` i18n keys.
Only `presideImage` gets it (`opts.resizable`); attachments and widgets do not.

- **It writes only three config keys** - and each one is a documented Preside
  contract, not a choice we are free to change:
  - `dimensions` - the `"WxH"` px string. Preside-CMS
    `system/handlers/renderers/asset/Image.cfc::RichEditor` turns it into an
    on-the-fly derivative `"WxH-<quality>"` via a `resize` with
    `maintainAspectRatio=true`. **That is why dragging is always proportional**: a
    non-proportional height would simply be ignored by the server.
  - `alignment` - `auto|left|right|center`, applied by
    `system/views/renderers/asset/image/richEditor.cfm` as `float:` / `margin:...
    auto`.
  - `derivative` - reset to `"none"` on resize, because
    `ContentRendererService.renderEmbeddedImages` **deletes**
    width/height/quality/dimensions whenever a named derivative is set. Named
    derivatives only exist on sites that configure some with `inEditor=true`
    (`DerivativePicker.cfc` renders nothing otherwise), so on most sites this
    never fires.
- **The preview is NOT re-requested on resize/align** - every distinct size makes
  Preside generate and store a derivative, so a drag would litter the asset
  store. The geometry is applied locally over the already-rendered HTML and a
  **refresh button appears in the middle of the image**; the real derivative
  arrives on the next load or when that button is clicked. Do not "fix" this into
  an automatic (even debounced) refetch.
- **ALIGNMENT AND SPACING ARE ALWAYS APPLIED BY US, COMPUTED FROM THE TOKEN, onto the
  node view wrapper** (`data-tt-align` + an inline margin) - never only while the
  preview is stale, and never copied back off the rendered HTML.
  - *Why the wrapper*: `richEditor.cfm` puts `float:`/auto-margins and the spacing
    margins on the rendered element, and those are inert inside the frame that
    shrink-wraps the preview - there is no room to float in a box that is exactly the
    image's width. CKEditor hit the same wall and solved it the same way
    (`addEmbeddedImageStylesToWidgetWrapper` copied those styles onto its widget
    wrapper). The css zeroes `float`/`margin` on `.tiptap-embed-preview > *` so the
    wrapper is the single owner of both.
  - *Why computed, not copied*: the rendered HTML is only ever as fresh as the last
    render, and a stored `center` renders `margin:Xpx auto` - so copying gave an
    image re-aligned left/right the wrong side spacing until it was refreshed.
    `spacingPx()` mirrors `richEditor.cfm` exactly (`spacing_<side> ?: spacing ?: 0`,
    and centre gets NO horizontal spacing), which makes the geometry exact in every
    state.
  - *The element carrying the styles is not always the `<img>`*: it is the `<figure>`
    when there is a caption/copyright and the `<a>` when there is a link - hence the
    css selector is `preview > *`. The harness mock renders all three shapes.
  - Applying alignment only while stale was the bug where refresh made a right-aligned
    image jump left and then refuse to re-align: the config still said `right`, so the
    button was "active" and clicking it toggled the alignment *off*.
- **Two key sets, and they are not the same set.** `LOCAL_KEYS`
  (dimensions/alignment/derivative) are what this module writes - a change confined
  to them is handled locally with no refetch. `STALE_KEYS` (dimensions/derivative)
  are the ones that make the already-rendered HTML *wrong*, i.e. mark it stale and
  offer the refresh button. **`alignment` is deliberately in the first and not the
  second**: we render alignment ourselves, so re-requesting for it would achieve
  nothing and just flash a pointless refresh button.
- **Stale is derived, never flagged**: `renderedGeom` records the geometry the
  visible HTML was rendered for, so undo/redo back to the rendered state clears the
  marker on its own. The SIZE override is applied only while stale, so an untouched
  image is exactly what the server produced (the derivative's own natural size).
- **Empty / `"auto"` / `"none"` compare equal** in `geometryKey()`: clicking an
  alignment off writes the picker's own `"auto"`, which renders identically to the
  empty value it replaced, and would otherwise mark the preview stale forever.
- **A local-key-only change must not refetch, anything else must.** The node view's
  `update()` decides by comparing the non-local keys, so this holds for undo, redo
  and picker edits alike - not just for changes this module made. Without an
  `update()` at all, ProseMirror rebuilds the node view on every attribute change
  and refetches every time.
- Embeds render as **`dom > .tiptap-embed-frame > .tiptap-embed-preview`** (all
  three, for uniformity). The server HTML replaces `preview`'s innerHTML, so the
  chrome has to be a sibling of it; `frame` shrink-wraps the embed and is what the
  absolute overlays measure against. **The selection outline is on the frame, not
  the wrapper** - a centre-aligned image makes the wrapper a full-width block (that
  is how it centres), so outlining the wrapper drew a selection box across the
  whole editor.
- The bubble is anchored to the image's **left** edge and then nudged by
  `placeBubble()` to stay inside the editable; centring it on the image clipped
  half its buttons off the editor border on any small or left-floated image.
- Clicking the refresh button **also selects** the node, and so does starting a
  drag: the button covers the middle of the image, so a click aimed at the image
  lands there instead, and that must not be a dead end.
- **Byte fidelity**: the token is rebuilt only when the user actually changes
  something. Never parse-and-reserialise on load - it reformats the JSON and
  breaks `getData()`'s byte match with CKEditor.
- "Original size" is the one action allowed to exceed the editor width (the site's
  layout may be wider); drags and the % presets cap there.
- The harness mock (`harness/server.mjs` `renderMockImage()`) mirrors
  `richEditor.cfm` closely enough to exercise all of this without a Preside boot,
  including serving the mock svg AT the requested size so the aspect ratio the
  editor reads is real.

## The "/" insert menu

`src/slashMenu.js` - type `/` in an empty block to filter and insert any
block-level element, **including Preside's own**: the image / attachment / widget
pickers, link, anchor, and **individual widgets by name** ("/news" → the news
widget). Disable per site/field with `defaultConfigs.slashMenu = false`; strings
are the `slash.*` keys.

- Trigger detection is **`@tiptap/suggestion`** (MIT, framework-agnostic; the
  popup is ours because Tiptap only ships React/Vue renderers). Costs **+24kb**
  and pulls nothing but core/pm/floating-ui - contrast
  `@tiptap/extension-drag-handle`, below.
- **`/` only fires at the start of an empty-ish block, and never in a code
  block.** Preside content is full of real slashes (dates, paths, "and/or") and
  CKEditor had no such trigger, so a menu opening mid-sentence would be a
  regression against the editor we replace, not a missing feature.
- **Every item runs a command that already exists** (the toolbar's `COMMANDS`, or
  the pickers the embed extensions register). This module adds a way to REACH
  things, never a second implementation - and items whose command is absent from
  the build/field are dropped rather than shown broken.
- The suggestion range is deleted **before** the item runs, so a picker inserting
  a block-level node sees a clean block.
- **Search matches the translated label first, then keywords/hints** - the
  English keywords are additive so "/pic" finds the image picker, but a localised
  admin stays searchable in its own language.
- The popup is on **`<body>`**, not the container: a capped-height or
  overflow-hidden field would clip it (same reason the picker overlays live
  there). That puts it outside the `--tt-*` variables' scope, so its light/dark
  values are its own, via `prefers-color-scheme`.
- **It renders before it positions.** Measuring an empty box put a full-length
  menu off the bottom of the screen - `paint()` renders, *then* `move()` decides
  whether to flip above the caret.

### The widget list

`views/admin/layout/ckEditorJs.cfm` emits `cfrequest.tiptapWidgets` from
`widgetsService.getWidgets()` - **no new endpoint**, the same pattern as
`tiptapI18n`, translated for the admin user and filtered to the active site
template (mirroring core's `Widgets._getSortedAndTranslatedWidgets`).

- `widgetCategories` is a **per-field** setting while this view renders **once per
  page**, so each widget ships **with its `categories`** and `slashMenu.js`
  filters per field, applying Preside's own rule (`_isWidgetInCategories`):
  an empty list on *either* side means `"default"`.
- The categories knowable server-side are `"default"` plus whatever the site
  configures. A field naming some other category still gets the "Widget…" entry,
  so **no widget is ever unreachable** - it just loses the by-name shortcut.
- Selecting a widget opens the picker **pre-pointed at it**, via a new optional
  `extra` argument threaded through `openPresideWidgetPicker` →
  `pickerUrl` → `widget=<id>` (core's `Widgets.dialog()` renders that widget's
  configForm whenever `rc.widget` is set). Called with no argument - i.e. the
  toolbar button - **the URL is byte-identical to before**.
- Deliberately **not** short-circuited into building a `{{widget:...}}` token
  here, even for widgets with no config form: the token would then be ours rather
  than Preside's, and byte fidelity with what the picker commits is the whole
  point of tokens.
- The whole block is wrapped in a `try`/`catch` - the menu is a convenience and
  must never take the editor down with it.

## Block drag handle

`src/dragHandle.js` - hovering a block shows two controls in the left gutter: a
**"+"** (insert a block below) and a **grip** (drag to reorder, click to select -
which is also what makes the image tools / table bubble appear, so the grip
doubles as "select this"). Disable per site/field with
`defaultConfigs.dragHandle = false`.

- **"+" does not open the menu itself - it types a "/" for the author** and lets
  the slash menu react, exactly as the reference editor does. One code path for
  both affordances: no second copy of the item list, and no way for the button and
  the keystroke to drift apart. It therefore renders **only when the slash menu is
  enabled** (the facade passes `slashMenuEnabled( cfg )`), and the gutter narrows
  to the grip alone otherwise - `.tiptap-gutter-2` (48px) vs `.tiptap-gutter-1`
  (28px), so a field never pays for a control it does not show.
- Clicking "+" on an **already-empty paragraph reuses that block** rather than
  pushing it down, so it cannot stack blank lines.
- Both controls live in one `.tiptap-block-gutter` wrapper and share the hover
  bookkeeping - `is-visible` is on the WRAPPER, not the grip. Hovering either must
  not count as leaving the block.

- **HAND-ROLLED DELIBERATELY. Do not "simplify" this to
  `@tiptap/extension-drag-handle`.** That package is MIT in v3, but it
  hard-imports `@tiptap/extension-collaboration` + `@tiptap/y-tiptap`, so the
  build *fails* without them and installing them drags real Yjs runtime code into
  the bundle: **measured at +139kb (+30% of the vendor bundle)** for an editor
  that does zero collaboration. It also pins `@tiptap/pm` to an exact version.
  Everything it offers is already in what we ship - `nodeDOM` for positioning,
  `NodeSelection` for the drag, `prosemirror-dropcursor` (via StarterKit) for the
  drop indicator.
- **Chrome only** - the handle lives on `.tiptap-editor-container`, so
  `getData()` is unaffected by its existence. A drag is of course a real edit, but
  an ordinary ProseMirror move: tokens survive byte-for-byte and undo restores
  exactly (both asserted in `test-realworld.html` T15).
- The gutter comes from a **`.tiptap-has-draghandle` class**, not from
  `.tiptap-editor-mount` itself, so a field opting out keeps the original padding
  and loses no editable width.
- **Block lookup iterates the doc's own top-level children** and compares DOM
  boxes, rather than using `view.posAtCoords`. We want the top-level block (the
  draggable unit); `posAtCoords` returns the innermost position, so a paragraph
  in a list item or table cell would have to be climbed back up, and it behaves
  differently for leaf nodes like our embeds.
- The grip aligns to the block's **first line**, not its centre - on a tall block
  (a long list, a big image) a centred grip reads as belonging to nothing. It is
  also clamped into the visible mount, so a half-scrolled block's grip cannot
  float over the toolbar.
- Mouse tracking is on the **container**, not the editable: the grip sits in the
  gutter *outside* the editable, so hovering the grip must not count as leaving
  the block.
- `hide()` **no-ops while dragging** - otherwise the grip is yanked out from under
  the drag in progress.
- Drag is the standard ProseMirror recipe: select the node, set
  `view.dragging = { slice, move: true }`, and attach `text/html` +
  `setDragImage` (some browsers cancel a drag with no data attached). ProseMirror's
  own drop handling does the move.
- **Testing note:** Playwright's `dragTo` uses mouse events and does **not** drive
  native HTML5 drag-and-drop - it reports success while changing nothing. T15
  dispatches the real sequence (`dragstart`/`dragover`/`drop`/`dragend`) with one
  shared `DataTransfer`, which is what actually exercises the drop.

## Alignment dropdown

CKEditor exposed alignment as four separate toolbar buttons
(`JustifyLeft/Center/Right/Block`). Four buttons for one mutually-exclusive
property is a lot of toolbar width, so `renderAlign()` in `src/toolbar.js`
collapses them into **one trigger plus a compact single ROW of icons** (the shape
`reactjs-tiptap-editor` uses).

- **The trigger shows the CURRENT alignment**, not a fixed icon like the
  reference's — the state is readable without opening the menu, matching how the
  Format dropdown displays its current value. With nothing applied it falls back
  to the first offered icon and is **not** marked `is-active`, so the fallback
  never makes the button look permanently on.
- **Collapsing is scoped to the toolbar GROUP, and the menu offers exactly the
  alignments that group named** — never all four. A site that deliberately left
  `JustifyBlock` out of its toolbar must not silently get it back.
- **One alignment stays a plain button.** A single-item menu is worse than the
  button it replaced, so `collapseAlign` requires more than one in the group.
  Consequence: a config splitting them across groups (`JustifyLeft|JustifyRight`)
  gets two plain buttons — the site's own grouping is respected rather than
  overridden.
- The trigger is a plain `.tiptap-btn` (`data-cmd="Align"`), deliberately **not**
  `.tiptap-dropdown-trigger` — same reasoning as the Table picker: that class
  means "labelled by its current value" and toolbar-enumerating code skips it.
- Existing per-button i18n keys are reused for the menu items
  (`toolbar.justifyleft`, …); the trigger adds `toolbar.align`.
- Behaviour is unchanged from the four buttons: picking an alignment calls the
  same `COMMANDS[ name ].run()`. In particular there is still **no toggle-off**
  (`setTextAlign` only, as before) — worth knowing if unsetting alignment is ever
  asked for, since it was never possible here.

## Tables (grid-size picker + bubble toolbar)

Tables used to be a single toolbar button that dropped a fixed 3x3 in and then
left the user with no controls at all. They now have two pieces, both modelled on
`reactjs-tiptap-editor`'s table UX (`src/extensions/Table/` there):

- **`renderTable()` in `src/toolbar.js`** — the `Table` toolbar button opens a
  **grid-size picker**: hover (or drag, via pointer capture, so it works on
  touch) to choose the size, with a live `"R x C"` caption and a **"With header
  row"** checkbox; release/click inserts. The grid starts at 5x5 and **grows
  towards 10x10 as the pointer reaches its current edge**, rather than showing
  the full 10x10 up front like the reference does — the common table is small,
  and a big grid makes the small sizes a fiddly target.
  - The trigger is deliberately **NOT** `.tiptap-dropdown-trigger`: that class
    means "a control labelled by its current value" (Format/Styles), and
    toolbar-enumerating code skips those — including `buttonTitles()` in
    `harness/test-realworld.html`. This is an ordinary icon button that happens to
    open a popover, so it keeps a stable title and stays enumerable.
  - `withHeaderRowPref` is remembered per page, not per field, so a user who
    never wants header rows stops re-unticking it. It is not persisted — it is a
    per-insert decision, not a lasting preference like the theme.
- **`src/tableTools.js`** — a **bubble toolbar** over the table the caret is in:
  insert/delete column, insert/delete row, merge/split cells, header row/column
  toggles, delete table. Every button is greyed via `editor.can()` rather than
  offered as a silent no-op (merge needs a multi-cell `CellSelection`; delete
  column fails on the last one).
  - **Chrome only** — it lives on `.tiptap-editor-container`, never in the
    editable, so `getData()` is byte-identical whether it is on or off.
  - Header row/column toggles are **ours, not the reference's** (its bubble has
    no header controls). CKEditor's table dialog had them and Preside content
    uses `<th>` widely, so leaving them out would regress against the editor
    this replaces.
  - It is drawn **above** the table, flipping below only when there is no room —
    the opposite of the reference (always below), and deliberate: the last row is
    where you are usually typing when you reach for "add row", and a bubble
    pinned under the table covers the row you just created.
  - Left-anchored to the table then clamped into the mount — **never centred**,
    which clips the end buttons off a narrow or right-hand table (the same lesson
    as `imageTools`' `placeBubble()`).
  - Hand-rolled rather than Tiptap's `BubbleMenu`, which ships only as a
    React/Vue component (`@tiptap/react/menus`); this bundle is vanilla.
  - `.selectedCell` needs an explicit highlight in `src/tiptap.css` (an `:after`
    overlay, `--tt-selected`) — merge/split act on that selection, so it has to be
    visible.

Disable both per site/field with `defaultConfigs.tableTools = false`. Strings are
the `table.*` i18n keys.

**Two things NOT copied from the reference, both content-fidelity issues here:**

- Its `HTMLAttributes.style` (`border:1px solid #000; border-collapse:collapse;
  width:100%`) bakes presentation into every stored `<table>`. Ours stays CSS-only
  via `--tt-table-border`, so site content stylesheets keep control.
- Its `resizable: true`. **Column resizing is deliberately still off**:
  `normalize.js` strips `<colgroup>` and the table `style` attribute from
  `getData()` (CKEditor byte-fidelity), so dragging a column would appear to work
  and then silently lose every width on save. Turning it on is a real decision,
  not a flag flip — it needs a documented exception in the normaliser and changes
  the stored table markup.

## Light / dark mode

The toggle (`.tiptap-theme-toggle`) is rendered **right-aligned in the footer
status bar**. A toolbar config can instead place it in the toolbar with the button
name `Theme` (or `DarkMode`), in which case the footer does not get one; if the
footer is disabled (`wordcount = false`) it falls back to the far right of the
toolbar (`.tiptap-toolbar-right`). `buildToolbar()` returns
`{ themeEnabled, themeRendered }` so the facade can make that call. Disable the
control entirely per site/field with `defaultConfigs.darkMode = false`.

- **Chrome only** — dark mode adds `.tiptap-dark` to the container; the stored
  content is untouched, so `getData()` is identical in either mode.
- **`src/theme.js`** owns the state: the choice is a per-USER preference in
  `localStorage` (`presideTiptapTheme`), not per-field, so toggling one editor
  re-themes every editor on the page (it walks the live DOM rather than keeping a
  listener registry — editors are created/destroyed freely) and the preference is
  re-applied on mount. Default is light.
- **`src/tiptap.css`** drives all chrome colours through `--tt-*` custom
  properties declared on `.tiptap-editor-container`, so the dark theme is one
  variable override block at the bottom of the file. Add new colours as variables,
  not literals. The picker/anchor overlays live outside the container (on `<body>`,
  hosting admin forms in an iframe) and stay light deliberately.
- A field's own content stylesheets (`contentsCss`/`stylesheets`) are authored
  for a light page, so any explicit colour they set still wins inside the
  editable — intentional (WYSIWYG fidelity), so dark mode is a chrome-comfort
  feature, not a content preview.
- Strings are the `toolbar.theme.dark` / `toolbar.theme.light` i18n keys (the
  tooltip describes what a click will do; the icon shows the current mode).

## Local dev server

Server command, admin URL, credentials and DB details are in **`devlocal.md`**.
Environment-independent facts:

- The extension runs on stock Lucee/Preside (and on RustCFML, which reports as
  Lucee).
- **Production mode caches aggressively** — after editing a `.cfc`, the view, or
  `dist`, restart the server (or hit `?fwreinit=…`) to see changes. Browser cache
  busting is automatic (content-hashed dist filenames) once the Sticker bundle has
  re-configured.
- Asset sanity check: request
  `/preside/system/assets/extension/preside-ext-tiptap/assets/dist/facade.<hash>.min.js`
  (`ls` the install's dist dir for the current hash) on the dev server and expect
  a 200 (ready-made curl in `devlocal.md`).

## Testing changes end-to-end

1. Rebuild (`npm run build`) and get fresh `dist` into the install (rsync, or
   `box install`, per the approach above — commands in `devlocal.md`).
2. Restart / `fwreinit`.
3. In the admin, open any record with a rich-editor field (e.g. a page's body).
   Verify: editor renders with toolbar + icons; type + save round-trips; the
   **link**, **image/asset**, and **widget** pickers open, insert, AND re-open
   (double-click an inserted widget to prepopulate). These three picker flows are
   the historically fragile paths.

The browser harness (`harness/`) covers most of this without a Preside boot —
including a CKEditor-vs-Tiptap fidelity matrix (`/fidelity.html`) and
`/test-realworld.html`, self-running tests whose cases are real customisation
patterns found in Pixl8 sites (named toolbars, unmapped CKEditor buttons,
stylesSet appends, custom config files). See `harness/README.md`.

## Gotchas / history

- The `ckeditor` **id** is deliberately reused (not a new id) so all existing
  `event.include("ckeditor")` call-sites and `ckeditorConfig` data still work.
- `config/Config.cfc` deliberately does **not** override
  `settings.ckeditor.defaults.configFile` — the facade **loads and honours**
  custom CKEditor config files (`src/customConfig.js`): the file's
  `CKEDITOR.editorConfig( config )` output becomes the base config (file <
  instance precedence, matching CKEditor), including client-side
  `toolbar_<name>` lookups; plugin-loading keys (`extraPlugins` etc.) are
  ignored and the stock core `config.js` executes harmlessly against the shim.
  Loading is a parse-time async prefetch with a sync-XHR fallback because
  `frontendEditors.js` needs `.editor` synchronously from the constructor.
- Toolbar icons are **inline SVGs bundled from `src/icons.js`** (Tabler Icons,
  MIT) — there is no `assets/dist/icons/` directory and no CKEditor image assets
  (the old CKEditor PNGs were removed for licensing reasons; do not reintroduce
  them).
- Key events are **stopped at the editor container boundary** (facade) —
  CKEditor's iframe used to isolate keystrokes from the admin page; without this,
  Preside's admin hotkeys (`preside.hotkeys.js`) fire while typing (its
  `userIsTyping()` misses inline contenteditables).
- If assets 404 after an install change, first suspect a **symlinked `dist`**
  (see the CRITICAL section) or a stale Sticker bundle (restart / `fwreinit` — it
  resolves the hashed filenames at configure time, so it must re-run after a rebuild).
- rsync `dist` **with `--delete`** — this is now MANDATORY: Sticker's wildcard
  paths throw `Sticker.multipleAssets` at configure time if a stale hashed file
  sits alongside the current one.
