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
    resize.js             the bottom-right drag grip (CKEditor's `resize` plugin)
    sourceView.js         the Source view: pretty-printer + highlighter + the
                          textarea-over-paint-layer editor (DISPLAY-ONLY)
    outline.js            document outline navigator (heading rail -> hover panel -> scroll to)
    imageTools.js         smart images: drag-resize + alignment bubble over an embedded image
    embedBubble.js        the SHARED embed bubble: its placement + buttons, and the
                          Edit/Remove pair widgets and attachments get
    tableTools.js         table chrome: bubble toolbar (row/col/cell ops) over the caret's table
    slashMenu.js          the "/" insert menu (blocks + Preside pickers + widgets by name)
    dragHandle.js         Notion-style block grip: hover -> drag to reorder / click to select
    dialog.js             modal dialog shell (head/tabs/body/buttons) IN A SHADOW ROOT
    findReplace.js        Find + Find and Replace (one dialog, two tabs) + the search engine
    specialChar.js        Insert Special Character dialog (grid + previews)
    specialChars.js       DATA: CKEditor's specialChars list + its character names
    bidi.js               text direction: dir attribute on the block (BidiLtr/BidiRtl)
    tiptap.css            css SOURCE (built minified+hashed into dist)
    icons.js              inline SVG toolbar icons (Tabler Icons, MIT)
    pasteFilter.js        disallowedContent / pasteFromWordDisallow paste filtering
    customConfig.js       custom CKEditor config-file (configFile/customConfig) loader
    tokens.js             {{…}} token <-> HTML conversion
    normalize.js          output normalisation (byte-fidelity vs CKEditor)
    ownStyle.js           our stylesheet as cssText, for the two isolation boundaries
                          (the editing frame's document + the dialog's shadow root)
    editorFrame.js        THE ISOLATION BOUNDARY - the per-editor editing iframe
                          (creation, own-CSS injection, auto-height, surfaceOf())
    editorFocus.js        focusEditable() - take DOM focus BEFORE building a
                          command chain (a Safari-only Tiptap hazard)
    presideStyles.js      content stylesheets: UNMODIFIED into the frame, plus a
                          scoped copy for the Format/Styles previews only
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
  Vertically it prefers **above** the image and **flips below** (`.is-below`) when
  there is no room — an image at the top of a field otherwise put the bubble on
  the toolbar or outside the mount, with none of its buttons reachable. The room
  is measured against the **mount∩viewport** band, as the table bubble and the
  Modern selection bubble do: inline the mount is page-height, so the raw rect
  answers the wrong question.
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

## Embeds: block chips, and click-to-select

All three embeds (`presideImage`, `presideAttachment`, `presideWidget`) are
**block** atom nodes, and their DOM has to be block-level too.

- **Widget/attachment placeholders are `display:block; width:fit-content`.** As
  `inline-block` their DOM shared a line, so two widgets in a row sat side by side
  instead of stacking - wrong for a block node. `fit-content` keeps the shrink-wrap
  that makes a widget read as a chip rather than a full-width bar (shrinking AND
  stacking verified in blink, webkit and gecko).
- **The IMAGE keeps `inline-block`**, deliberately: its alignment feature floats
  the wrapper so text can sit beside it, and `center` switches itself to
  `display:block` for the auto margins. So two consecutive *images* can still share
  a line - that is the alignment feature working, not the widget bug.
- **A single click selects the NODE.** These are atoms with
  `contenteditable=false`, but their previews are server-rendered HTML full of real
  text, and a click landing on it left the browser to start a text selection
  *inside* the embed. `makePreviewDom()` adds a `mousedown` handler that
  `preventDefault()`s (which is what stops the text selection) and sets a
  NodeSelection. Only for embeds with no tools of their own - **imageTools already
  does this for images**, where the click must also arm the handles and the bubble.
  `user-select:none` on all three stops a drag painting a highlight across them.
- **The selected outline goes on the CHIP for widget/attachment, on the FRAME for
  the image.** The image's wrapper goes full-width to centre itself, so outlining
  it drew a selection box across the whole editor; a chip shrink-wraps and is the
  box the user actually sees.

### Preview links never navigate inside the editor

The previews are **real server-rendered HTML**, and an attachment renders as an
`<a href>` to the asset - so clicking the paperclip icon or the filename
**downloaded the file**, from inside the editor, where the click was meant to select
the embed so it could be edited or removed. (A linked image is the same shape of
problem.) `makePreviewDom()` cancels `click` and `auxclick` on any anchor inside an
embed, in the **capture** phase so it lands before anything in the rendered markup.

- **Selecting the node already worked; that was not the bug.** The select-me handler
  `preventDefault()`s the *mousedown*, and a cancelled mousedown does not stop the
  anchor's own click activation - which is what navigates.
- `auxclick` is covered because a **middle click** opens the download in a new tab,
  and keyboard activation fires a click of its own, so it is covered too.
- **Nothing is neutered outside the editor, by construction**: the guard lives on the
  node view, which only exists while the editor does. Classic closing, or Modern
  re-rendering the region from the server, leaves the page's own markup with the page's
  own links. Verified in both modes.
- It is **scoped to embeds**, not a blanket "cancel every link click" - an ordinary
  content link in the editable is untouched (asserted, so the guard cannot quietly
  grow into one).

Tests: **T27** (the mock renders the server's own download href - it used to be
`href="#"`, which is why the harness could not see this bug; the click and the middle
click are both cancelled; the click selects the embed instead; the token round-trips;
an ordinary content link is left alone). Confirmed with a real Playwright mouse too:
no navigation, no download, and **no request** for the asset.

### The bubble: all three embeds get one

The floating toolbar over a **selected** embed is one implementation
(`src/embedBubble.js`) with two button sets: the image's full one (align, size
presets, original size, edit, remove - `src/imageTools.js`) and, for widgets and
attachments, just **Edit** and **Remove**, because they have no geometry to offer.

- **`placeBubble()` and `bubbleButton()` live in `embedBubble.js` and imageTools
  imports them**, so the two bubbles cannot drift apart. The placement rules are the
  ones the image bubble arrived at the hard way and they are documented there: left-
  anchored then clamped inside the editable (centring clipped half the buttons off a
  small or floated embed), above unless there is no room and then `.is-below` (an
  embed at the top of a field otherwise put the bubble on the toolbar with none of
  its buttons reachable), and the room measured against the **mount ∩ viewport**
  (inline the mount is page-height, so the raw rect answers the wrong question).
- The css follows the same split: **`.tiptap-embed-bubble` is the shared chrome**,
  `.tiptap-image-bubble` only carries the image-specific extras. Both classes are on
  the image's bubble element.
- **Chrome only** - it is a sibling of the preview inside the frame, never in the
  document, so `getData()` is untouched whether it is on screen or not. Remove is an
  ordinary `deleteRange`, so undo restores the token byte-for-byte.
- **The buttons swallow `mousedown`** (`bubbleButton()`): a focused button inside the
  `contenteditable=false` wrapper collapses the NodeSelection - which hides the very
  chrome that was just clicked - and stopping propagation also keeps the click off the
  embed's own select-me handler.
- Edit reuses **`openPicker()`**, the same path the existing double-click uses, so
  there is one way in to the picker and it stays prefilled for editing.
- It is under the **same opt-out as the image tools** (`defaultConfigs.imageTools =
  false`) and absent in a read-only editor: a field that turned embed chrome off
  should not sprout a different flavour of it. An image whose token cannot be parsed
  is still left strictly alone - it does not fall back to the reduced bubble.
- Strings are the `embed.edit` / `embed.remove` i18n keys.

