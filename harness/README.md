# Editor harness

Boots **both** rich editors standalone — with Preside's server-side dependencies
mocked — so the CKEditor (current) and Tiptap (replacement) implementations can be
driven and screenshot-compared side by side without a full Preside boot.

## Run

```bash
cd harness
node server.mjs            # → http://localhost:8700   (optional: node server.mjs <port>)
```

- `http://localhost:8700/`             — side-by-side (CKEditor left, Tiptap right)
- `http://localhost:8700/ckeditor.html` — real Preside CKEditor 4 + ckeditorExtensions plugins
- `http://localhost:8700/tiptap.html`   — the Tiptap facade (`../dist/`)

Rebuild the Tiptap bundle first if you changed `src/`: `cd .. && npm run build`.

## What's mocked (no CFML / no DB / no Preside)

`mocks.js` supplies the client globals Preside would inject:
- `cfrequest` (the `ckEditorJs.cfm` `includeData` values; `bootstrapck` skin),
- `buildAdminLink` / `buildAjaxLink` / `buildLink`,
- `i18n.translateResource`, `presideJQuery`.

`custom-config-fixture.js` is a CKEditor-style custom config file (the
`settings.ckeditor.defaults.configFile` / per-field `customConfig` contract) for
exercising `src/customConfig.js`: mount a textarea with
`data-custom-config="/custom-config-fixture.js"` and (optionally)
`data-toolbar="harnessCustom"` to see file-driven named toolbars, `format_tags`,
numeric `enterMode` and `disallowedContent` applied.

`server.mjs` serves the real editor assets straight from the Preside tree
(`/ckeditor/*`, `/ckeditorExtensions/*`, `/vendor/*`) and stands in for the Preside
handlers the editor calls:
- `/mock/ajax?action=…` — the preview renderers (`renderEmbeddedImageForEditor`,
  `renderEmbeddedAttachmentForEditor`, `renderWidgetPlaceholder`),
- `/mock/admin/*` — the picker iframe pages (link / asset / widget) implementing the
  `onDialogEvent` contract, plus `ajaxhelper.temporarilyStoreData`. Each picker now
  offers a few selectable sample items (click to select, double-click or OK to
  commit; OK stays disabled until you pick). The preview renderers reflect the
  chosen asset/widget so different picks render differently.

Both editor pages use the **identical** `<textarea class="richeditor" data-toolbar=…>`
markup and sample content (headings, bold/italic, a `{{link:…}}` link, an
`{{image:…}}` token and a `{{widget:…}}` token) so output is directly comparable.

## Automated tests

- `node test-link-serialization.mjs` — pure-node unit tests for the link
  href ↔ `{{link|asset|custom}}` token contract.
- **`/test-realworld.html`** — self-running browser tests where every case is a
  CKEditor customisation pattern lifted verbatim from real Preside sites and
  extensions:
  - the `preside-ext-ready-membership-cms-basics` named toolbar
    (`Bold|Italic|PresideLink,PresideUnlink|Format`, as the server resolves it),
  - the `preside-ext-pdf-templating` toolbar, full of CKEditor buttons with no
    Tiptap analogue (`Find`, `Scayt`, `SpecialChar`, `BidiLtr`, …) which must be
    skipped gracefully with the editor still functional,
  - the cms-basics `defaultConfigs.stylesSet` append
    (`table.compact` → Styles dropdown) plus stylesheet-harvested styles,
  - a site-style **custom CKEditor config file** (`custom-config-fixture.js`:
    `toolbar_<name>` named toolbars, `format_tags`, numeric `CKEDITOR.ENTER_BR`,
    `disallowedContent`) with instance-over-file precedence asserted,
  - the stock core `/ckeditorExtensions/config.js` executing harmlessly.

  Results render on the page and are exposed as `window.__results` /
  `window.__done` for automation.
- **`/test-frontend-maximize.html`** — reproduces the hostile chrome around a
  **front-end** editor (`.content-editor-editor-container`: fixed,
  `max-width:810px`, `z-index:100`; the admin toolbar at `z-index:103`; the field
  rendered with `width=800`) so the Maximize command can be checked there. The
  instance is on `window.testEditor`; maximized, the container must be
  `document.body`'s child at the full viewport size and paint over the toolbar
  (see `src/maximize.js` for why the portal is needed).

## Driving with Playwright

Point Playwright (or the Playwright MCP browser) at the two URLs, then
screenshot / snapshot / click / evaluate. Example contract check on the Tiptap page:

```js
await page.goto("http://localhost:8700/tiptap.html");
await page.evaluate(() => window.CKEDITOR.instances.content.getData());  // token HTML
```

## Status vs. what you'll see

- **CKEditor page**: full fidelity — toolbar incl. Preside buttons, image preview
  rendered via the mock endpoint, widget placeholder rendered.
- **Tiptap page**: full toolbar (own MIT SVG icon set), live token previews for
  image/attachment/widget embeds (widgets are block-level, matching CKEditor),
  Format + Styles dropdowns, Source view, mocked link/image/widget pickers.
  Registry hooks (`CKEDITOR.instances`, `ckeditorinstance`) work.

Set `PRESIDE_ASSETS=<Preside-CMS>/system/assets` when the Preside checkout is not
a sibling of this repo (needed for the CKEditor comparison pane + jquery).
