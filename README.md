# Preside Tiptap

A Preside CMS extension that replaces the legacy CKEditor 4 rich text editor
with a modern [Tiptap](https://tiptap.dev) (v3) editor — **install it and every
existing form, renderer, picker and piece of stored content keeps working
unchanged**.

## Overview

Preside's admin interface ships with a vendored copy of CKEditor 4, which
[reached end-of-life in June 2023](https://ckeditor.com/ckeditor-4-support/)
and no longer receives security patches. The editor is deeply woven into
Preside — content tokens, picker dialogs, form validation, dirty-form tracking,
front-end inline editing — which makes upgrading it in place a daunting task.

This extension takes a different approach: it swaps the editor *underneath*
Preside's integration layer. It provides a Tiptap v3 editor behind a facade
that reproduces the exact JavaScript contract Preside expects from CKEditor,
and it delivers itself through Preside's Sticker asset system — so **no core
Preside file is edited** (the same override mechanism as
[preside-ext-jsmodern](https://github.com/pixl8/preside-ext-jsmodern)).

| Legacy | Replaced by |
| ------ | ----------- |
| CKEditor 4.x (vendored, EOL) | Tiptap v3 (ProseMirror-based, actively maintained) |
| `preside.richeditor.js` (`PresideRichEditor`) | CKEditor-API-compatible facade over Tiptap |
| CKEditor toolbar PNG icons | Inline SVG icons ([Tabler Icons](https://tabler.io/icons), MIT) |
| CKEditor bundled language packs | Preside resource bundle (`i18n/tiptap.properties`), translated server-side per admin-user locale |
| `?v=` query-string cache busting | Content-hashed asset filenames (`facade.<hash>.min.js`), resolved dynamically by the Sticker bundle |

Nothing else changes. Editors get a modern editing surface; developers keep
every existing dependency, form definition and content renderer.

New niceties on top, each of which can be switched off (see
[Configuration](#configuration)):

- a **footer status bar** under every editor with live word / character counts
  and estimated reading time;
- a **light / dark mode toggle**, remembered per user across page loads;
- a **document outline navigator** — a slim rail of heading markers on the right
  edge of the editor that expands on hover into a clickable list, jumping the
  caret and the view to any heading and tracking where you are as you scroll. It
  adapts its detail to the space available (as many heading levels as fit, and on
  very long documents every Nth heading), so it never outgrows the editor.

The editor chrome is also fully localisable — add a
`tiptap_<lang>.properties` resource-bundle override to translate every toolbar
tooltip, dialog, outline and footer label.

## Configuration

Everything the extension adds is switched off through the **same
`defaultConfigs` structure CKEditor already used** — no new settings namespace:

| `defaultConfigs` key | Default | Set to `false` to remove |
| --- | --- | --- |
| `outline` | on | the document outline navigator (heading rail + hover panel) |
| `darkMode` | on | the light / dark mode toggle |
| `wordcount` | on | the footer status bar (word / character counts, reading time) |

**Site-wide** — in your site's (or another extension's) `config/Config.cfc`:

```cfc
settings.ckeditor.defaults.defaultConfigs.outline   = false;
settings.ckeditor.defaults.defaultConfigs.darkMode  = false;
settings.ckeditor.defaults.defaultConfigs.wordcount = false;
```

**Per field** — `customDefaultConfigs` takes a struct, so pass it where you
render the control (core's `formcontrols/richeditor` view serialises it into
`data-custom-default-configs`):

```cfc
renderFormControl(
      name                 = "body"
    , type                 = "richeditor"
    , customDefaultConfigs = { outline = false }
);
```

In a hand-written view or template, the same thing as markup:

```html
<textarea name="body" class="richeditor"
          data-custom-default-configs='{"outline":false}'></textarea>
```

Per-field values are layered over the site-wide ones, so a field can opt out of
something the site leaves on (and vice versa).

## What keeps working

The extension reproduces Preside's editor integration contract exactly:

- **Stored content is untouched.** The `{{image:…:image}}`,
  `{{attachment:…:attachment}}`, `{{widget:id:cfg:widget}}` content tokens and
  `{{link:…}}` / `{{asset:…}}` / `{{custom:…}}` link hrefs round-trip
  **byte-identically**, so all server-side renderers, forms and AJAX endpoints
  keep working — and you can uninstall at any time with no content migration.
- **The admin pickers are reused verbatim.** The link, image/asset, attachment
  and widget picker dialogs are the same server-rendered forms, driven through
  the same iframe + `onDialogEvent` protocol. Custom link types and picker
  categories work unchanged.
- **Every JavaScript hook Preside relies on**: the `PresideRichEditor`
  constructor, the `CKEDITOR.instances[name]` registry
  (`getData`/`setData`/`initialdata`), the `ckeditorinstance` jQuery-data hook,
  and the instance event API — so AJAX form submit, jquery.validate,
  dirty-form tracking, quick-add modals and front-end inline editing (including
  its keyboard shortcuts) all keep working.
- **Existing configuration is honoured**: named toolbars and per-field toolbar
  strings, `settings.ckeditor.defaults` (stylesheets, min/max height,
  autoParagraph, enterMode), `format_tags`, the stylesheet-driven **Styles**
  dropdown (`stylesheetParser_validSelectors` / `_skipSelectors` and static
  `stylesSet` entries, harvested and filtered with CKEditor's own algorithm),
  and paste filtering (`disallowedContent` / `pasteFromWordDisallow`).
- **Custom CKEditor config files keep working.** A site-provided
  `settings.ckeditor.defaults.configFile` (or per-field `customConfig`) is
  loaded and executed exactly as CKEditor would: its
  `CKEDITOR.editorConfig( config )` output becomes the base configuration,
  overridden by anything set per instance — including client-side
  `config.toolbar_<name>` named-toolbar definitions, `format_tags`,
  `enterMode`, `contentsCss` and content filtering. The only keys without
  meaning in Tiptap are CKEditor plugin-loading directives (`extraPlugins`
  / `removePlugins`), which are ignored harmlessly.

## How it works

Preside registers every extension's `assets/` directory as a Sticker bundle
*after* the core bundle, and re-declaring an asset id lets the last
declaration win. This extension re-declares:

- `ckeditor` → the Tiptap vendor bundle (`window.PresideTiptap`)
- `tiptap-facade` → the facade that re-assigns `window.PresideRichEditor`
- `tiptap-css` → editor chrome / content styles

The facade loads after `/js/admin/presidecore/` (so it overwrites the CKEditor
implementation of `PresideRichEditor`) but before the scripts that instantiate
editors — ordering enforced by Sticker `.after()` rules. A single view
override (`views/admin/layout/ckEditorJs.cfm`) adds the two extra includes.

Inside the editor, Preside-specific behaviour is implemented as Tiptap
extensions: content tokens become atom nodes that carry the original token
text verbatim (guaranteeing byte fidelity), links/anchors are custom marks
using Preside's own link serialization, and an output normaliser keeps saved
markup consistent with what CKEditor produced — so re-saving a CKEditor-era
document produces clean diffs, not churn.

## Benefits

- **Supported editor core** — Tiptap v3 / ProseMirror is actively maintained;
  CKEditor 4 is EOL.
- **Zero-migration, zero-risk rollout** — install to upgrade, uninstall to
  fall straight back to CKEditor. Content is identical either way.
- **Clean licensing** — MIT throughout (Tiptap MIT, Tabler Icons MIT); no
  GPL/commercial CKEditor artwork or code is shipped.
- **Self-contained** — all assets are committed and served from the extension
  mount; no CDN, no build step at deploy time.
- **Modern editing surface** — ProseMirror schema-based editing, live embed
  previews, and a foundation that's straightforward to extend with further
  Tiptap extensions.

## Installation

```bash
box install preside-ext-tiptap
```

Reload the application. Rich-editor fields throughout the admin (and
front-end inline editing) now use Tiptap.

To roll back, uninstall the extension — Preside falls straight back to its
vendored CKEditor, and because stored content never changed, nothing else
needs doing.

## Requirements

- Preside CMS 10.x+
- A modern (ES6+) browser for the admin — same baseline as recent Preside
  admin UIs

## Development

```bash
npm install
npm run build      # → assets/dist/ (committed)
npm run watch      # rebuild on change
```

- `src/` holds the editor source (esbuild input); it is not shipped in the
  installed package. `assets/dist/` is committed so no build is needed to use
  the extension.
- `Architecture.md` documents the three layers (core Tiptap, the Preside
  Tiptap extensions, and the CKEditor-compatibility facade) with load-order
  and data-flow diagrams.

### Testing

`harness/` is a standalone browser harness — no CFML, no database, no Preside
boot. It serves both editors side by side with Preside's server dependencies
(pickers, preview renderers, `cfrequest` data) mocked:

```bash
cd harness
node server.mjs                # http://localhost:8700
```

(The CKEditor comparison pane needs a Preside checkout — set
`PRESIDE_ASSETS=<Preside-CMS>/system/assets` if it isn't a sibling directory.)

- `/` — CKEditor 4 and Tiptap side by side, identical markup and content
- `/fidelity.html` — a CKEditor-vs-Tiptap persistence-fidelity matrix
  (does saved output round-trip byte-stably through each editor?)
- `/test-realworld.html` — self-running assertions where every case is a
  CKEditor customisation pattern taken verbatim from real Preside sites:
  named toolbars, toolbars full of CKEditor buttons with no Tiptap analogue,
  `stylesSet` / stylesheet appends, and custom CKEditor config files
  (including the stock core `/ckeditorExtensions/config.js`)
- `node harness/test-link-serialization.mjs` — unit tests for the link
  href ↔ `{{link|asset|custom}}` token contract

See `harness/README.md` for the full tour. For end-to-end verification in a
real Preside admin, the flows worth exercising are the link, image/asset and
widget pickers (insert **and** re-open to edit) — these are the historically
fragile paths.

## License

MIT © Pixl8 Group.

Toolbar icons are [Tabler Icons](https://tabler.io/icons) (MIT, © Paweł Kuna),
inlined as SVG strings — the extension ships no image assets and no
CKEditor-derived artwork.
