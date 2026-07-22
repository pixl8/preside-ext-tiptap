# Preside Tiptap

A Preside CMS extension that replaces the vendored **CKEditor 4** rich editor with
a self-contained [Tiptap](https://tiptap.dev) v3 editor.

It is a **drop-in replacement**. It reproduces the Preside integration contract so
nothing else has to change:

- **Content tokens** round-trip byte-identically: `{{image:…:image}}`,
  `{{attachment:…:attachment}}`, `{{widget:id:cfg:widget}}`, and link hrefs
  (`{{link:…}}` / `{{asset:…}}` / `{{custom:…}}`). All server-side renderers,
  forms and AJAX endpoints keep working unchanged.
- **`PresideRichEditor`** facade + **`CKEDITOR.instances[name]`** registry +
  **`ckeditorinstance`** jQuery-data hook, so form submit, validation,
  dirty-forms, quick-add reset and front-end inline editing keep working.
- The **picker iframe + `onDialogEvent` protocol** is reused verbatim (link /
  asset / widget pickers and their admin forms are untouched).

## How It Works

Preside uses Sticker for asset management where each asset has a unique id, and it
registers every extension's `assets/` directory as a Sticker bundle **after** the
core bundle. Re-declaring an asset id lets the last declaration win, so this
extension takes over the editor **without editing any core Preside file** — the
same override mechanism as `preside-ext-jsmodern`:

- `ckeditor` &rarr; the Tiptap vendor bundle (`window.PresideTiptap`)
- `tiptap-facade` &rarr; the facade that re-assigns `window.PresideRichEditor`
- `tiptap-css` &rarr; editor chrome / content styles

The facade must load **after** `/js/admin/presidecore/` (so it can overwrite the
`PresideRichEditor` global) but before the per-page editor-instantiation scripts.
Sticker only emits an asset that is explicitly included, so the extension also
ships a **view override** — `views/admin/layout/ckEditorJs.cfm` — that adds
`event.include( "tiptap-facade" )` + `event.include( "tiptap-css" )`. Ordering is
enforced by the `.after()` rule on the bundle, not by where `include()` is called.

Assets are served from the standard extension mount, a stable (non-fingerprinted)
directory mount so the bundle's relative `url(icons/*.png)` references resolve:

```
/preside/system/assets/extension/preside-ext-tiptap/assets/dist/...
```

## Layout

```
preside-ext-tiptap/
  manifest.json           Preside extension manifest (id, title, author, version)
  box.json                ForgeBox package manifest (type: preside-extensions)
  config/Config.cfc        Preside settings (auto-merged)
  views/                  View overrides (no core edits)
    admin/layout/ckEditorJs.cfm   adds the tiptap-facade + tiptap-css includes
  assets/                 Extension Sticker bundle (auto-discovered)
    StickerBundle.cfc     re-points the "ckeditor" id + tiptap-facade/-css
    dist/                 built, committed, web-served output
      tiptap.bundle.min.js  Tiptap v3 + Preside extensions (window.PresideTiptap)
      facade.min.js         window.PresideRichEditor
      tiptap.min.css        editor chrome styles
      icons/                toolbar-button icons (referenced relatively from css)
  src/                    editor source (esbuild input) — NOT shipped in the package
  esbuild.mjs             build script
  package.json            build tooling (Tiptap v3 deps + esbuild)
```

## Build

```bash
npm install
npm run build      # → assets/dist/tiptap.bundle.min.js, assets/dist/facade.min.js
npm run watch      # rebuild on change
```

`assets/dist/` is committed so the extension works without a build step at deploy time.

## Install

```bash
box install preside-ext-tiptap
```

To roll back, uninstall the extension and Preside falls straight back to CKEditor.

## License

MIT.
