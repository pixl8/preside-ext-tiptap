# Editor harness

Boots **both** rich editors standalone — with Preside's server-side dependencies
mocked — so the CKEditor (current) and Tiptap (replacement) implementations can be
driven and screenshot-compared side by side without a full Preside boot.

## Run

```bash
cd system/externals/tiptap/harness
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
- **Tiptap page** (Phase 0/1 skeleton): StarterKit editing + mapped toolbar subset
  (Bold/Italic/Strike/RemoveFormat/lists/blockquote). `{{image}}`/`{{widget}}`
  tokens show as literal text until the Tiptap nodes land (Phase 3); links already
  round-trip. Registry hooks (`CKEDITOR.instances`, `ckeditorinstance`) work.
