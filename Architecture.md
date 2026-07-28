# Architecture

`preside-ext-tiptap` is a Preside CMS extension that replaces the vendored
CKEditor 4 rich editor with a self-contained Tiptap v3 editor. It is a
**drop-in replacement**: it reproduces Preside's editor integration contract
exactly (globals, registries, event names, stored-content token format, picker
protocol), so no other Preside code — forms, renderers, AJAX endpoints, picker
pages — has to change. It makes **zero core Preside edits**; everything is done
through extension-level override mechanisms.

The codebase is deliberately layered. From the bottom up:

1. **Core Tiptap** — stock Tiptap v3 packages providing the editing engine.
2. **Custom Tiptap extensions + supporting modules** — Preside-specific nodes,
   marks, serialization, styling and picker plumbing.
3. **The Preside shim/facade layer** — the CKEditor-shaped API surface, plus
   the CFML-side integration (Sticker asset-id override, view override).

---

## Layer 1: Core Tiptap

Declared in `package.json`, imported in `src/index.js`, bundled into
`assets/dist/tiptap.bundle.min.js` (exposed as `window.PresideTiptap`).

| Package | What it provides |
|---|---|
| `@tiptap/core` | `Editor`, `Extension`, `Node`, `Mark`, `mergeAttributes` — the editor engine and extension primitives. Re-exported on `window.PresideTiptap` so the facade and custom extensions can use them without a second copy. |
| `@tiptap/pm` | The bundled ProseMirror packages (`presideLink.js` imports `Plugin` from `@tiptap/pm/state` for its double-click handler). |
| `@tiptap/starter-kit` | Paragraphs, headings, bold/italic/strike/underline, lists, blockquote, code block, horizontal rule, history (undo/redo), etc. The facade configures it with **`link: false`** — StarterKit's Link mark is disabled because `PresideLink` owns link parsing/serialization. |
| `@tiptap/extension-subscript` / `-superscript` | The `Subscript` / `Superscript` toolbar buttons. |
| `@tiptap/extension-text-align` | `JustifyLeft/Center/Right/Block`, configured for `heading` + `paragraph`. |
| `@tiptap/extension-table` (`TableKit`) | The `Table` toolbar button — registers Table + TableRow + TableHeader + TableCell in one kit (`-table-cell/-header/-row` are direct deps of the kit). |
| `@tiptap/extension-placeholder` | Placeholder text, wired from the textarea's `placeholder` attribute / `ckeditorDefaultPlaceholder`. |

`src/index.js` assembles these plus the custom extension **factories** into
`window.PresideTiptap = { Editor, Extension, Node, Mark, mergeAttributes,
StarterKit, extensions: { … }, version }`. The subscript/superscript/
text-align/table/placeholder set is grouped behind
`extensions.buildRichText(cfg)` and instantiated per-editor by the facade.

`src/index.js` also contains something that is *not* Tiptap at all: a
**pre-presidecore `CKEDITOR` global shim** (see Layer 3) — it lives here
because this bundle is the script that loads *before* presidecore.

---

## Layer 2: Custom Tiptap extensions and supporting modules

All custom extensions are exported as **factory functions**
(`createPresideX(deps)`) rather than singletons, so per-editor config
(picker categories, `buildAdminLink`/`buildAjaxLink`) can be injected by the
facade and the harness can inject mocks.

### The token contract (why most of this layer exists)

Preside stores rich content with placeholder tokens that the server-side
`ContentRendererService` expands at render time:

```
{{image:<urlencoded-json>:image}}
{{attachment:<urlencoded-json>:attachment}}
{{widget:<widgetId>:<urlencoded-json>:widget}}
```

and link hrefs of the form `{{link:<pageId>:link}}[#anchor]`,
`{{asset:<assetId>:asset}}`, `{{custom:<base64-json>:custom}}`.

Server-side renderers, forms and AJAX endpoints all assume this stored markup
is byte-identical after a round trip through the editor. **The tokens are the
persistence format; the editor-internal representation is a client-side
detail.**

