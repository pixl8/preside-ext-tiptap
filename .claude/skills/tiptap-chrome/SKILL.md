---
name: tiptap-chrome
description: Build UI inside or around the Preside Tiptap editor - dialogs, bubble toolbars, popovers, menus, gutters, overlays. Use when positioning anything relative to the editor or its content, portalling to body, handling clicks and keys across the editing iframe boundary, running editor commands from a button, or fixing chrome that is clipped, mispositioned, unstyled or leaking.
---

# Building chrome for the Preside Tiptap editor

"Chrome" is any UI that is **not** in the document: toolbars, bubbles, dialogs,
menus, rails, gutters. The first rule is what makes it safe:

> **Chrome must never live in the editable.** Put it in the container, in the
> frame's body, or on `<body>` — never inside the ProseMirror document — so
> `getData()` is byte-identical whether your UI is on screen or not.

Anything visual that must sit **over** document content is a ProseMirror
**decoration**, not a class on the rendered node: ProseMirror's next DOM sync
rewrites node attributes and wipes anything you set. A decoration also keeps the
document clean — no `update` event, so the form never goes dirty.

## The boundary you keep tripping over

A boxed editor puts the editable in an **iframe**. Modern inline mode does not.
Read the `tiptap-editing-modes` skill for the full picture; here is the part
that bites chrome:

| You want | Use | Never |
|---|---|---|
| the container from anything in the editable | `api.containerOf( el )` | `el.closest( ".tiptap-editor-container" )` — **returns null from inside the frame**; `closest()` stops at its own document root |
| the frame element | `api.frameOf( el )` | assuming there is one — inline, there is not |
| the visible editor box | `api.surfaceOf( el )` | the mount's raw rect — inline it is page-height |
| content geometry in host coordinates | `api.pageRect( frame, rect )` | the raw rect — inside a frame, 0,0 is the frame's top-left |
| to know a scroll happened | listen on the frame's **document** | listening on the `<iframe>` — an iframe never fires `scroll` itself |

