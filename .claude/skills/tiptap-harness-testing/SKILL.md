---
name: tiptap-harness-testing
description: Write, run or debug tests for the Preside Tiptap editor or an add-on extension. Use when adding a test case, verifying a change end to end, checking output fidelity, or when a test passes but the feature is broken. Covers the browser harness, self-running test pages, reaching into the editing iframe, and the synthetic-event traps (HTML5 drag, pointer capture, undo grouping, focus).
---

# Testing the Preside Tiptap editor

Tests run in a **browser harness** that boots the editor with Preside's
server-side dependencies mocked — no CFML, no DB, no Preside boot.

```bash
cd harness && node server.mjs          # http://localhost:8700
# CKEditor comparison pane also needs:
#   PRESIDE_ASSETS=/path/to/Preside-CMS/system/assets node server.mjs 8700
```

Rebuild first if you changed source (`npm run build`). The server globs the
content-hashed dist filenames, so pages can reference stable names
(`/dist/facade.min.js`).

| Page | What it is |
|---|---|
| `/` | side-by-side CKEditor vs Tiptap |
| `/tiptap.html`, `/ckeditor.html` | each editor alone |
| `/fidelity.html` | feed the SAME stored HTML into both; compare `getData()` |
| `/test-realworld.html` | self-running; cases lifted from real Preside sites |
| `/test-frontend-inline.html` | self-running; Modern inline mode |
| `/test-plugin-api.html` | self-running; the plugin API (+ `plugin-fixture.js`) |
| `/test-frontend-maximize.html` | visual; hostile site chrome |

`node test-link-serialization.mjs` is a pure-node unit test of the link token
contract.

## The bar for a change

1. **Every existing self-running test still passes**, unchanged.
2. **The fidelity matrix does not move.** Any diff in those numbers means
   something is wrong — this is the release criterion, not a nice-to-have.
3. Your new behaviour has a case, and — where it applies — an assertion that
   **`getData()` is byte-identical** when your feature is idle.

## Writing a self-running page

Copy the shape of `test-plugin-api.html`. The contract every runner follows:

```js
window.__results = [ { label, ok, detail } ];
window.__done    = true;                        // set last
```

with a `#summary` element showing "N passed, M failed". That is what a Playwright
driver waits on:

```js
await page.goto( "http://localhost:8700/test-plugin-api.html" );
await page.waitForFunction( "window.__done", null, { timeout: 90000 } );
await page.evaluate( () => window.__results.filter( r => !r.ok ) );
```

**Mount explicitly.** jQuery's `ready` runs before the facade's own
`DOMContentLoaded` bootstrap, so instances would not exist yet:

```js
PresideRichEditor.bootstrap( document );
var inst = CKEDITOR.instances.myfield;   // the facade instance
var ed   = inst._t;                      // the Tiptap editor
```

**Fixtures are `<textarea class="richeditor">`** with the same data attributes
Preside emits: `data-toolbar`, `data-stylesheets`, `data-custom-config`,
`data-custom-default-configs='{"myflag":false}'`.

**Give each test its own fixture.** Sharing one field across tests couples them
to each other's timing — an early version of the resize test dragged another
test's field and raced its outline rail's rAF re-centring.

## Reaching into the editing iframe

The editable is in a **separate document**, so `container.querySelector()`
cannot see it. Every harness page carries these helpers; copy them.

```js
function frameElOf( c )  { return c.querySelector( "iframe.tiptap-editor-frame" ); }
function frameDocOf( c ) { var f = frameElOf( c ); return f ? f.contentDocument : document; }
function surfaceEl( c )  { return frameElOf( c ) || c.querySelector( ".tiptap-editor-mount" ); }
```

They all fall back to the container, so **the same test text works for boxed and
inline** — which is how you get inline coverage cheaply.

**Dispatch synthetic events into the right document**, in that document's
coordinate space, and construct them from that window
(`new frameWin.MouseEvent(…)`).

**Focus before driving a command.** A real user's click focuses the editable
natively; a synthetic test does not, and on Safari a chain built on an unfocused
editable throws and is silently lost. Every harness page has:

```js
function edFocus( e ) {
    try { if ( e && !e.isDestroyed && e.view && !e.view.hasFocus() ) { e.view.focus(); } } catch ( err ) {}
    return e;
}
```

For a dialog behind a shadow root, query with `host.shadowRoot` — keyboard
events are composed and still bubble out, so Esc handling is unaffected.

## Synthetic-event traps

These all **report success while doing nothing**. Every one cost real debugging.

| Trap | What actually works |
|---|---|
| **Playwright `dragTo()` does not drive native HTML5 drag-and-drop.** It uses mouse events; the drop never happens. | Dispatch `dragstart`/`dragover`/`drop`/`dragend` yourself with **one shared `DataTransfer`**. |
| **`prosemirror-tables` column resize ignores synthetic mouse events** — it arms its handle only for real pointer input. | Assert the serialisation contract by setting `colwidth` the way a finished drag leaves it; verify the drag itself with a real Playwright mouse. |
| **Pointer-capture UI (the resize grip) needs real `PointerEvent`s**, not MouseEvents. | Construct `PointerEvent` with a `pointerId`. |
| **ProseMirror's history amalgamates transactions within 500ms** (`newGroupDelay`), so "insert then immediately drag" is ONE undo step — which looks exactly like "undo is broken". | Wait ~900ms between the two, as a real user's pause does. |
| **jQuery's `.trigger("click")` skips the native default on `<a>`**, so `addEventListener` handlers never fire. | Use the native `el.click()`. |
| **A click that moves no caret fires no `selectionUpdate`.** | Listen for / dispatch `mouseup` too. |

## Asserting fidelity

The assertion that matters most is the cheapest to write:

```js
check( "getData() is byte-identical with the feature idle",
       inst.getData() === "<p>alpha</p>", inst.getData() );
```

Also useful:

- `inst.getData() === inst.initialdata` after mounting a real record — proves
  load→serialise round-trips.
- Undo restores **byte-for-byte** after an operation.
- **Idempotence**: `setData( getData() )` then `getData()` again is unchanged.

## Testing an add-on extension

Do it in your own repo, the same way `test-plugin-api.html` does:

1. serve your built bundle alongside the editor's;
2. load, in order: jQuery → mocks → `tiptap.bundle.min.js` →
   `facade.min.js` → **your bundle** (this is the real Sticker order);
3. record what your hooks observe on a global (`window.__demo` in the core
   fixture) and assert against it;
4. include a field with `data-custom-default-configs='{"<yourname>":false}'` and
   assert it looks **identical** to one where you never registered — no button,
   no extension, no chrome, and **no stray toolbar separator**;
5. assert your teardown runs on `destroy()` and leaves nothing behind.

`harness/plugin-fixture.js` in the core repo registers one of everything and is
the intended starting template.

## When a test passes but the feature is broken

Work down this list:

- Did the synthetic event actually do anything? (See the trap table.) Assert a
  **consequence**, never that the dispatch returned.
- Did you dispatch into the frame's document, in frame coordinates?
- Was the editable focused?
- Is the assertion measuring rendered geometry before layout settled? Some
  chrome re-places on rAF — wait a frame.
- Did an earlier test leave the shared fixture in a different state?
- For a boxed-only test: does it also hold **inline**? That is where geometry
  bugs live, and where half of them were found.
