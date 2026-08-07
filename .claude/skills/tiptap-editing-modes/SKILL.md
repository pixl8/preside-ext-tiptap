---
name: tiptap-editing-modes
description: Understand and work with the Preside Tiptap editor's editing modes - admin boxed editors vs frontend Classic (modal) vs Modern (inline, gutentap-style) editing. Use when a feature must behave differently in the admin and on the front end, when ctx.frame is null, when chrome is misplaced or clipped on the front end, when working on the edit-mode dropdown, or when something leaks across save cycles.
---

# Editing modes: boxed, Classic, Modern

There are **two independent axes**, and conflating them is the usual source of
bugs.

**Axis 1 — where the editable lives** (this is what your code branches on):

| Shape | `ctx.mode` | `ctx.frame` | Editable is |
|---|---|---|---|
| **Boxed** | `"boxed"` | the `<iframe>` | in its own document, inside the frame |
| **Inline** | `"inline"` | **`null`** | the site page itself |

**Axis 2 — how the user got there** (product-level):

| Mode | What it is |
|---|---|
| **Admin** | An ordinary richeditor field in an admin form. Always *boxed*. |
| **Classic** (frontend) | Core Preside's overlay → fixed modal editor. Full toolbar. Always *boxed*. |
| **Modern** (frontend) | Inline, gutentap-style editing of the page's single rich region. Always *inline*. |

So: **branch on `ctx.mode` / `ctx.frame`, not on "am I on the front end"**.
Classic is a frontend mode that behaves like the admin in every way your code
cares about.

## Why boxed uses an iframe

Three problems, one boundary — and only an iframe solves all three:

1. **Isolation.** The previous approach was an `all: revert` wall at
   specificity `(0,2,0)`, beaten by any admin rule at `(0,2,1)` or by **any
   `!important`** — both ordinary content of a real admin stylesheet. It also
   made the editable read-only in Safari (reverting `all` discards the
   presentational hint WebKit maps `contenteditable` onto). A shadow root fixes
   this much and neither of the next two.
2. **`rem`.** Always resolves against the **document root** — spec, no
   exceptions, and a shadow root is not a new root. The admin is
   `html{font-size:10px}`, so rem-based content CSS rendered at 62.5% size.
3. **`vw`/`vh` and media queries.** In a frame they resolve against the frame's
   own box — roughly the width the content will really be rendered at.

Modern inline mode needs none of it: the editable **is** the site page, so it
must inherit the theme, and `rem`/`vw` already resolve correctly. Correct by
construction, hence no frame.

## What exists in which mode

| | Boxed (admin + Classic) | Modern (inline) |
|---|---|---|
| Persistent toolbar | yes | **no** — a selection bubble instead |
| Footer status bar / word count | yes | no |
| Resize grip | yes | no |
| Maximize | yes | yes |
| Outline navigator | yes, on the container | yes, **fixed to the viewport** |
| Drag handle gutter | yes, inside the frame | yes, **body-portalled** |
| Slash menu, table bubble, image tools | yes | yes |
| Content CSS injected | yes, into the frame's head | **no** — the page has its own |
| Height caps (`min`/`maxHeight`) | yes | no — the page is the scroller |
| Light/dark | per-user preference | **always light** (the editable is the site page) |

**`ctx.toolbar` is null inline.** Chrome that anchors to the toolbar needs a
fallback, or should not render inline at all.

## Rules for inline (Modern) mode

Each of these was a shipped bug.

- **The page is the scroller.** The mount's raw rect is *page-height*, so
  clamping chrome to it parks the chrome off-screen. Use **mount ∩ viewport**.
  `api.surfaceOf()` / `api.pageRect()` give the right answers in both shapes.
- **Body-portal anything that could be clipped.** The container sits in the
  *site's* layout, where one `overflow:hidden` ancestor is enough to make a
  gutter carved out of the theme invisible — the original "why is the drag grip
  missing?" bug. Its second life: on a full-width layout there is no room to the
  left, so a viewport-positioned rail sat at negative x; the fallback is to
  reserve an interior gutter instead.
- **Always light.** Do not add a `prefers-color-scheme` block for inline chrome.
  A dark bubble over a light site page is wrong.