Tests: `harness/test-realworld.html` **T21** (stacking, shrink-wrap,
click-selects-node, the outline, no text selection, token round-trip, and the bubble:
exactly Edit + Remove on the selected chip, hidden on the unselected one, flipped
below at the top of the field and still inside the mount, and Remove deleting just
that embed).

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
  values are its own — synced from the **editor's** `tiptap-dark` class at open
  (NOT `prefers-color-scheme`: a dark OS must not put a dark menu over a light
  editor, or over the site page in Modern inline mode).
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

- **"+" opens the slash menu DIRECTLY at a fresh empty block, with no "/"
  character written into the document** (`slashMenu.js` `storage.openManual`):
  the same popup, item list and filtering as the typed "/", so the two
  affordances cannot drift — the manual session keeps the query itself and a
  capture-phase key handler swallows typed characters to filter (Esc closes,
  Enter/Tab picks, Backspace unfilters-then-closes). It used to type a literal
  "/" and let the suggestion plugin react; a button that writes its shortcut's
  trigger character into the author's content read as a bug (T15 asserts the
  block stays empty). "+" still renders **only when the slash menu is enabled**
  (the facade passes `slashMenuEnabled( cfg )`), and the gutter narrows to the
  grip alone otherwise - `.tiptap-gutter-2` (48px) vs `.tiptap-gutter-1` (28px),
  so a field never pays for a control it does not show.
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
  own drop handling does the move. The ghost is anchored to where the pointer
  actually is relative to the block (x clamped at 0 — negative `setDragImage`
  offsets are unreliable), so the block doesn't visually jump left on pick-up.