**Where things live**: the frame holds the editable and chrome *glued to the
content* (embeds, image tools, the drag gutter, the table bubble's target). The
host holds the toolbar, footer, outline rail, pickers, slash menu.

**A drag must begin and end in one document.** The drag rail is inside the frame
for exactly this reason: with the grip in the host and the editable in the
frame, `dragstart` fired in one document and ProseMirror's drop handling ran in
the other — the drop did nothing, and a dragged table *vanished*.

## Running an editor command from a button

Two lines, both mandatory.

```js
btn.addEventListener( "mousedown", function( e ) { e.preventDefault(); } );  // keep the selection
btn.addEventListener( "click", function( e ) {
    e.preventDefault();
    api.focusEditable( editor ).chain().focus().toggleBold().run();
} );
```

- **`focusEditable()` first.** Tiptap snapshots the transaction when a chain is
  created and dispatches it at `.run()`. Its `focus` command has a **Safari-only**
  branch that takes DOM focus *synchronously*, which makes ProseMirror re-read
  the selection and dispatch a correcting transaction — so the state moves on
  mid-chain and `.run()` applies a transaction built from the previous state:
  `RangeError: Applying a mismatched transaction`, chain silently lost. Taking
  DOM focus first, outside any transaction, hits Tiptap's own `hasFocus()` guard.
  `chain().focus( pos )` is **not** protected (a position skips the guard) — use
  `setTextSelection( pos )` instead.
- **`mousedown` + `preventDefault`** keeps the editor selection, which is what
  every command operates on. For chrome over a selected node, also
  `stopPropagation()`: a focused button inside a `contenteditable=false` wrapper
  collapses the NodeSelection and hides the very chrome that was just clicked.
  `api.bubbleButton()` does both for you.

## Positioning

### Render before you position

Always. Measuring an empty box put a full-length menu off the bottom of the
screen, and a frame is a replaced element whose height only exists once content
is in it. `render()` then `move()`.

### Bubbles over content

Use **`api.placeBubble( bubble, frame, editor )`** rather than rolling your own.
It encodes three lessons:

- **Left-anchor, then clamp inside the editable.** Centring on the target clips
  half the buttons off any small, floated or right-hand target.
- **Above by preference, flip below** (`.is-below`) when there is no room. A
  target at the top of a field otherwise puts the bubble on the toolbar or
  outside the mount, with nothing reachable.
- **Measure against mount ∩ viewport**, not the raw mount rect. Inline, the
  mount is page-height, so the raw rect answers the wrong question.

### Popovers and menus: portal to `<body>`

A capped-height or `overflow:hidden` field clips anything inside the container.
Portalling costs you three things, all of which have shipped broken:

1. **The `--tt-*` variables do not reach it** — declare them for your class, or
   use literals. (See `tiptap-icons`.)
2. **`position:fixed` placed once does not move.** Re-place on capture-phase
   `scroll` (scroll does not bubble — capture is what sees a scroll in *any*
   host scroller) plus `resize`, rAF-throttled, and **close** when the anchor
   leaves the viewport rather than pointing at something nobody can see.
3. **A mousedown in the editable never reaches the host document.** Bind
   close-on-outside-click to the host document **and**
   `editor.view.dom.ownerDocument`. Same for key handling: the user types into
   the frame, so a host-only `keydown` listener never fires.

```js
var docs = [ document, editor.view.dom.ownerDocument ]
    .filter( function( d, i, all ) { return d && all.indexOf( d ) === i; } );
docs.forEach( function( d ) { d.addEventListener( "mousedown", onDown, true ); } );
```

### The z-index ladder

**Never write a literal z-index.** Every rung is expressed against
`--tt-z-base`, which frontend mode raises above the site's own sticky chrome —
a fixed rung is one that stops moving with the rest, which is exactly how a
maximized editor ended up *under* a site header while the un-maximized one was
fine.

```css
z-index: calc( var(--tt-z-base, 1040) + 1060 );   /* dialog / slash menu / bubble */
```

Rungs in use: sheen `base-1` < frontend container `base` < maximized `base+10` <
outline (fixed) `base+40` < picker overlay `base+960` < dialog / anchor overlay /
slash menu / selection bubble `base+1060`. The default 1040 makes admin stacking
byte-identical to the literals these replaced.

## Dialogs: use `api.openDialog()`, and know why it exists

```js
var dlg = api.openDialog( {
      title    : api.t( "myext.dialog.title" )
    , className: "myext-dialog"
    , tabs     : [ { id: "a", label: "A" }, { id: "b", label: "B" } ]
    , build    : function( body, dialogApi ) { /* fill body */ }
    , buttons  : [ { label: api.t( "picker.ok" ), primary: true, onClick: function( a ) { … } } ]
    , onClose  : function() { … }
} );
// -> { el, body, close, status, setTab, tab }
```

**The panel is built in a shadow root, and that is not a stylistic choice.** The
first version was portalled into the light DOM and the real admin mangled it:
bootstrap's `legend` is 21px, full width, with a bottom border and 20px margin —
so a fieldset legend drew a rule across the dialog; `label` is forced
`inline-block`, so stacked options ran together on one line; Ace re-skins
checkboxes and text inputs — **and several of those arrive with `!important`**.

> **Do not try to fix dialog styling with more specificity.** A specificity
> contest against a real admin theme cannot be won. The boundary is the fix.

Consequences: query into it with `host.shadowRoot`. Inheritable properties (font,
colour, direction) **do** cross a shadow boundary and **form controls inherit no
font at all**, which is why the panel restates its own typography and every
control inside is set to `inherit`. One dialog at a time — opening one closes the
other. Tabs switch *visibility*; they do not rebuild the body, so field values
cannot drift.

Deliberately not presideBootbox: that is an admin bootstrap modal, unavailable
on the front end, unstyled by our variables, and subject to exactly the theming
above.

## Teardown — the rule that catches everyone

**Modern inline mode destroys and recreates the editor on every save.** A leak is
not one orphan, it is one per save.

Return a teardown from your `chrome( ctx )` hook (or push onto
`instance._cleanups`) that removes:

- any element appended to `<body>`
- every listener on `document`, `window`, or the frame's document
- any CSS variable or inline style written onto `<html>` or a page element
- observers (`ResizeObserver`, `MutationObserver`) and pending timers/rAFs

Anything strictly inside `ctx.container` is removed with the container, but
returning a teardown anyway costs nothing and survives a later refactor.

## Symptom → cause

| Symptom | Cause |
|---|---|
| chrome does nothing; no error | `closest()` returned null inside the frame — use `containerOf()` |
| Safari-only: nothing happens, or `Applying a mismatched transaction` | built a chain on an unfocused editable — `focusEditable()` first |
| menu opens at the top-left of the admin page | measured a rect inside the frame without `pageRect()` |
| menu stays open when clicking into the content | listener bound to the host document only |
| typing does not filter the menu | key listener bound to the host document only |
| menu is clipped | inside a capped-height container — portal to `<body>` |
| portalled menu is transparent / unstyled | `--tt-*` variables do not reach outside the container |
| menu hangs in space while the page scrolls | `fixed` and placed once — re-place on capture-phase scroll |
| menu measures/positions wrong | positioned before rendering |
| dark chrome over a light editor | read `prefers-color-scheme` instead of the container's class |
| under a site header when maximized | a literal z-index instead of a `--tt-z-base` rung |
| dialog looks mangled in the admin only | rendered in the light DOM instead of the shadow root |
| one orphan element per save | no teardown; Modern recreates the editor every save |
| highlight disappears after an edit | set a class on a node instead of using a decoration |