- **Out-bid the site's chrome, don't guess.** `--tt-z-base` is raised above the
  highest fixed/sticky element on the page; every rung is `calc()`d from it.
  Never a literal z-index.

## Modern's lifecycle — the churn rule

> **Modern destroys and recreates the editor on every save.**

Consequences you must design for:

- **A leak is one orphan per save**, not one per page. Every body-portalled
  element, document/window listener, observer and CSS variable must come back in
  your teardown.
- **Guard async work with `editor.isDestroyed`.** An editor can legitimately be
  destroyed in the same tick it was created.
- **Save-vs-cancel is derived, never flagged**: cleanups run at the top of
  `destroy()`; if the container is still connected between the region's
  `<!-- container: _x -->` comments it was a cancel (restore the originals),
  and if core already replaced the region it was a save (keep the fresh render).

Modern reuses core's frontend flow end to end — core's own Save / Publish /
Cancel / Esc / ctrl+Enter / version-restore closures are untouched. Do not
reimplement any of them.

## The edit-mode dropdown (Off / Classic / Modern)

Replaces core's binary "Quick edit" checkbox, **JS-only, zero core edits**:

- **Core's checkbox stays in the DOM (hidden) and stays the source of truth for
  "is editing on".** Off/Classic drive it programmatically, so core's
  `_presideEditMode` cookie, delegated handler and "e" hotkey keep working.
  `_presideEditModeStyle` (`classic|modern`) is the only new state.
- **Modern is available only when the page has exactly one
  `.content-editor.richeditor`**; otherwise the option is disabled with a
  tooltip and the style cookie is left alone.
- **Every exit lands on Off.** Cancel/Esc discards; save/publish also drop to
  Off, because the page re-rendering with the saved content *is* the visible
  confirmation. (An earlier "re-enter after save" looked identical to before the
  save and read as "nothing happened".)
- **Switching away with unsaved edits prompts.** Dirtiness is
  `getData() !== initialdata` on the facade instance — core's `isDirty()` is
  hard-coded true and unusable.

## Frontend chrome fit (Classic)

Core opens a Classic editor as `position:fixed; top:100px; z-index:100` with a
`z-index:99` sheen — numbers that predate sticky site headers, so a theme header
paints straight over the toolbar. The fix is two steps, both frontend-only:

1. **Win the stack** — measure the site's own fixed/sticky chrome and set
   `--tt-z-base` above the highest of it, so the whole ladder lifts together and
   keeps its order.
2. **Push down whatever still covers us** — tested with
   `document.elementsFromPoint()` at the editor's top edge, **not** more z-index
   arithmetic. That asks the question that actually matters ("is something
   painted on top of us *here*?") in real paint order, so nested stacking
   contexts, opacity and transform layers resolve for free.

The sweep is affordable because it runs **once per editor open**, not per frame.
Everything is undone by a teardown — frontend editors are created and destroyed
on every edit-mode toggle.

## Writing mode-aware code

```js
chrome: function( ctx ) {
    var doc      = ctx.frame ? ctx.frame.contentDocument : document;
    var scroller = ctx.frame ? ctx.frame.contentDocument : window;

    if ( ctx.mode === "inline" ) {
        document.body.appendChild( myPanel );        // portal: the site layout may clip
    } else {
        ctx.container.appendChild( myPanel );
    }

    doc.addEventListener( "keyup", onKey );
    return function() {
        doc.removeEventListener( "keyup", onKey );
        myPanel.remove();                            // MUST run - Modern saves churn
    };
}
```

**Test both.** A feature verified only in the admin is verified in one of two
shapes, and inline is where the geometry bugs live.

## Symptom → cause

| Symptom | Cause |
|---|---|
| `ctx.frame.contentDocument` throws | inline mode — `frame` is null |
| chrome off-screen on the front end only | clamped to the raw mount rect (page-height) instead of mount ∩ viewport |
| gutter/rail invisible inline | clipped by an `overflow:hidden` ancestor in the site theme — portal it |
| rail at negative x | full-width site layout — no room to the left; reserve an interior gutter |
| chrome under a site header | literal z-index instead of a `--tt-z-base` rung |
| dark chrome on the site page | inline must stay light |
| growing orphan count | no teardown, plus Modern's per-save churn |
| works in the admin, broken in Classic | you branched on "frontend" instead of on `ctx.mode` — Classic is boxed |