### `src/tokens.js` — embed token ⇄ placeholder conversion

- `detokenize(stored)` (on load / `setData`): regex-replaces each
  image/attachment/widget token with a placeholder element the custom nodes'
  `parseHTML` recognises:
  `<span data-preside-image="true" class="img-placeholder" data-raw="{{image:…}}"></span>`
  (mirrors CKEditor's dataFilter text rule). Link tokens are **not** touched —
  they live inside `href` attributes and belong to `PresideLink`.
- `tokenize(html)` (on save / `getData`): a DOM pass that replaces every
  `[data-raw]` element with a text node containing its raw token — the exact
  original bytes. Only the embed nodes carry `data-raw`, so this is targeted.

### `src/extensions/presideEmbeds.js` — `presideImage`, `presideAttachment`, `presideWidget`

One generic `makeEmbedNode(opts, deps)` produces all three. Each is an
**inline atom node with a single `raw` attribute** holding the untouched token
string:

- `parseHTML` matches `span[data-preside-*]` (what `detokenize` emitted) and
  reads `data-raw`.
- `renderHTML` emits the same placeholder span back, so `tokenize()` can
  restore the raw token verbatim. The token is never parsed into a structured
  model — byte fidelity by construction.
- A **NodeView** renders a live preview by POSTing to the *same* AJAX
  endpoints the CKEditor widgets used:
  `assetManager.renderEmbeddedImageForEditor`,
  `assetManager.renderEmbeddedAttachmentForEditor`,
  `widgets.renderWidgetPlaceholder`.
- Commands per node: `insertPresideX(raw)` and `openPresideXPicker()`
  (opens the real Preside picker page via `presidePickerModal.js`).
- **Double-click** an embed selects the node and re-opens its picker
  prefilled (widget id + config JSON extracted from the raw token) — commit
  then does `updateAttributes` (edit-in-place) instead of insert.

### `src/extensions/presideLink.js` — the `presideLink` mark

Replaces StarterKit's Link mark. Stores `href` **verbatim** — including
`{{link}}`/`{{asset}}`/`{{custom}}` tokens — plus
`target`/`rel`/`title`/`referrerpolicy`. `renderHTML` emits only non-null
attributes so stored markup stays clean. Commands:

- `openPresideLinkPicker()` — opens Preside's real link-picker iframe
  (`linkpicker.index`), prefilled from the current mark's parsed attributes
  when editing an existing link; also passes the document's anchor names
  (collected from `presideAnchor` nodes) so the picker's "anchor" type works.
- `applyPresideLink(data)` — converts link-form data to attributes via
  `getLinkAttributes()`; inserts link text when the selection is empty,
  otherwise `extendMarkRange().setMark()`.
- `unsetPresideLink()` — removes the mark.

A small ProseMirror plugin opens the picker on **double-click** of a link.

### `src/presideLinkSerialization.js` — the byte-exact link-token codec

`getLinkAttributes(data)` / `parseLinkAttributes(attrs)`, **ported verbatim**
from CKEditor's `presidelink/plugin.js`. Pure and framework-agnostic
(unit-tested standalone in `harness/test-link-serialization.mjs`). Handles all
Preside link types: sitetree link, asset, url, anchor, email (including the
`javascript:void(location.href='mailto:'+String.fromCharCode(…))` anti-spam
encoding, default protection mode "encode"), email variable, and the
`{{custom:base64(json,v:2):custom}}` fallback. Also `pickerScalar()` — unwraps
Preside object-picker values that arrive as JSON-array strings (`["PAGE-1"]`)
so the raw array text never leaks into a token. The rare CKEditor
"custom-function" email-protection mode is deliberately not ported.

### `src/extensions/presideAnchor.js` — named anchors

Inline atom node reproducing CKEditor's anchor plugin. Parses empty,
href-less `<a name|id|data-cke-saved-name>` elements (content-bearing anchors
are left alone), renders back `<a id="name" name="name"></a>`. A NodeView
shows a visible ⚓ marker; double-click edits the name via a small self-built
overlay dialog (no Preside picker — CKEditor's anchor dialog was also just a
single text field). These nodes feed the link picker's anchor list.

### `src/extensions/presideAttributes.js` — attribute fidelity

Two pieces preventing round-trip data loss (StarterKit drops unknown
attributes):

- `createPresideAttributes()` — an `Extension` adding global `class`/`style`
  passthrough attributes to all block-ish types (paragraph, headings, lists,
  table nodes, blockquote, codeBlock).
- `createPresideInlineStyle()` — a low-priority `span` mark that keeps
  `class`/`style` on inline spans, explicitly declining the embed placeholder
  spans and spans with neither attribute.

This is also the foundation a future stylesheetParser-style "Styles" dropdown
would build on.

### `src/normalize.js` — output normaliser

Applied in `getData()` **after** `tokenize()`. Brings Tiptap's serialized
HTML closer to CKEditor's stored form so migrating an existing corpus produces
clean diffs instead of churn: unwraps a single attribute-less `<p>` inside
`li/td/th/blockquote`; slims table markup (drops `<colgroup>`, table `style`,
default `colspan/rowspan="1"`); drops one trailing empty `<p>`. Idempotent by
design; a `<p>` carrying class/style is left wrapped so attributes are never
lost.

### `src/presideStyles.js` — content CSS scoping

CKEditor edited inside an iframe, so site content CSS could load there without
touching admin chrome. Tiptap edits in the page DOM, so `applyContentStyles()`
fetches each configured stylesheet, parses it via the browser CSSOM (handling
`@media`/`@supports`/`@font-face`), and re-injects it with every selector
prefixed by two scopes: `.tiptap-editor-mount .ProseMirror` (the editing
surface) and `.tiptap-fmt-preview` (so Format-dropdown items render in real
content styles, e.g. a green H2, like CKEditor's menu). Falls back to an
unscoped `<link>` only if the fetch fails (e.g. cross-origin without CORS).

### `src/presidePickerModal.js` — the picker iframe + `onDialogEvent` protocol

A CKEditor-"dialog"-shaped modal hosting a Preside admin picker page in an
iframe, speaking the exact protocol the existing picker pages implement — so
`linkpicker`, `assetmanager.pickerForEditorDialog` and `widgets.dialog` are
**reused verbatim, unmodified**:

- On iframe `load` (and OK/Cancel), it calls
  `iframe.contentWindow.onDialogEvent({ name, sender: dialog }, dialog)`.
  Returning `false` from the `ok` event keeps the dialog open (validation).
- The `dialog` object provides exactly the surface the picker behaviour files
  touch: `enableButton/disableButton("ok")`, `getContentElement("iframe")`
  (a stand-in element the iframe writes `_config` / `_widgetConfig` onto),
  `commitContent()` (reads that value and calls the caller's `onCommit(raw)`),
  `hide()`, `click("ok")`, `getParentEditor()`, `_plugin`
  (the link picker calls `dialog._plugin.updateLink(data, dialog)`), and
  `_.selectedElement` (edit vs insert detection).
- **Prefill** works the same way CKEditor's dialogs did: the data is POSTed to
  `ajaxhelper.temporarilyStoreData` (FlashRAM) *before* the iframe navigates
  to the picker URL; the picker page then reads it server-side.
- `postForm()` is a small fetch-based, form-encoded POST helper (also used by
  the embed NodeView previews).

### `src/toolbar.js` — CKEditor button names → Tiptap commands

Preside toolbars are pipe/comma strings of **CKEditor button names**
(`"Bold,Italic|Widgets,ImagePicker"`); the facade parses them with a verbatim
port of core's `parseToolbarConfig`. `toolbar.js` maps each name to a
`{ label, title, run(editor), active(editor) }` entry — unknown
names are skipped gracefully. Highlights:

- Button icons are **inline SVGs from `src/icons.js`** (Tabler Icons, MIT) —
  bundled into the js, sized/coloured by the `.tiptap-btn svg` CSS rule. No
  icon files are shipped and no CKEditor assets are used.
- Preside-specific buttons (`PresideLink`, `PresideUnlink`, `PresideAnchor`,
  `Widgets`, `ImagePicker`, `AttachmentPicker`) invoke the custom extensions'
  commands.
- `Format` renders a custom dropdown driven by `defaultConfigs.format_tags`
  (CKEditor's `format_tags`, incl. `div` via the `presideDiv` node); items are
  real `h1…h6/p/pre/div` elements carrying `.tiptap-fmt-preview`, so the
  scoped content CSS styles the menu itself.
- `Styles` renders a CKEditor-stylesheetParser-style dropdown: class-based
  selectors harvested from the field's fetched content stylesheets
  (`presideStyles.js` collects them) filtered by
  `defaultConfigs.stylesheetParser_validSelectors`, plus static
  `defaultConfigs.stylesSet` entries. Block styles set `class` on the node
  (via `presideAttributes`); `span.x` styles toggle the `presideInlineStyle`
  mark.
- `Source` toggles a raw textarea view showing **tokenized** HTML (the stored
  form) and re-parses it (`detokenize` → `setContent`) on toggle back.
- `Maximize` toggles an `is-maximized` class on the container (CSS handles
  full-screen).
- Active-state highlighting refreshes on every `selectionUpdate` /
  `transaction`.

---

## Layer 3: The Preside shim/facade layer

### `src/facade.js` — `window.PresideRichEditor` (Tiptap-backed)

Core presidecore's `preside.richeditor.js` defines the CKEditor-backed
`window.PresideRichEditor` at parse time. This facade loads **after**
presidecore and overwrites that global — but runs before DOM-ready, when
`formFields.js` would bind `$('textarea.richeditor')`.

**Bootstrap subtlety:** `formFields.js` actually instantiates the *CKEditor*
`PresideRichEditor` synchronously at parse time (inside its IIFE), before the
facade loads. The pre-presidecore `CKEDITOR` shim at the top of `src/index.js`
turns that path into a silent no-op (`CK.replace()` returns a dead stub), so
the textareas are still pristine when the facade's own
`bootstrapRichEditors()` scans `textarea.richeditor:not(.frontend-container)`
on DOMContentLoaded and mounts Tiptap, guarding with a
`data-tiptap-mounted` attribute. `PresideRichEditor.bootstrap` is exposed so
AJAX-loaded forms (quick-add modals) can re-scan.

Without that shim, presidecore would throw `CKEDITOR is not defined` and abort
the rest of `formFields.js` (popovers, date pickers, file inputs…). The shim
provides: `CKEDITOR.instances`, the `ENTER_*` / `CTRL/SHIFT/ALT` constants,
no-op `on`/`replace`, and `CKEDITOR.document.$ = document` — the latter
because `preside.iframe.modal.js` (nested picker modals: the widget/image "+"
and edit-pencil buttons) reads `parent.CKEDITOR.document.$` and would throw
mid-open otherwise. The facade re-asserts the same minimal shim defensively.

**Per-instance flow** (`PresideRichEditor.prototype.init`):

1. `readConfig()` mirrors core exactly — reads `data-toolbar`, `data-width`,
   `data-min/maxHeight`, `data-stylesheets`, `data-widgetCategories`,
   `data-linkPickerCategory`, placeholder etc., falling back to the
   `cfrequest` values that the `ckEditorJs.cfm` view's `includeData` provides.
2. Hides the textarea (kept in the form for native submit), mounts
   `.tiptap-editor-container` (toolbar div + editor mount) after it.
3. Creates the Tiptap `Editor` with `content: detokenize(ta.value)` and the
   extension stack built in `buildExtensions()` (StarterKit minus link,
   attributes, link, anchor, embeds, rich-text kit).
4. Points `tiptap.view.dom.form = ta.form` — **jquery.validate workaround**:
   its delegated focus/keyup handler on `[contenteditable]` reads `this.form`
   before any ignore check; CKEditor's iframe hid the editable from those
   delegates, Tiptap's inline editable would make every keystroke throw.
5. Wraps the editor in a `CompatInstance`, registers it in
   `CKEDITOR.instances[name]` and `$ta.data("ckeditorinstance", instance)`,
   snapshots `initialdata`, writes normalized data back into the textarea,
   builds the toolbar, applies content styles, and fires `instanceReady`
   asynchronously (so callers like frontendEditors can attach handlers first).

**`CompatInstance` — the CKEditor-shaped API Preside actually consumes:**

| Member | Consumer / behaviour |
|---|---|
| `getData()` | `normalizeOutput(tokenize(tiptap.getHTML()))` — the save path. Used by serialize-object (AJAX submit), dirtyforms, validation. |
| `setData(html)` | `setContent(detokenize(html), { emitUpdate: false })` — quick-add reset, frontend version restore. |
| `initialdata` | dirtyforms comparison baseline. |
| `on / fire` | simple handler registry; `on("key", …)` additionally binds a real `keydown` listener with CKEditor-shaped `{ data: { keyCode, domEvent } }`. `change` is emitted on every Tiptap `update` (which also syncs the hidden textarea). |
| `focus()` | Tiptap focus. |
| `destroy()` | mirrors CKEditor: tears down the editor DOM, restores the textarea, deregisters from `CKEDITOR.instances` and the jQuery data — frontend editors create/destroy on every edit-mode toggle. |
| `execCommand("maximize")` / `commands.maximize.state` | fullscreen toggle, state tracked for callers that read it. |
| `getSelection()` | returns `null` (stubbed). |

Every Tiptap `update` syncs `getData()` into the hidden textarea, so plain
(non-AJAX) form posts also carry current content.

### CFML side: how the extension plugs in

**`assets/StickerBundle.cfc` — the asset-id override trick.** Preside
registers every extension's `assets/` directory as a Sticker bundle *after*
the core bundle (`StickerForPreside.cfc`); a re-declared asset **id** wins. So
this bundle re-declares core's `ckeditor` id to point at
`tiptap.bundle.min.js` — every existing `event.include("ckeditor")` call-site
in core now loads Tiptap, with no core edit (same mechanism as
`preside-ext-jsmodern`). It also declares `tiptap-facade` and `tiptap-css`,
and encodes the load-order rules declaratively:

```
bundle.asset( "tiptap-facade" )
      .dependsOn( "ckeditor" )
      .after( "/js/admin/presidecore/" )
      .before( "/js/admin/specific/*", "/js/admin/frontend/*" );
```

Cache busting is **filename-based**: the build emits content-hashed filenames
(`facade.<hash>.min.js`) and each asset is declared with a **Sticker wildcard
path** (`path="/dist/facade.*.min.js"`) — Sticker itself resolves the pattern
to the single matching file at configure time, and throws if it matches zero
or multiple files. Nothing needs bumping when `dist/` changes.

**`views/admin/layout/ckEditorJs.cfm` — the view override.** Core's version of
this view only includes `ckeditor`; Sticker only emits explicitly-included
assets, so the extension overrides the view to add
`event.include("tiptap-facade")` and `event.include("tiptap-css")`. Ordering
is enforced by the bundle's `.after()` rule, **not** by include position. The
view also preserves core's `event.includeData()` block — that is what
populates the `cfrequest` values (`ckeditorDefaultToolbar`, min/max height,
autoParagraph, …) the facade's `readConfig()` reads — and adds `tiptapI18n`:
each key of the extension's `i18n/tiptap.properties` bundle translated
server-side (admin user locale) for `src/i18n.js` to consume, replacing
CKEditor 4's bundled language packs.

**`config/Config.cfc`** is intentionally minimal: it only sets
`settings.richeditorEngine = "tiptap"` (an explicit rollout/rollback marker,
unread by core). It deliberately does **not** override
`settings.ckeditor.defaults.configFile` — the facade loads and honours custom
CKEditor config files (`src/customConfig.js`): the file is fetched and
executed, its `CKEDITOR.editorConfig( config )` output becomes the *base*
config that per-instance settings override (CKEditor's own precedence), and
named toolbars defined as `config.toolbar_<name>` resolve client-side. Plugin
loading keys (`extraPlugins` / `removePlugins`) have no Tiptap meaning and are
ignored; the stock core `/ckeditorExtensions/config.js` executes harmlessly
because the CKEDITOR shim no-ops `plugins.addExternal`. The global file is
async-prefetched at facade parse time, with a synchronous same-origin XHR
fallback in `readConfig()` — `frontendEditors.js` reads `.editor` synchronously
off the constructor, so mounting can never await a network callback.

### Load order

```mermaid
flowchart TD
    A["tiptap.bundle.&lt;hash&gt;.min.js  (Sticker id: 'ckeditor')<br/>window.PresideTiptap + no-op CKEDITOR shim"]
    B["presidecore bundle<br/>preside.richeditor.js defines CKEditor PresideRichEditor;<br/>formFields.js IIFE runs it against textareas —<br/>no-ops silently thanks to the shim"]
    C["facade.&lt;hash&gt;.min.js  (Sticker id: 'tiptap-facade')<br/>overwrites window.PresideRichEditor,<br/>fills out CKEDITOR shim"]
    D["/js/admin/specific/* and frontend scripts"]
    E["DOMContentLoaded:<br/>bootstrapRichEditors() mounts Tiptap<br/>on pristine textarea.richeditor"]

    A -->|".dependsOn('ckeditor')"| B
    B -->|".after('/js/admin/presidecore/')"| C
    C -->|".before('/js/admin/specific/*', …)"| D
    D --> E
```

### Data flow (load → edit → save)

```mermaid
flowchart TD
    DB["Stored content in DB<br/>HTML + {{image/attachment/widget}} tokens,<br/>href='{{link:…}}' etc."]
    TA["textarea.richeditor value"]
    DET["tokens.detokenize()<br/>embed tokens → span[data-preside-*][data-raw]"]
    TT["Tiptap document<br/>presideImage/Attachment/Widget atoms (raw attr),<br/>presideLink mark (href verbatim),<br/>presideAnchor, presideAttributes"]
    NV["NodeViews: live previews via the same AJAX<br/>endpoints CKEditor used (renderEmbedded…ForEditor,<br/>renderWidgetPlaceholder)"]
    PICK["Picker iframes (linkpicker / assetmanager /<br/>widgets) — unchanged pages, onDialogEvent protocol,<br/>prefill via ajaxhelper.temporarilyStoreData"]
    HTML["editor.getHTML()"]
    TOK["tokens.tokenize()<br/>span[data-raw] → raw token text"]
    NORM["normalize.normalizeOutput()<br/>CKEditor-shaped output (unwrap p-in-li,<br/>slim tables, drop trailing empty p)"]
    OUT["CompatInstance.getData() → hidden textarea /<br/>CKEDITOR.instances[name] / serialize-object → save"]

    DB --> TA
    TA -->|"setData / init"| DET --> TT
    TT --- NV
    PICK -->|"commit: raw token / link form data"| TT
    TT -->|"on every update + getData()"| HTML --> TOK --> NORM --> OUT
    OUT -->|"byte-identical tokens"| DB
```

The round trip is byte-identical for tokens because embeds carry the original
token string opaquely in `raw`, and link hrefs are never rewritten — only
regenerated by the verbatim-ported codec when the user edits via the picker.

---

## Build pipeline

`esbuild.mjs` (`npm run build` / `npm run watch`) produces two minified IIFE
bundles + the css (+ sourcemaps) into `assets/dist/`, target `es2019`, all
with **content-hashed filenames** (`entryNames: "[name].[hash].min"`):

- **`tiptap.bundle.<hash>.min.js`** ← `src/index.js`: Tiptap v3 + all custom
  extensions, exposes `window.PresideTiptap`. Wired into Sticker as
  `ckeditor`.
- **`facade.<hash>.min.js`** ← `src/facade.js`, with `@tiptap/*` marked
  `external` so Tiptap is never bundled twice. Caveat: the facade *source*
  imports `./toolbar.js`/`./tokens.js`/etc. directly (those are bundled in),
  but the extension files it shares with the vendor bundle reach it only
  through `window.PresideTiptap.extensions`.
- **`tiptap.<hash>.min.css`** ← `src/tiptap.css` (edit the source, never
  dist). (Toolbar icons are inline SVGs in the js bundles — see
  `src/icons.js` — so no image assets ship at all.)

A full build clears generated files from dist first, and watch mode prunes
stale hashed outputs after each rebuild, so dist only ever holds the current
build. Consumers never hardcode the hashes: `StickerBundle.cfc` and
`harness/server.mjs` glob for `<base>.<hash>.min.<ext>`.

`assets/dist/` is **committed** so the installed extension needs no build
step. `src/` is not shipped/needed at runtime.

## Serving / asset-mount constraints

- Assets are served from the stable, non-fingerprinted **extension directory
  mount**: `/preside/system/assets/extension/preside-ext-tiptap/assets/dist/…`
  (`StaticAssetDownload.cfc::_translatePath` maps it to
  `application/extensions/<id>/…`).
- Cache-busting is automatic: content-hashed dist filenames, resolved at
  configure time via Sticker's wildcard asset paths (`StickerBundle.cfc`).
- **Do not symlink `assets/dist`** into an installed website.
  `StaticAssetDownload._fileExists` is a security guard that rejects files not
  physically under `application/extensions/`; the CFML engine canonicalizes
  symlinks, so a symlinked dist resolves outside that root → 404 on every
  asset. Served files must be real copies. CFML-side files
  (`StickerBundle.cfc`, `views/**`, `config/**`, manifests) go through
  component/view resolution with no such guard and may be symlinked.
- Production mode caches Sticker bundles, views and the extension list —
  restart or `fwreinit` after changing any `.cfc`/view, or after changing
  `dist/` (the cached Sticker bundle must re-resolve the new hashed filenames).

## Development harness (`harness/`)

A standalone Node server (`harness/server.mjs`, default port 8700) that boots
**both** editors — real Preside CKEditor 4 and the Tiptap facade — side by
side with no CFML/DB/Preside boot. `mocks.js` fakes the client globals
(`cfrequest`, `buildAdminLink`/`buildAjaxLink`, `i18n`, `presideJQuery`);
the server stands in for the preview-render AJAX endpoints and serves mock
picker iframe pages implementing the `onDialogEvent` contract, plus
`ajaxhelper.temporarilyStoreData`. `fidelity.html` compares stored output;
`test-link-serialization.mjs` unit-tests the link codec. Designed to be driven
with Playwright (`CKEDITOR.instances.content.getData()` is the contract
check). Note: `harness/README.md` retains some wording from the earlier
in-core phase (paths like `system/externals/tiptap`, "Phase 0/1 status") that
predates the extension repo.

## Key invariants (do not break)

1. Stored `{{…}}` tokens round-trip **byte-identically**; the token format is
   never altered client-side.
2. `window.PresideRichEditor`, `CKEDITOR.instances[name]` and
   `$ta.data('ckeditorinstance')` keep their CKEditor-era shapes.
3. The facade loads after presidecore and before page-specific scripts —
   enforced by the Sticker `.dependsOn/.after/.before` rules, not by markup
   order.
4. The picker pages are consumed unmodified via the `onDialogEvent` dialog
   protocol; prefill always goes through `ajaxhelper.temporarilyStoreData`.
5. `normalizeOutput` stays idempotent and never drops author-carried
   `class`/`style` attributes.