- **The gutter is a live drop zone.** The grip sits OUTSIDE the editable, so a
  vertical-only drag keeps the pointer where ProseMirror never sees the
  `dragover` — no drop line, no drop, and users had to drift right into the
  text. While our drag is live, `dragover`/`drop` in the band left of the
  editable (document capture listeners, gated on `dragging`) are re-dispatched
  to the editable with the x clamped just inside it. `dragend` is also relayed
  to the editable so the dropcursor clears on a cancelled (Esc'd) drag —
  natively it only fires at the drag source.
- **Edge auto-scroll during drag**: the same `dragover` pass nudges the scroller
  (the mount when it scrolls; the window too when the editor overflows the
  viewport — inline mode's scroller IS the page) proportionally within 40px of
  the visible edge, so a block can be dragged to an off-screen spot in one
  gesture. No rAF loop — `dragover` keeps firing while the pointer is
  stationary, which is what makes hover-at-the-edge scrolling work.
- **`allowTableNodeSelection: true` is REQUIRED on the Table extension** (set in
  `src/index.js`) and is not optional polish. `prosemirror-tables` defaults it to
  `false`, which silently **normalises away** a NodeSelection on a table - the
  grip's selection collapsed to a cell inside it, so ProseMirror's move-on-drop
  deleted that cell selection instead of the table and left the original in place:
  **dragging a table DUPLICATED it.** Regression test: T16.
- Because a dispatch can be normalised away like that, `dragstart` **verifies the
  NodeSelection actually stuck** (`sel.node && sel.from === offset`) and refuses to
  start the drag otherwise. A grip that does nothing is a far better failure than
  one that silently copies content, and it makes any future node type with similar
  plugin behaviour fail safe.
- **Testing note on undo:** ProseMirror's history amalgamates transactions within
  `newGroupDelay` (500ms), so a test that inserts a block and drags it immediately
  gets ONE undo step for both - which looks exactly like "undo is broken". T16
  waits 900ms between the two, as a real user's pause does.
- **Testing note:** Playwright's `dragTo` uses mouse events and does **not** drive
  native HTML5 drag-and-drop - it reports success while changing nothing. T15
  dispatches the real sequence (`dragstart`/`dragover`/`drop`/`dragend`) with one
  shared `DataTransfer`, which is what actually exercises the drop.

## Manual resize grip (bottom-right corner)

`src/resize.js` reproduces CKEditor's `resize` plugin: the grip in the bottom-right
corner of the bottom bar (our footer status bar) that drags the editor to a size the
author chooses. Boxed/classic editors only.

- **`resize_dir` defaults to `"vertical"`**, so out of the box it drags HEIGHT only;
  `"horizontal"`/`"both"` are honoured. Defaults are CKEditor's own: min 750x250,
  max 3000x3000, `resize_enabled` true. An axis is draggable only when its min and
  max differ (CKEditor's own test), so a field pinning both gets **no grip at all**.
- **The minimum is lowered to the current size on pointer-down when the editor is
  already smaller than it.** That is CKEditor's own line, and it matters far more
  here: Preside's default `maxHeight` is 300, so a stock field starts under the 250
  minimum and without it the first pixel of drag would JUMP the editor taller.
- Clamping is against the WHOLE editor box, as CKEditor's is (`getResizable()`
  returns the outer container), not the editable alone - so the corner stays under
  the pointer.
- **A dragged height is applied as `frameApi.setHeights( h, h )` - min and max
  pinned to the same value - and that is the whole implementation.** Everything else
  follows: the frame stops auto-growing (which is what "I chose this height" means,
  and what CKEditor's explicit height did), and `syncOverflow()` derives on its own
  that taller content now scrolls inside the frame. Resist adding a second height
  path for this.
- Nothing is persisted - a per-session size, exactly as CKEditor's was.
- Hidden while maximized (CKEditor hides it on the `maximize` event; ours is a CSS
  rule on `.is-maximized`), and **absent in Modern inline mode**, where the editable
  is the site page in its own flow - CKEditor's inline mode had no bottom bar and no
  resizer either.
- It is drawn as the same 10px CSS border-triangle CKEditor's skin uses, NOT the
  `◢` glyph that skin falls back to - same reasoning as the dropdown caret. Two
  small departures: the cursor names the axis actually being dragged
  (`ns-resize`/`ew-resize`/`se-resize`, where CKEditor's skin says `se-resize`
  always), and the grip is focusable so arrow keys resize in 20px steps.
- The footer's right-hand slot (`.tiptap-footer-right`) is now **always created**,
  holding the light/dark toggle and the grip. That is deliberate: two elements each
  with `margin-left:auto` would SPLIT the free space and park the toggle in the
  middle of the footer. A field with `wordcount:false` has no footer, so the grip
  floats in the container's own corner (`.is-floating`).

Tests: **T25** (rendered in the footer corner, vertical-only by default with the
matching cursor, drag down/up by the drag distance, the height STICKS when content
is added and the frame scrolls instead, arrow keys, hidden while maximized,
`resize_enabled:false`, min===max leaves no grip, `resize_dir:"both"` narrows the
container, and the min-lowering rule on a field capped below the default minimum).
Its fixtures are its own: an earlier version dragged T9's field and raced the
outline rail's rAF-deferred re-centring - the rail does re-place itself on a resize
(it observes the surface), just not in the same tick.

## Toolbar chrome: grouped blocks, separators, carets

The toolbar is deliberately CKEditor's shape, because a Preside author recognises
it: **a grey tray of white grouped blocks**. The numbers in `src/tiptap.css` are
not invented - they were read off the bootstrapck skin in the browser:
`.cke_top` is `#eee` with `3px` top padding, `.cke_toolgroup` is white with
`1px #ddd`, `4px` radius, `2px` padding and `margin:0 6px 3px 0`, and
`.cke_button` computes to a 16px icon in 2px/4px padding at radius 2.
`--tt-chrome-bg` and `--tt-group-bg` carry the two surfaces (with dark-theme
overrides), so the whole tray re-themes with everything else.

- **Matching CKEditor's button metrics is not only cosmetic**: it is what makes the
  same toolbar config wrap into the same number of rows. The floating chrome (table
  bubble, image bubble, selection bubble) keeps its own larger 24px buttons - those
  are not toolbar rows.
- **The group is the block, so a dropdown inside one carries no border of its own**
  (that drew a second box inside the group's). The Format/Styles trigger is
  otherwise styled to `.cke_combo_text`'s metrics.
- **The selection bubble reuses `.tiptap-toolbar-group`, and explicitly zeroes the
  block chrome**: it is one floating pill, and a white bordered box inside a white
  pill looked like a mistake.
- **A separator only means something BETWEEN two controls.** `tidySeparators()` in
  `toolbar.js` drops the ones that end up leading, trailing or doubled, and it runs
  **after** rendering rather than filtering the name list - because what actually
  renders is not knowable up front: unknown button names are skipped and the four
  `Justify*` collapse into one dropdown. The real `preside-ext-pdf-templating`
  toolbar is the proof: `Cut,Copy,-,Undo,Redo` leaves a LEADING separator once
  Cut/Copy are dropped, and `Find,Replace,-,SelectAll,-,Scayt` leaves two TRAILING
  ones. Against the group's own border those read as doubled lines - the
  "sometimes there are two of them" report. The separator is also centred by the
  group's `align-items` rather than a magic top margin, so it lines up whatever the
  row height is.
- **NEVER use a bare class name a theme might own.** The dropdown caret used
  `class="caret"`, which is a **bootstrap** (and Ace) class: in the admin,
  bootstrap's own `.caret` rule drew its border triangle on top of the `&#9662;`
  glyph we printed, so every dropdown showed **two arrows stacked**. It is now
  `.tiptap-caret`, drawn as a CSS border triangle (nothing to double up), and the
  label is `.tiptap-lbl` (Ace owns `.lbl` too). The toolbar lives in the LIGHT DOM
  - unlike the dialogs, which are behind a shadow boundary - so this hazard is
  live for anything added here. Namespace it.

- **`.tiptap-dropdown` is a FLEX container, not an inline-block** — a one-pixel
  bug worth knowing about, because it only showed on the *custom-rendered*
  controls. As an inline-block the wrapper opened an **inline** formatting
  context, so its trigger sat on a text baseline against the strut of the
  wrapper's own font. Where that baseline falls depends on what is inside the
  trigger: one with a text label (Format/Styles) puts its baseline mid-button and
  fitted the 22px; one holding **only boxes** — the Table picker's svg, the Align
  picker's icon span — has its baseline **synthesized at its bottom edge**, so the
  strut's descent was added below it and the wrapper measured 23px. That made
  exactly those two GROUPS a pixel taller than every other block in the tray and
  shifted their buttons half a pixel up — reported, correctly, as "the taller ones
  are the custom buttons". A flex container has no strut, so a wrapper is now
  exactly its trigger's height whatever it contains.

Tests: T2 asserts the tray/block surfaces, that no group has a leading, trailing or
doubled separator on that real-world toolbar (while a separator between two real
buttons survives), that a trigger carries exactly one caret, that no chrome
uses the `caret`/`lbl` class names, and that **every group in a toolbar row is the
same height with every button on one top edge** (that toolbar has both custom
triggers, so it is the case the wrapper bug hit) with a dropdown wrapper exactly its
trigger's height.

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

**Not copied from the reference:** its `HTMLAttributes.style`
(`border:1px solid #000; border-collapse:collapse; width:100%`) bakes
presentation into every stored `<table>`. Ours stays CSS-only via
`--tt-table-border`, so site content stylesheets keep control.

### Column resizing (widths persist)

`resizable: true` — drag a column border to set its width, and the width is
**stored**. This is the one part of the table work that changes stored markup, so
the rules are exact:

- **Two different consumers need two different things.** Tiptap writes `colwidth`
  onto the cells and that is what the EDITOR reads back — but no browser
  understands it, so on its own a dragged width renders nowhere but the editor.
  `<colgroup>` is what a browser reads, so `normalize.js` keeps one. Both are
  persisted, for the editor and the site respectively.
- **`<colgroup>` is kept ONLY when a column has an explicit width.** A table
  nobody resized still serialises without one, **byte-identically to before**, so
  opening and saving an existing CKEditor-authored corpus produces no churn. This
  is asserted (T17) and visible in the fidelity suite's table fixture.
- The `<col>` elements are rewritten to carry `width` alone; the `min-width` that
  only exists so the resize handles have something to grab is dropped, as is
  Tiptap's editing `min-width` on the `<table>` itself (it would fight the site's
  own table CSS). Rewriting the whole style attribute rather than editing it is
  what keeps the normaliser idempotent.
- **`cellMinWidth` (in `src/index.js`) MUST match the `min-width` on `td`/`th` in
  `src/tiptap.css`**, and those cells are `box-sizing:border-box`. The plugin's
  own default (25) is below the CSS floor, so a column could be dragged narrower
  than the editor would ever render it — storing a number the editor showed as
  something else. With content-box the 44px floor also became ~61px once padding
  and borders were added. Both are fixed so *what you drag is what you store*.
- `.column-resize-handle` and the `resize-cursor` class both need styling in
  `src/tiptap.css`; the cursor is the only hint that columns can be dragged at
  all, so without it the feature is effectively undiscoverable.
- **Testing note:** the drag itself cannot be driven by synthetic mouse events —
  prosemirror-tables only arms its handle for real pointer input, so a
  `dispatchEvent` drag silently does nothing (same class of trap as HTML5 dnd in
  T15). T17 sets `colwidth` the way a finished drag leaves it and asserts the
  serialisation contract; the drag itself was verified with a real Playwright
  mouse.

## Source view (src/sourceView.js)

The `Source` button shows the stored markup **laid out the way CKEditor's does and
syntax highlighted** — but where CKEditor's readability came from its *output
writer* (its `getData()` genuinely contains those newlines and tabs), **ours is
display-only**. That is the whole constraint, and everything here follows from it.

- **The formatter only INSERTS newlines and tabs at block boundaries.** Every other
  byte is emitted from the scanner token's own `raw` text — nothing is
  re-serialised, no attribute rewritten, no quote style normalised. So the formatter
  cannot invent a difference, which is what lets the editor trust the text it gets
  back. `getData()` is unchanged and the fidelity matrix numbers are identical.
- **Closing with the text unchanged does not touch the document at all** — not even a
  `setContent()` with identical html. So open-then-close is a no-op for `getData()`
  *and* for the form's dirty state. (It used to re-parse on every close.)
- **Inline content is never broken across lines, and `<pre>`/`<textarea>` are
  emitted verbatim**: whitespace is significant in both, so a prettier layout there
  would change what the page renders. The one newline we do add inside `<pre>` sits
  immediately after the open tag, which every HTML parser drops — that is exactly
  why CKEditor could do the same.
- **The layout is CKEditor's**, read off the real editor rather than invented: a
  BLANK line between top-level blocks, one tab per level inside lists/tables, text
  blocks on a single line.
- The editing surface is a **transparent `<textarea>` over a highlighted paint
  layer**, scroll-synced. Not a contenteditable: the textarea keeps native caret
  behaviour, IME and its own undo stack, and only the paint behind it is ours.
  - **Every property that moves a glyph must be identical in both layers** (family,
    size, line-height, letter-spacing, padding, wrapping, tab-size, box-sizing).
    They are set once on a shared selector in `src/tiptap.css` — add new metrics
    there, never to one layer.
  - **The paint layer is a `<div>`, not a `<pre>`**, even though it renders
    pre-formatted text. Our own `.tiptap-editor-mount pre` code-block rule is
    (0,1,1) and beat it, and a field's content stylesheet styling `pre` is
    completely ordinary — either one changing its font or padding slides the
    highlight off the text it is painting. This was caught by measuring, not by eye.
  - **No line-number gutter**: the view soft-wraps (an image or widget token is one
    line hundreds of characters long, so wrapping beats a horizontal scrollbar), and
    numbering wrapped lines means measuring every soft break. A gutter that
    mis-counts is worse than none.
- **Tokens are scanned BEFORE tags.** A `{{...}}` payload can contain a `<` or `>`
  (alt text, a caption); letting the tag branch see it first mis-scans the rest of
  the string. A token is highlighted as one unit and drawn as a chip with the
  `--tt-active-*` pair, so it needs no dark-theme override of its own.
- The palette is the **admin colours** (`lessglobals/colours.less`) like everything
  else here — @blue-darker tags, @clay-brown attributes, @green-darker values,
  @grey9 comments — with a dark set that is ours, since the admin is light-only.
- **The mount's padding is given back.** Its left inset is the block drag gutter's
  room (`.tiptap-gutter-1/-2`), and there is no rail over the source - nor any blocks
  for one to grab - so the code view takes the full box and its layers' own 10/12px
  is the only inset. The marker class goes on the MOUNT, not the container: the
  gutter rule targets the mount, which lives inside the frame where a container
  selector cannot reach it. It also has to restate the frame-root form to match the
  gutter rule's (0,3,0) - a bare `.tiptap-editor-mount.is-source` is (0,2,0) and lost.
- **The view is the height the editor already has**, as CKEditor's source textarea
  was, and re-fits when the frame is resized (the grip, Maximize). Sizing it to its
  own content would make the editor jump on every toggle; a fixed height left dead
  space under it in any taller field.
- **The outline rail is hidden while the source is up** (`.is-source` on the
  container): it navigates headings in a document that is not on screen, and
  clicking one would move a caret nobody can see. The rest of the content-glued
  chrome cannot appear — it all hangs off the hidden editable.
- It opens **at the top, caret on line 1**: focusing a textarea puts the caret at
  the end, which scrolled a long document's source straight to the bottom and took
  the frame's own scroll with it. `Tab` inserts a tab rather than walking the focus
  out of a view whose whole content is markup.
- **Re-opening gives the user their own layout back**, keyed on the document it
  belongs to, so hand-made line breaks survive a toggle instead of being
  reformatted; any later edit in the editable changes the key and the stale text is
  dropped.

Tests: **T26** (opens inside the frame; blank line between top-level blocks, tab
indents, inline content on one line, `<pre>` byte-for-byte; the gutter's indent
given back; the paint layer paints
exactly the textarea's text at identical metrics; token/tag/attr highlighting;
the rail hidden and restored; the box does not change height; `Tab` inserts a tab;
**open-then-close is byte-identical**; an edit applies and ONLY the edit, with the
`{{widget}}` token, `<pre>` whitespace and `&amp;` all surviving; re-open keeps the
user's layout).

## Find / Replace, special characters, text direction

Four CKEditor toolbar buttons that this extension used to skip silently (they were
literally the "unmapped" list in T2) are now implemented. All four are **modelled
on the CKEditor plugin, not invented** - the plugin sources are in the Preside tree
at `system/assets/ckeditor/` and are worth reading before changing any of this.

### The dialog shell (`src/dialog.js`) — and why it is in a SHADOW ROOT

Find/Replace and Insert Special Character were CKEditor **dialogs**, so they get
dialog chrome rather than a popover: title bar, optional tab strip, body, status
line, button row. One implementation, two consumers.

**A dialog must be portalled to `<body>`** (a capped-height field, or any
`overflow:hidden` ancestor, would clip it — the same reason the pickers, the slash
menu and the selection bubble live there). But `<body>` in the admin is bootstrap +
Ace territory, and a panel built from a **fieldset, a legend, labels, inputs and
buttons** is exactly what an admin theme has the most opinions about. The first
version of this dialog was portalled into the light DOM and the real admin
mangled it:

- bootstrap's `legend` is 21px, full width, with a bottom border and a 20px margin
  — so "Find Options" drew a rule across the dialog and shoved the options down;
- `label` is forced to `inline-block` with its own weight, so the three options ran
  together on one line;
- Ace re-skins `input[type=checkbox]` and re-borders text inputs;
- **and several of those arrive with `!important`.**

That is the SAME fight the editable lost before it moved into an iframe: a
specificity contest against the admin's stylesheets cannot be won, because
`!important` and higher-specificity selectors are ordinary content of a real admin
theme. **So do not try to fix dialog styling with more specificity — the boundary
is the fix.** The panel is built inside `host.attachShadow()`, where no rule from
the page can reach it, and our own stylesheet is injected inside it
(`src/ownStyle.js`, the same cssText trick the editing frame uses).

- **A shadow root, not an iframe.** Unlike the editable, this chrome needs no
  `rem`/`vw` root of its own, hosts nothing editable (so none of the
  `-webkit-user-modify` trouble applies) and wants no content CSS — so the cheap
  boundary is sufficient. Where `attachShadow` is unavailable the dialog renders in
  the host div instead: cosmetically at the page's mercy, but working.
- **The HOST element carries geometry and the `--tt-z-base` rung INLINE.** It is
  the one part still exposed to the page, and an inline style cannot be
  out-specified. Custom properties inherit through a shadow boundary, so the rung
  still lifts with the rest of the ladder in Modern inline mode.
- **Querying in needs `host.shadowRoot`** — that is what the harness tests do
  (`dlgHost()` / `dlg()`), and it is the one API cost of the boundary. Keyboard
  events are composed, so they still bubble out to the document and the Esc handler
  is unaffected.
- **The dialog still declares its own typography**, because inheritable properties
  (font, colour, direction) DO cross a shadow boundary and **form controls inherit
  no font at all** — an input with only a `font-size` renders in the UA's Arial
  beside panel text in the page's family. So the panel states
  family/size/line-height/letter-spacing once and every control inside is restated
  to `inherit`, with the reset written in `:where()` to keep it at `(0,1,0)` so the
  styled parts below can override it by simply coming later. (At `(0,2,0)` it
  silently ate the title's weight and the character grid's glyph size.)
- **One type scale for both dialogs: 14px semibold title, 13px body and controls,
  12px status and secondary previews.** New rows use those three; the only
  deliberately larger type is the special-character glyphs, which are content.
- **One dialog at a time** (`openDialog` closes the open one) — which is also what
  makes "press Replace while Find is open" reappear on the other tab.
- **Tabs switch VISIBILITY, they do not rebuild the body.** CKEditor had to copy
  every field value between its two tabs on each switch (`selectPage` override);
  here there is one set of inputs and the panel's `data-tab` hides what does not
  belong, so the values cannot drift.
- **The scrim is light (.25, not the pickers' .5) and the panel is pinned near the
  top of the viewport, not centred.** The find dialog exists to point at a
  highlighted match *behind* it.
- Deliberately **not** presideBootbox: an admin-page bootstrap modal, unavailable
  on the front end, unstyled by our variables — and subject to exactly the theming
  above.

**Still in the light DOM, and still exposed to this**: the anchor dialog
(`.preside-anchor-*`), the slash menu and the selection bubble. The anchor dialog
is the same shape of markup and would benefit from being ported onto
`openDialog()`; the other two are div-only and have not been reported as broken.

### Find and Replace (`src/findReplace.js`)

**Two buttons, ONE dialog** - `Find` opens it on the find tab, `Replace` on the
replace tab, exactly as CKEditor registered them
(`dialogCommand( "find", { tabId: "replace" } )`). Each tab shows the buttons
CKEditor's own tab had (Find; Replace + Replace All).

The **Replace icon is CKEditor's own metaphor redrawn**: its sprite is a bold `b`
and `a` with curved arrows swapping between them - one letter becoming another.
(A magnifier-with-arrows was tried first and read as nothing in particular at
16px.) The letters are SVG `<text>` with the family pinned, since the icon renders
both in the admin page and inside the editing frame and must not pick up either
one's font. CKEditor draws two arrows; ours draws one - **checked by rasterising
both at a true 16px and magnifying the result**, where the second arrow crowds the
`a` into a smudge. Do that again before redrawing any of these: vector previews at
96px tell you nothing about the size the toolbar actually uses.

- **Searching never touches the document.** The current match is a ProseMirror
  **decoration** (`tiptap-find-match`), not the real `<span>` CKEditor inserted and
  then unpicked on close. So a search cannot dirty the form, cannot appear in
  `getData()`, and has no clean-up path to get wrong - the same reasoning as the
  outline navigator's landed-on highlight. The colours ARE CKEditor's
  (`config.find_highlight`: `#004` on white).
- **The search unit is a "run"**: one uninterrupted stretch of text inside a single
  textblock. That is what makes a match **never span a block boundary** (CKEditor's
  walker treated one as a match boundary and reset) while still spanning inline
  marks, so `bold` finds `<b>bo</b>ld`. An inline atom (an anchor, an embed) breaks
  a run for the same reason a block does.
- **"Match whole word" uses CKEditor's own boundary test** - its punctuation set
  plus the C0 and Unicode space ranges - and the start/end of a run counts as a
  boundary.
- **Replace is TWO clicks**, as it was in CKEditor: the first finds and highlights,
  the second replaces *that* match. Changing any option invalidates the current
  match so the next click re-finds. Do not "fix" this into one-click replace
  without knowing that it is the CKEditor behaviour being reproduced.
- **Replace All is one transaction**, hence **one undo step** (CKEditor bracketed
  its loop with `saveSnapshot`), and applies matches **back to front** so earlier
  edits cannot invalidate later positions. Replacement text goes in via
  `tr.insertText`, which carries the marks across the range - replacing a word
  inside a link or a bold run keeps its formatting.
- Messages are CKEditor's own strings (`notFoundMsg`, `replaceSuccessMsg`) shown in
  the dialog's **status line** rather than through `alert()`.
- **Revealing a match** reuses outline.js's three-branch logic: scroll the frame's
  own document when the field is capped/maximized, otherwise move the admin page
  **only if the match is genuinely off screen**. A `scrollIntoView()` fallback on
  an uncapped field makes the browser scroll the whole admin form instead.
- On close the highlight goes and the match the user stopped at becomes the
  **selection**, with focus back in the editable (CKEditor's `onHide`).
- Excluded from the Modern selection bubble: they act on the whole document and
  open a modal, which is persistent-chrome work, not selection work.

### Insert Special Character (`src/specialChar.js` + `src/specialChars.js`)

A modal grid in CKEditor's shape: **17 columns**, hover fills the two preview panes
(the character large, and its HTML form as text), click inserts and closes. Arrow
keys walk the grid; Enter/Space inserts.

- **`src/specialChars.js` is DATA**: `CKEDITOR.config.specialChars` transcribed
  byte-for-byte (210 entries, including the two upstream entries missing their
  semicolon - the HTML parser decodes them anyway, so the copy stays faithful),
  plus the English character names from CKEditor's dialog language pack. A site
  overrides the list the CKEditor way: `defaultConfigs.specialChars` (string or
  array; `[ char, label ]` pairs are honoured).
- **The per-character NAMES stay English data, not i18n keys.** ~110 tooltip
  strings through `cfrequest.tiptapI18n` would grow every admin page's payload for
  text only seen on hover; `charName()` still checks i18n first
  (`specialchar.char.<key>`), so an override is possible. The dialog's own chrome
  IS localised the normal way.
- **What is inserted is the CHARACTER, not the entity** - CKEditor built a span
  from the entity and inserted `span.getText()`. It goes in with `tr.insertText`,
  so it inherits the marks at the caret (an ellipsis added mid-bold-run stays
  bold). CKEditor's output writer re-encoded non-ASCII back to entities on save
  (`config.entities`); that is deliberately NOT reintroduced - it is a
  whole-document output concern and it would rewrite every accented character in a
  field the first time it was saved.

### Text direction (`src/bidi.js`)

`BidiLtr` / `BidiRtl` reproduce CKEditor's `bidi` plugin, and the markup is the
whole point:

- **It writes the `dir` ATTRIBUTE on the block**, never a CSS `direction` - and it
  **strips an existing inline `direction:`** on the way past (as CKEditor's
  `removeStyle` did), because that style would otherwise silently beat the
  attribute the button just wrote. The rest of the `style` is untouched.
- **`useComputedState` (CKEditor's default) means applying the direction a block
  would have ANYWAY removes the attribute instead of writing it.** So in an LTR
  field, "left to right" on a plain paragraph writes **nothing at all**, and on a
  `dir="rtl"` paragraph it removes the attribute rather than writing `dir="ltr"`.
  That is why the code compares against the **parent's computed direction** instead
  of just setting the attribute. `useComputedState: false` is not supported (an
  obscure config, and toolbar `COMMANDS` runners get the editor, not the field
  config).
- **The button state is the COMPUTED direction at the caret**, which means the LTR
  button reads as *on* in an ordinary untouched LTR field. That looks odd and it is
  exactly what CKEditor did (`refresh` sets `bidiltr` ON whenever the computed
  direction is "ltr"); the alternative reports "no direction set" as "left to right
  is off", which is worse.
- **Which node takes the attribute**: a container type the selection fully encloses
  (table/row/cell, list, list item, blockquote, div) takes it and its children are
  left alone - so the drag grip's NodeSelection on a table writes
  `<table dir="rtl">`; otherwise every **textblock** the selection touches takes
  it, which is the ordinary caret-in-a-paragraph case writing `<p dir="rtl">`.
- `dir` had to enter the schema, as a global passthrough attribute in
  `src/extensions/presideAttributes.js`. Side benefit: a `dir` in existing
  CKEditor-authored content **stops being dropped on save**.

Tests: `harness/test-realworld.html` **T22** (dialog/tab wiring, prefill from the
selection, highlight without touching the document, no match across a block
boundary, match-case/whole-word, two-click Replace, Replace All's count message and
single undo step, close-selects-the-match, **the shadow boundary** — the page
injects the admin theme's own `!important` rules on legend/label/fieldset/input/
button and asserts none of them land, plus one family and only the three type
sizes; all five boundary assertions fail if the shadow root is removed, which is
how they were verified), **T23** (the whole 210-character list in
17 columns, CKEditor's names, both previews, character-not-entity insertion, marks
preserved) and **T24** (dir written/removed per `useComputedState`, inline
`direction:` stripped, container vs textblock target, existing `dir` round-trips).
T2 now asserts these five buttons RENDER, and its "unmapped" list is down to
Scayt/SelectAll/CreateDiv/Language/Cut/Copy.

## The editing iframe (isolation + content-CSS fidelity)

**The editable lives in its own document.** `src/editorFrame.js` builds a
per-editor `<iframe>`; the toolbar, footer, outline rail and pickers stay in the
host page. This is what CKEditor 4 did, and returning to it deleted three CSS
transforms that each existed only because we were not in an iframe.

### Why an iframe and not CSS, and not shadow DOM

Three separate problems, one boundary:

1. **Isolation.** The previous `all: revert` wall was a *specificity contest* at
   `(0,2,0)`, so it was beaten by any admin/theme rule at `(0,2,1)` or above and
   by **any `!important`** — both of which real admin stylesheets contain. No
   ordering wins that argument. It also cost a release: reverting `all` discards
   the presentational hint WebKit maps `contenteditable` onto, so the editable
   went read-only in Safari. A shadow root would have fixed this much, and
   neither of the next two.
2. **`rem`.** Always resolves against the **document root** — spec, no
   exceptions, and a shadow root is not a new root. The admin is
   `html{font-size:10px}` (Ace/bootstrap), so a site's rem-based content CSS
   rendered at 62.5% of its intended size. A frame has its own root, so `1.2rem`
   is simply `19.2px`.
3. **`vw`/`vh` and media queries.** Resolve against the frame's own box — roughly
   the width the content will really be rendered at — instead of the whole admin
   viewport. A real site's `clamp(1.125rem, 0.9375rem + 0.5vw, 1.375rem)` base
   size was being computed for a 1600px viewport inside an 800px editor.

**Deleted with the wall:** the reset and its specificity contract, the
`html`/`:root`/`body` → editable selector mapping, and the rem→px rebasing.
Content stylesheets go in as plain unmodified `<link>`s — same bytes, same cache
as the site. An unstyled field is therefore **raw browser defaults**, exactly as
CKEditor's iframe with no `contentsCss` was; the editor imposes no content
typography of its own (`p{margin:0 0 .6em}` went too — at `(0,2,1)` it had been
beating sites' own `p` margins, including on the real page in Modern mode).

Do not reintroduce an `all: revert` anywhere in the editable's cascade.

### The rules

- **Synchronous by contract.** Core's `frontendEditors.js` reads `.editor`
  straight off the constructor, so the frame is appended, its document written
  and the editor built in ONE stack. `open()/write()/close()` into a freshly
  appended `about:blank` is synchronous and the document is not replaced
  afterwards (verified in chromium, webkit and firefox). **The frame must be in
  the document before `contentDocument` exists** — hence it is created *after*
  the container is inserted.
- **Our own stylesheet is copied in as `cssText`, not linked** — it must apply
  before the first height measurement, and a `<link>` would still be loading.
  The `--tt-*` variables are declared for `.tiptap-editor-doc` (the frame's
  `<html>`) as well as the container, and `applyTheme()` mirrors the dark class
  onto the frame root, because a class on the container cannot cross documents.
- **Height is measured, not CSS.** A frame is a replaced element and does not
  grow with its content. `refit()` applies `min`/`maxHeight`; the editor also
  refits **on every update, synchronously** — a ResizeObserver alone leaves the
  frame a tick behind its content, and chrome that clamps to the visible band
  then correctly refuses to show for a block that is briefly outside it (T15
  caught the `+` button silently doing nothing). The initial fit is re-run after
  the editor is built, since `setHeights()` runs before the editor exists and
  would otherwise measure an empty mount.
- **Whether the frame scrolls is DERIVED from its rendered height**
  (`syncOverflow()`), not from the configured `maxHeight` — a CSS cap can clamp
  it too, which is exactly what the front end does with a viewport-relative
  `max-height` so core's fixed save bar stays clear. Scrolling is otherwise off:
  on an auto-growing frame a scrollbar is pointless *and* a feedback loop
  (appearing changes the content width → text rewraps → height changes →
  scrollbar toggles again). The ResizeObserver observes the **body only**, never
  `documentElement` whose box is the height we write, and defers through rAF.
- **What lives where.** The frame holds the editable and the chrome glued to the
  content: embeds/image tools, **the drag gutter** and the table bubble's target.
  The host holds the toolbar, footer, outline rail, pickers, slash menu.
- **`surfaceOf()` / `pageRect()`** let host-side chrome work against either
  shape: `mount` now means *the frame* for a boxed editor and *the mount div* in
  Modern inline mode. `box()` is the visible editor box (a frame's own rect IS
  the viewport its content is clipped to), `toHost()` translates content
  geometry, and `onScroll()` binds to whatever actually scrolls — **an
  `<iframe>` never fires a scroll event itself**, its document does.
- **THE DRAG RAIL IS INSIDE THE FRAME, and that is not cosmetic**: a drag must
  begin and end in one document. With the grip in the host and the editable in
  the frame, `dragstart` fired in one and ProseMirror's drop handling ran in the
  other — `view.dragging` armed correctly and the drop then did nothing, so a
  dragged table *vanished* (T16). Living in the frame also means no coordinate
  translation in that module at all. The frame's `body` is `position:relative`
  so the absolutely-positioned rail scrolls with the content.
- **Never `view.dom.closest( ".tiptap-editor-container" )` — use `containerOf()`**
  (`editorFrame.js`). `closest()` stops at the root of the editable's OWN
  document, so from inside the frame it returns null and the caller silently
  operates on nothing. That is exactly how the toolbar's **Maximize** button
  stopped working (it toggled a null container) and how the slash menu lost its
  light/dark sync. Toolbar `is-active` states also refresh right after a button
  click, not only on the next transaction, because Maximize changes chrome
  without touching the document.
- **The gutter classes go on whichever root can reach the mount** — the frame's
  `<html>` for a boxed editor. The padding they apply is on `.tiptap-editor-mount`,
  which a class on the container can no longer select.
- **The slash menu's manual session binds keys to BOTH documents.** The popup is
  body-portalled in the host (it has to escape a capped field's clipping) but the
  user types into the frame, so a host-only listener never saw the keystrokes.
- **Four table/pre rules lost their `.tiptap-editor-container` prefix.** It was
  there purely for specificity against the reset, and inside the frame there is no
  container ancestor, so it had become actively wrong (T19's `td` box-sizing and
  T12's `.selectedCell` highlight both caught it).
- **Modern inline mode gets NO frame.** There the editable IS the site page: it
  must inherit the theme, and `rem`/`vw` already resolve against the site's own
  root and viewport. It is correct by construction.

### What still transforms content CSS

`applyContentStyles()` keeps the scope/rewrite/rem-rebase path for **one**
consumer: the Format/Styles dropdown previews (`.tiptap-fmt-preview`), which are
toolbar chrome in the host document and cannot move into the frame. They keep an
`all: revert` of their own — needed there, and harmless, because a preview is
decorative. The old "inject the sheet **unscoped** on fetch failure" fallback is
gone: it dumped a whole site stylesheet into the admin's own `<head>`, and the
editable no longer depends on that path succeeding.

Tests: `harness/test-realworld.html` **T19** asserts the boundary itself, that an
admin `!important` and a higher-specificity admin rule do **not** reach the
content, that `rem` resolves against the frame root (`1.5rem` = 24px, not 15px)
and that `em` chains off it (`1.25em` = 30px), and that the content sheet arrives
unmodified. Its head carries the admin-leak emulation, including the two rule
forms that defeated the old reset.

## Safari: never build a command chain on an unfocused editable

`src/editorFocus.js` `focusEditable( editor )`. **Call it at every point where our
own chrome runs an editor command**, and chain off its return value:
`focusEditable( editor ).chain().focus().toggleBold().run()`.

Tiptap snapshots the transaction when a chain is created (`createChain()` does
`const tr = state.tr`) and dispatches that same transaction at `.run()`. Its
`focus` command contains a **Safari-only** branch that takes the DOM focus
*synchronously*, where every other engine defers it to a `requestAnimationFrame`:

```js
if ( isSafari() && !isiOS() && !isAndroid() ) { view.dom.focus( { preventScroll: true } ); }
```

A DOM focus makes prosemirror-view re-read the document selection and, if it
differs from `state.selection`, dispatch a correcting transaction. So on Safari the
state moves on mid-chain and `.run()` applies a transaction built from the state
before it: **`RangeError: Applying a mismatched transaction`, and the whole chain
is silently lost.** What that cost, all Safari-only:

- **every frontend editor threw as it opened** — core's `frontendEditors.js`
  calls `e.editor.focus()` from its own `instanceReady` handler (line ~174), and
  the throw aborted the rest of core's handler, including its scroll-to-the-editor;
- a **toolbar button pressed while the editable was not focused did nothing**;
- the **outline rail could not move the caret** (silently — its `try/catch`).

The way out is Tiptap's own guard, `if ( view.hasFocus() && position === null )
return true;` — so take the DOM focus **first, outside any transaction**, where it
is free to dispatch whatever it likes.

- **`CompatInstance.focus()` uses `view.focus()`, not `commands.focus()`** — no
  transaction is built, so there is nothing to mismatch, and it is the more
  faithful reading of CKEditor's `focus()`, which focused the editing surface and
  never moved the caret. Same in `maximize.js` (whose `try/catch` had been
  swallowing exactly this).
- **`chain().focus( pos )` is NOT protected by `focusEditable()`** — passing a
  position deliberately skips the `hasFocus()` guard. Use
  `setTextSelection( pos )` on the chain instead; that is what `outline.js` does.
- The harness pages carry the same discipline as `edFocus( ed )`, because a
  synthetic test drives the editor from an unfocused editable where a real user's
  click would have focused it natively.

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
- **THE OVERRIDE BLOCK IS DECLARED FOR BOTH DOCUMENTS**
  (`.tiptap-editor-container.tiptap-dark,.tiptap-editor-doc.tiptap-dark`), exactly
  as the light block is, and the mount-scoped dark rules are prefixed with a bare
  `.tiptap-dark` rather than the container. This was a real bug for as long as the
  editing frame has existed: with the override on the container alone it **could not
  match inside the frame** — `theme.js` mirrors the class onto the frame's own
  `<html>` precisely because a container selector means nothing in there — so every
  `--tt-*` variable kept its LIGHT value inside the editable's document. Dark mode
  drew a dark surface (the container, behind a transparent frame) under **black
  content text**, with light table borders, light embed placeholders and a light
  selected-cell highlight. Anything new that colours the editable or the chrome
  inside the frame must be reachable from the frame root, never from the container.
- A field's own content stylesheets (`contentsCss`/`stylesheets`) are authored
  for a light page, so any explicit colour they set still wins inside the
  editable — intentional (WYSIWYG fidelity), so dark mode is a chrome-comfort
  feature, not a content preview.
- Strings are the `toolbar.theme.dark` / `toolbar.theme.light` i18n keys (the
  tooltip describes what a click will do; the icon shows the current mode).

## Frontend (in-page) editors: clearing the site's own chrome

Core opens a frontend editor as `position:fixed; top:100px; z-index:100` with a
`z-index:99` sheen (`system/assets/css/admin/frontend/frontendEditor.less`) —
numbers that predate sticky site headers. A theme header above that band paints
**over** the editor, and being anchored to the top of the viewport it lands
exactly on the toolbar: the toolbar is simply not there. `src/frontendFit.js`
fixes that, in two steps, and both are **frontend-only**.

1. **Win the stack.** The site's own fixed/sticky chrome is measured
   (`siteChromeZ()`) and `--tt-z-base` is set above the highest of it.
   **Every z-index this extension owns is expressed against that one variable**
   in `src/tiptap.css`, so the whole ladder lifts together and keeps its order:
   sheen (`base-1`) < frontend container (`base`) < maximized (`base+10`) <
   picker overlay (`base+960`) < anchor overlay / slash menu (`base+1060`).
   **Never write a literal z-index for those** — a fixed rung is one that stops
   moving with the rest, which is exactly how a maximized editor ended up under
   a site header while the un-maximized one was fine.
   - The var's **default is 1040**, chosen so the rungs compute to the previous
     literals (1039/1040/1050/2000/2100). In the admin the var is never set, so
     admin stacking is byte-identical to before — asserted on `/tiptap.html`.
   - Painting over the header is the right answer, not a compromise: the editor
     is modal and the sheen already dims the page behind it.
2. **Push down whatever still covers us** — an element with a z we refused to
   out-bid (the sweep ignores anything ≥ 2e9, to leave the ladder headroom), or
   one that only appears later. The test is `document.elementsFromPoint()` at the
   editor's own top edge, **not** more z-index arithmetic: it asks the question
   that matters ("is something drawn on top of us *here*?") in real paint order,
   so nested stacking contexts, opacity and transform layers resolve for free.
   The push is published as `--tt-frontend-offset` and the editable's max-height
   gives back exactly that much, so core's fixed save bar stays clear.

- The `getComputedStyle` sweep is affordable because it runs **once per editor
  open** (the page's chrome does not change while a modal editor is open), not
  per frame. The geometric pass re-runs rAF-throttled on resize/scroll.
- Our own elements are excluded from the sweep or it ratchets against itself
  every time an editor opens. `.content-editor-editor-container` and the sheen
  are listed in their own right because `frontendEditors.js` re-parents both to
  `<body>`, so neither is inside `.content-editor` by then.
- Everything is undone by a teardown registered on `instance._cleanups` (run by
  `destroy()`) — frontend editors are created and destroyed on **every** edit-mode
  toggle, so leaving the var or the inline `top` behind would leak.
- `harness/test-frontend-maximize.html` carries a `z-index:5000` site header, so
  it reproduces the original bug and exercises step 1; bumping that header to
  `2147483647` in the console exercises step 2.

## jQuery insert-order fix (src/jqueryOrderFix.js)

Some Preside builds ship a jQuery ("2.2.5-jqnext") whose **`after()` and
`prepend()` insert multi-node HTML strings in REVERSE order** (fixed-reference
`insertBefore` loop instead of a fragment; `before()`/`append()` are fine).
Core frontendEditors.js re-renders an edited region with
`$( startComment ).after( data.rendered )` after **every save**, so on an
affected build the whole region came back in reverse block order — in Classic
and Modern alike. The editor itself always looked right (it renders from the
textarea), so the scrambling only showed once editing closed — the original
symptom was "my content disappears when I switch Quick edit off".

- **Feature-detected per method at facade parse time** (a real 2-node probe
  insert) — a healthy build is left completely untouched, and the shim
  self-disables the day the build is fixed upstream.
- When broken, the wrapper **pre-reverses string content that parses to 2+
  top-level nodes and delegates to the ORIGINAL method** — its reversing loop
  re-reverses into the correct order, and jQuery's own internals (script
  evaluation, multi-target cloning) still run. Deliberately NOT a
  reimplementation: node/jQuery-object/function content passes through
  untouched.
- `harness/test-frontend-inline.html` **emulates the broken build** (a shim
  before the facade loads), so T0 plus every save-path case exercises the
  healed path; the DB content was never affected (only the client DOM), so a
  reload always showed the truth.

## Frontend edit-mode dropdown (Off / Classic / Modern) + Modern inline editing

Core's admin frontend toolbar has a binary "Quick edit" checkbox switch. The
extension replaces it — **JS-only, zero core edits** — with a 3-option dropdown
styled like the adjacent Draft-view dropdown: **Off**, **Classic** (core's
overlays → fixed modal editor, unchanged), and **Modern** — inline, gutentap-style
editing of the page's single rich region. Four modules:
`src/editModeSwitch.js` (the dropdown), `src/inlineMode.js` (enter/exit + the
mount swap), `src/selectionBubble.js` (the only toolbar Modern has), plus small
refactors of `toolbar.js` (`renderNames()` exported) and `frontendFit.js`
(`liftChromeZ()` exported).

- **Core's checkbox stays in the DOM (hidden) and stays the source of truth for
  "is editing on"** — Off/Classic drive it programmatically, so core's
  `_presideEditMode` cookie, delegated handler and "e" hotkey keep working
  untouched. Our `_presideEditModeStyle` cookie (`classic|modern`) is the only
  new state. The dropdown needs **no JS binding of its own**: core's patched
  bootstrap delegates `[data-toggle$=dropdown]` on `document`.
- **Init on DOMContentLoaded** (`facade.js` `initChrome`) — core's
  `frontendEditors.js` is a parse-time IIFE, so by then its handlers are wired
  and its cookie restored; we compose on top, never race it.
- **Modern reuses core's flow end-to-end** (the load-bearing design):
  `inlineMode.enter()` marks the textarea `data-tiptap-inline=<containerId>` and
  triggers core's own overlay click → `toggleEditMode(true)` →
  `new PresideRichEditor(ta)`. The facade sees the marker at construction time,
  detaches the rendered nodes between the region's
  `<!-- container: _x -->…<!-- !container: _x -->` comments (detached, NOT
  display:none — core's 1s geometry interval must measure the live editor) and
  mounts `.tiptap-editor-container.tiptap-inline` in their place. Save / Publish
  / Cancel / Esc / ctrl+Enter / version-restore are core's untouched closures.
- **Save-vs-cancel is DERIVED from connectivity, never flagged**:
  `instance._cleanups` run at the top of `destroy()`. Cancel path → our container
  is still connected between the comments → remove it, re-insert the stored
  originals (byte-identical restore; asserted). Save path → core's
  `setContent(data.rendered)` already replaced the region and detached us → keep
  the fresh render. Policy (user decisions): **every exit lands on Off** —
  cancel/Esc discards and leaves edit mode; save/publish also drop to Off
  because the page re-rendering with the saved content IS the visible "it
  saved" confirmation (revised from an earlier re-enter-after-save behaviour,
  which looked identical to before the save and read as "nothing happened").
- **Switching Off/Classic with unsaved edits prompts** (`editmode.unsaved.confirm`,
  presideBootbox with a window.confirm fallback): OK saves the draft through
  core's own button — the region re-renders, so the edits stay visible after
  the switch — Cancel discards them, exactly like the Cancel button. Dirtiness
  is `getData() !== initialdata` on the facade instance (core's `isDirty()` is
  hard-coded true and unusable). The "e" hotkey path re-checks the checkbox and
  routes through the same guard. **The after-save target mode rides ON the
  inline session** (`saveDraft({ after })` → `onExit( reason, after )`) —
  deliberately NOT switch-module state: onExit callbacks dispatch via
  setTimeout, so a stale one from a previous session can fire between "prompt
  accepted" and "save completed" and would consume it (the bug was Modern
  re-entering instead of landing on Off; T6b).
- **The container is kept, chrome-less** (`.tiptap-inline`): it still carries the
  `--tt-*` variables, `position:relative`, and the key-isolation boundary that
  the table bubble / drag handle / maximize all need. No toolbar/footer, no
  height caps, no `applyContentStyles()` (the editable IS the site page and
  inherits its CSS). The **outline navigator stays**, in its `fixed` variant
  (`outline.js` `opts.fixed`): pinned to the viewport's right edge (`.is-fixed`,
  `--tt-z-base + 40` rung) with capacity measured from the viewport instead of
  the editable — the page is the scroller inline, so an editable-centred rail
  would sit mid-document mostly off-screen. Still a container CHILD (the
  `--tt-*` vars keep cascading); the click-scroll / active-tracking paths
  already handled the window-as-scroller case. The drag-handle gutter is given back as negative
  `margin-left` so the content column stays exactly where the rendered page had
  it.
- **Modern availability = exactly one `.content-editor.richeditor`** on the
  page; otherwise the option is disabled with a tooltip and the style cookie is
  left untouched (the next qualifying page resumes Modern). While Modern is
  active the OTHER regions' overlays are hidden (`visibility:hidden`, not
  `display:none` — core scrolls to `$editor.offset()` on open, and a 0,0 overlay
  would yank the page to the top) **and re-absoluted**: core's
  `frontend-editors-editing` state flips `.content-editor` to
  `position:relative` (in flow, at the end of `<body>` where core appended it)
  while its 1s sizing interval sets an explicit region-height on it —
  `visibility:hidden` keeps layout space, so without `position:absolute`
  (core's own non-editing value) Modern showed a region-sized band of invisible
  whitespace under the page. The same stale inline sizes also outlived the
  session (core never clears them, and with edit mode OFF `.content-editor` is
  position:STATIC — in flow), so `editModeSwitch.js` clears them on every
  off-landing (`clearRegionSizes()`, run from the document-level checkbox
  change handler, which fires after core's own delegate on every path —
  dropdown, "e" hotkey, cancel-button exit).
- **`src/selectionBubble.js`** appears for any FOCUSED text context: a
  selection, a clicked caret, or the caret being typed at — the block having
  focus IS the context, and it only drops on blur or a non-text selection
  (NodeSelections belong to imageTools, cell selections to the table bubble).
  A `mouseup` listener covers the click that moves no caret (no
  selectionUpdate fires for it), and the button set is **rebuilt only when the
  caret changes block** (`contextKey()`), not per keystroke — otherwise it just
  refreshes is-active states and repositions. Positioning: 24px clear of the
  text (GAP; flips below under the admin toolbar), **left-aligned to the
  caret's BLOCK** — never centred on / following the caret, so typing moves it
  only vertically. **Idle fade**: ~2.5s with no click/keystroke adds `is-idle`
  (opacity 0, pointer-events none — still is-open); any activity or hovering
  the bubble fades it back. It renders the field's
  configured toolbar via the SAME `renderNames()` the main toolbar uses, minus
  the never-in-bubble set (Maximize/Source/Undo/Redo/Theme/HR/Table/pickers),
  filtered per block by its own `BUBBLE_APPLIES` map (Outdent/Indent only in
  lists, Unlink only in links, **Format always** — `can().setParagraph()` is
  false in a paragraph, which would hide it exactly where it is most wanted).
  Body-portalled on the `--tt-z-base + 1060` rung, **always light** (the site
  page is the editing surface — deliberately no `prefers-color-scheme` block);
  a capture-phase `mousedown` preventDefault keeps the editor selection through
  any interaction.
- **The drag rail is body-portalled in inline mode** (`dragHandle.js`
  `{ fixed: true }`): the container sits in the SITE's page flow, where a gutter
  carved out of the theme's layout (or hung off it with negative margin) is one
  `overflow:hidden` ancestor away from being clipped into invisibility — the
  original "why is the + / grip missing?" bug. Fixed mode reserves NO gutter
  (the content column keeps the rendered page's exact geometry), positions the
  rail in viewport coords just left of the mount — **except on a full-width
  layout** (mount left < 60px: nowhere to float, the rail sat at negative x,
  the bug's second life), where it falls back to reserving an interior gutter
  (`tiptap-gutter-*` re-asserted for `.tiptap-inline` in the css, since the
  inline padding reset would otherwise win) — hides on window scroll, and
  carves out container→rail mouse travel so the grip is not yanked away en
  route. It carries its own light styling (outside the `--tt-*` scope) and is
  removed on destroy (leak-audited).
- The dropdown trigger's icon is **our own inline SVG** (`ICONS.EditMode`,
  Tabler "article") — not font-awesome's pencil, which already means "Full
  edit" one control to the right.
- **`liftChromeZ()`** (frontendFit step 1, now exported) runs on Modern entry:
  the inline editor is in page flow (nothing to push down) but the bubble /
  slash menu / picker overlays still have to out-bid a sticky site header.
- **Churn-safety is load-bearing**: Modern destroys and recreates the editor on
  every save. `instanceReady` is guarded with `tiptap.isDestroyed` (consumers
  call `getData()` in that handler), the slash-menu popup is removed in the
  extension's `onDestroy` (it used to leak one `<body>` div per cycle — T18),
  and the bubble/table/drag clamps use the **mount∩viewport** intersection (the
  raw mount rect is page-height inline, which parked chrome off screen).
- Tests: `harness/test-frontend-inline.html` (self-running, 56 assertions,
  backed by `harness/mockFrontendEditors.js` — a faithful trimmed transcription
  of core's contract — and `/mock/frontend/*` endpoints in `server.mjs`);
  `test-realworld.html` T18 covers the slash-menu leak. **jQuery's
  `.trigger("click")` skips native handlers on `<a>`** — the dropdown items need
  native `.click()` in tests.
- i18n keys: `editmode.*`, `bubble.title` (the three usual places).

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
