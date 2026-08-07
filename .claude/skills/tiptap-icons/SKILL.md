---
name: tiptap-icons
description: Draw or add an icon for the Preside Tiptap editor, and make chrome theme correctly in light and dark mode. Use when adding a toolbar button icon, picking colours for editor UI, adding a CSS custom property, or when something looks wrong in dark mode. Covers the Tabler icon set, inline SVG conventions, the --tt-* variable palette, and the two-document theming rule.
---

# Icons and theming in the Preside Tiptap editor

Two rules cover almost everything here:

1. **Icons are inline SVG strings in the JS bundle** — no icon files, no extra
   requests, `currentColor` so CSS owns the colour.
2. **Colours are `--tt-*` custom properties**, never literals — that is what
   makes dark mode one override block instead of a duplicated stylesheet.

## Icons

The core set is **Tabler Icons** (MIT, © Paweł Kuna), in `src/icons.js` as
`ICONS[ Name ]`. Reuse a name before drawing anything: `PresideTiptap.api.ICONS`
is exported precisely so an add-on does not redraw `Bold`.

### The shape

24×24 viewBox, stroke-based, no fixed size or colour:

```js
'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"'
+ ' stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
+ '<path stroke="none" d="M0 0h24v24H0z" fill="none"/>'
+ '<path d="…"/></svg>'
```

- **`stroke="currentColor"`, never a hex.** The button's `color` — which changes
  with the theme, hover and `is-active` — is the only colour source.
- **No `width`/`height` attributes.** The `.tiptap-btn svg` rule sizes it. A
  hardcoded size fights the toolbar metrics.
- The leading transparent `<path>` is Tabler's bounding box. Keep it if you
  copy from Tabler; it costs nothing and keeps the set uniform.
- A plugin passes its SVG as the `icon` string on its command (see the
  `tiptap-plugin-api` skill). Without one, the button falls back to `label` text.

### Drawing a new one — the rule that matters

**Rasterise at a true 16px and magnify the result before you commit to a
design.** A vector preview at 96px tells you nothing about the size the toolbar
actually renders.

This is not pedantry. The core's Replace icon went through this: CKEditor's own
metaphor is two letters with arrows swapping between them, and drawn faithfully
with *two* arrows at 16px the second arrow crowded the `a` into an unreadable
smudge. One arrow reads; two do not. A magnifier-with-arrows was tried first and
read as nothing in particular. You only learn that by looking at 16 pixels.

Also:

- **If the icon contains text**, pin the `font-family` on the `<text>` element.
  The same icon renders both in the admin page and inside the editing iframe,
  and must not inherit either one's font.
- **Directional icons must agree with their label.** A "column before" icon
  whose plus sits on the right reads as the opposite command.

## Theming

### Use a variable, and source it from the admin palette

Colours come from the **Preside admin palette** (Preside-CMS
`system/assets/css/admin/lessglobals/colours.less`). Do not invent hex values —
find the admin variable that means the same thing, use it, and note the mapping
in the CSS header where the others are listed. Examples already mapped:

| Variable | Value | Admin |
|---|---|---|
| `--tt-accent` | `#4c8fbd` | `@blue` (default link colour) |
| `--tt-accent-soft` / `--tt-active-bg` | `#f0f7fc` | `@pale-blue` (row hover) |
| `--tt-active-fg` | `#1b6aaa` | `@blue-darker` |
| `--tt-border` | `#cccccc` | `@grey12` |
| `--tt-border-soft` | `#dddddd` | `@grey13` (panel border) |
| `--tt-chrome-bg` | `#eeeeee` | `@grey14` (also CKEditor's `.cke_top`) |
| `--tt-muted` | `#777777` | `@grey7` |
| `--tt-outline-flash` | `#fee188` | `@yellow` (admin highlight) |

The **dark** values have no admin equivalent — the admin is light-only — so they
are ours, kept as muted versions of the same hues, in one override block at the
bottom of `src/tiptap.css`.

### THE trap: a custom property cannot cross a document boundary

The editable lives in an **iframe**. A variable declared on
`.tiptap-editor-container` (host document) **does not exist inside the frame**.
So the palette is declared for *every document that renders our chrome*:

```css
.tiptap-editor-container,   /* host */
.tiptap-editor-doc,         /* the editing frame's <html> */
.tiptap-combo-doc,          /* the Format/Styles panel frame's <html> */
.tiptap-combo-panel         /* body-portalled, outside the container entirely */
{ --tt-bg:#fff; … }
```

**And the dark override block must list the same selectors**, which is a bug the
core shipped: with the override on the container alone it could not match inside
the frame, so every variable kept its *light* value in the editable — dark
surface, black text, light table borders. `theme.js` mirrors the `tiptap-dark`
class onto the frame's own `<html>` precisely because a class on the container
means nothing in there.

**Rule**: anything new that colours the editable, or chrome inside the frame,
must be reachable from **the frame root**, never only from the container.

### Chrome portalled to `<body>`

A menu, dialog or bubble appended to `<body>` is **outside the container**, so
the variables do not reach it either. Two accepted answers:

- declare the variables for its own class too (what `.tiptap-combo-panel` does), or
- use literal colours (what the slash menu does).

Either way, **sync the theme from the editor's container at open time**, not
from `prefers-color-scheme`: a dark OS must not put a dark menu over a light
editor, or over the site page in Modern inline mode.

```js
var dark = PresideTiptap.api.isDark( PresideTiptap.api.containerOf( editor.view.dom ) );
popup.classList.toggle( "tiptap-dark", dark );
```

`isDark( container )` reads the **container**, deliberately not the stored
preference — an inline (Modern) editor stays light whatever the user chose,
because the editable there is the site page.

### What dark mode is not

Dark mode is **chrome comfort, not a content preview**. A field's own content
stylesheets are authored for a light page, so any explicit colour they set still
wins inside the editable. That is intentional (WYSIWYG fidelity). Do not "fix"
it by forcing content colours.

Dark mode also **never touches stored content** — it is a class on the
container, so `getData()` is identical in either mode.

## ⚠️ Never use a bare class name a theme might own

The dropdown caret was once `class="caret"`. In the admin, **bootstrap's own
`.caret` rule** drew its border triangle on top of ours and every dropdown
showed two stacked arrows. Ace owns `.lbl` too.

The toolbar lives in the **light DOM**, so this hazard is live for anything you
add there. Namespace every class: `tiptap-caret`, `tiptap-lbl`, and for an
add-on, your own prefix. Prefer drawing shapes in CSS (a border triangle) over
printing a glyph — there is then nothing for a theme to double up.

## Checklist

- [ ] reused an existing `ICONS` name if one fits
- [ ] 24×24 viewBox, `currentColor`, no width/height
- [ ] rasterised at 16px and actually looked at it
- [ ] any text in the icon has a pinned font-family
- [ ] every colour is a `--tt-*` variable mapped to an admin palette entry
- [ ] the variable is declared for every document that needs it, **light block
      and dark block alike**
- [ ] body-portalled chrome syncs its theme from the container
- [ ] no bare class name bootstrap or Ace might also define
- [ ] checked it in dark mode, in the admin, **and** inside the editing frame
