---
name: tiptap-plugin-api
description: Build a preside-ext-tiptap-* add-on extension, or make an existing Preside extension add functionality to the Tiptap rich editor. Use when adding a toolbar button, a "/" menu entry, a Tiptap extension/mark/node, editor chrome, or AI/spellcheck/diagram-style features from OUTSIDE the core editor extension. Covers window.PresideTiptap.plugins, the spec, the ctx object, lifecycle events, PresideTiptap.api, and a complete worked example.
---

# Building an add-on for the Preside Tiptap editor

`preside-ext-tiptap` replaces Preside's CKEditor 4 with Tiptap v3. Optional
capability — AI authoring, spellcheck, diagramming, custom embeds — belongs in
its **own** `preside-ext-tiptap-*` extension, so the fidelity-critical core stays
small and a site ships no code for a feature it does not use.

`apiVersion` is **1**. There are no compatibility shims: a plugin can check the
version and refuse, and that is the whole negotiation.

## Before you write anything: does this belong in an add-on?

Answer these first. Two of them are disqualifying.

| Question | If yes |
|---|---|
| Does the feature change what `getData()` stores? | **STOP.** Not an add-on. The stored `{{…}}` markup is a contract with Preside's renderers. Discuss it against the core extension's fidelity matrix. |
| Does it need a Tiptap extension (mark, node, ProseMirror plugin)? | Fine — `tiptapExtensions`. This is the one hook that must run *before* the editor exists. |
| Does it need to run per-editor after mount? | Fine — `chrome`. |
| Does it need a toolbar button / "/" entry / bubble button? | Fine — `commands`, `slashItems`, `bubble`. |
| Does it need to re-point an existing button (`Bold`, `Format`)? | **Not possible, by design.** Built-ins always win the name lookup. Contribute a new name. |
| Does it need state that outlives the field? | It needs a Preside object/setting of its own. Load **`preside-extension-anatomy`**. |

## The two globals

Both live on `window.PresideTiptap`, which the **vendor** bundle defines — the
first editor script on the page. That is why a parse-time `register()` is always
safe.

- **`PresideTiptap.plugins`** — `register( spec )`, `all()`, `get( name )`, and
  a lifecycle bus `on( evt, fn )` / `off` / `emit`.
- **`PresideTiptap.api`** — the shared helpers, populated by the *facade*
  bundle. **Use these; do not reimplement them.** Each encodes a trap that cost
  the core extension a release (see "The helpers" below). Your bundle parses
  *before* the facade, so **read them off `ctx.api` at runtime**, never as
  `var api = T.api` at module top.

Also exported for plugin use: `Editor`, `Extension`, `Node`, `Mark`,
`mergeAttributes`, `Plugin`, `PluginKey`, `Decoration`, `DecorationSet`,
`NodeSelection`, `TextSelection`, `Slice`, `Fragment`, `DOMSerializer`,
`DOMParser`, `Transform`, `Suggestion`, `StarterKit`.

**Never `import` Tiptap into your own bundle.** Read it off
`window.PresideTiptap`, and mark `@tiptap/*` external if you bundle at all. Two
copies of ProseMirror on one page is a class of bug you do not want to debug.

## Registering

Call at your bundle's **parse time**. Your Sticker asset declares
`.dependsOn("ckeditor").dependents("tiptap-facade")` (see the bundle section
below), so you parse after the **vendor** bundle — which is what defines
`window.PresideTiptap` and the registry — and well before `formFields.js` mounts
textareas on DOM-ready, the only window that affects the editors on the page.
Registering later still applies to editors created *afterwards* and logs a
`console.warn`; a predictable half-failure beats a silent one.

Note you parse **before the facade**, so `PresideTiptap.api` is not there yet.
Reach the helpers through `ctx.api` at runtime rather than capturing `T.api` at
module top.

```js
( function() {
    var T = window.PresideTiptap;
    if ( !T || !T.plugins || T.apiVersion !== 1 ) { return; }   // fail quiet, not loud

    T.plugins.register( { name: "spellcheck", /* … */ } );
} )();
```

## The spec

Every field optional except `name`.

```js
{
    name             : "spellcheck"    // unique; also the defaultConfigs opt-out key

    // Per-field opt-out. The convention every built-in feature follows.
  , enabled          : function( cfg ) { return cfg.defaultConfigs.spellcheck !== false; }

    // BEFORE the editor exists. Return Tiptap extension(s).
  , tiptapExtensions : function( ctx ) { return [ … ]; }

    // Toolbar button names -> commands. `icon` is a raw SVG string.
    // `run( editor, cfg )`, `active( editor )`.
  , commands         : { Spellcheck: { run: …, active: …, icon: "<svg…>", label: "Sp" } }

    // "/" menu entries: { key|label, hint, icon, group, keywords, run|cmd }
  , slashItems       : function( ctx ) { return [ … ]; }

    // Modern inline mode's selection bubble: does this command apply right now?
  , bubble           : { Spellcheck: function( editor ) { return true; } }

    // AFTER mount, editor live. Return a teardown function.
  , chrome           : function( ctx ) { …; return function cleanup() { … }; }

    // English fallbacks, merged UNDER the editor's own DEFAULTS.
  , i18nDefaults     : { "toolbar.spellcheck": "Check spelling" }
}
```

### `commands` — how a button becomes real

A command only renders if the field's **toolbar config names it**. Nothing is
added to anyone's toolbar automatically; a site opts in by putting `Spellcheck`
in `settings.ckeditor.toolbars.<name>` or a field's `data-toolbar`.

- The button's tooltip is `t( "toolbar." + name.toLowerCase() )` — so a command
  named `Spellcheck` wants the key **`toolbar.spellcheck`**.
- `icon` is a raw SVG string; without one the button falls back to `label` text.
  Load **`tiptap-icons`** before drawing one.
- `run( editor, cfg )` gets the Tiptap editor and the field config. **If it runs
  an editor command, focus first**: `api.focusEditable( editor ).chain()…run()`.
- `active( editor )` drives the `is-active` class, refreshed on every
  transaction, selection change, and immediately after a click.
- **Built-ins win.** `Bold` resolves to the core's `Bold` however you register.

### `slashItems` — reaching the "/" menu

Same shape the built-ins use. An item whose `cmd` does not resolve is **dropped**
rather than shown broken. Give either `key` (label from `slash.<key>`, hint from
`slash.<key>.hint`) or a literal `label`/`hint`. An unknown `group` prints its
own name as the heading, so add `slash.group.<x>` to `i18nDefaults` if you want
it translated.

### `chrome` — per-editor UI

Runs last, with everything built. **Return a teardown.** Anything you put on
`<body>`, on `document`, on `<html>`, or any listener outside `ctx.container`
*must* be undone there — Modern inline mode destroys and recreates the editor on
**every save**, so a leak is one orphan per save. Things inside `ctx.container`
go when the container does, but returning a teardown anyway costs nothing.

## The ctx object

```js
ctx = {
    editor     // the Tiptap editor      (null during tiptapExtensions)
  , instance   // the CKEditor-shaped facade instance (null during tiptapExtensions)
  , cfg        // the field config, including defaultConfigs
  , container  // .tiptap-editor-container, in the HOST document
  , toolbar    // the toolbar element, or null in Modern inline mode
  , frame      // the editing <iframe>, or NULL in Modern inline mode
  , mode       // "boxed" | "inline"
  , api        // PresideTiptap.api
}
```

**It is one object, filled in as the pieces appear.** `tiptapExtensions` must run
before there is an editor at all, so it is handed the same ctx with `editor` and
`instance` still null — keep the reference and they arrive. Do not snapshot
`ctx.editor` at that point.

**`ctx.frame` is the single most important field.** Boxed editors put the
editable in an **iframe**; Modern inline mode does not. Load
**`tiptap-editing-modes`** before writing anything that positions itself or
listens for events.

## Lifecycle

| Event | When | Use for |
|---|---|---|
| `beforeExtensions` | in `buildExtensions`, before the array is returned | the only moment a Tiptap extension can be added (`ctx.extensions` is the live array) |
| `toolbarReady` | after the toolbar is built | chrome positioned relative to the toolbar |
| `instanceReady` | after mount, on `setTimeout(0)` | the classic "editor is up" hook |
| `beforeDestroy` | **top** of `destroy()`, before `_cleanups`, editor still alive | revert document state you applied |

The last three also fire on the facade instance's own CKEditor-shaped bus
(`instance.on( "toolbarReady", fn )`). `beforeExtensions` reaches the registry
bus only — there is no instance yet, which is also why `tiptapExtensions` is a
registry hook rather than an event.

```js
T.plugins.on( "beforeDestroy", function( ctx ) { /* editor is still usable here */ } );
```

## The helpers (`PresideTiptap.api`) — and why each exists

Do not reimplement these. Each line is a bug someone already shipped.

| Helper | Why it exists |
|---|---|
| `containerOf( el )` | `el.closest( ".tiptap-editor-container" )` **returns null from inside the editing frame** — `closest()` stops at its own document's root. This is how the core's Maximize button silently stopped working. |
| `frameOf( el )`, `surfaceOf( el )`, `pageRect( frame, rect )` | The frame boundary: which element is the visible editor box, and how to translate content geometry into host coordinates. Chrome positioned without these lands at the top-left of the admin page. |
| `focusEditable( editor )` | Tiptap's `focus` command takes DOM focus **synchronously on Safari**, which makes ProseMirror dispatch a correcting transaction mid-chain — `RangeError: Applying a mismatched transaction`, and the whole chain is silently lost. Take DOM focus first, then chain off the return value. |
| `openDialog( opts )` / `closeDialog()` | Dialog chrome in a **shadow root**. The Preside admin's own `legend`/`label`/`input`/`button` rules — several `!important` — mangle a light-DOM panel, and no amount of specificity wins that fight. |
| `placeBubble( bubble, frame, editor )`, `bubbleButton( cls, icon, label, text )` | Left-anchor then clamp (centring clips buttons off a small or floated target), flip below when there is no room, measure against mount ∩ viewport (inline, the mount is page-height). |
| `t( key, subs )` | Resolves at render time. `cfrequest.tiptapI18n` → `window.PresideTiptapI18n` → the editor's DEFAULTS → plugin `i18nDefaults`. |
| `ICONS` | The editor's own MIT (Tabler) icon set — reuse a name before drawing one. |
| `applyTheme( container )`, `isDark( container )` | `isDark` reads the **container**, not the stored preference: an inline editor is deliberately light whatever the user chose. |
| `tokenize`, `detokenize`, `normalizeOutput` | The `{{…}}` ↔ HTML conversion and the output normaliser. Exported so a plugin touching content can see **what `getData()` will really store** and prove it has not broken fidelity. |

## i18n

Two halves, and you need both:

- **Client fallbacks** — `i18nDefaults` in the spec. They sit *under* the
  editor's own DEFAULTS, so you can add keys but never silently restate one of
  the editor's.
- **Server translations** — append to `settings.tiptap.i18nKeys` in your
  `config/Config.cfc`, naming **your own** resource bundle:

```cfml
settings.tiptap          = settings.tiptap ?: {};
settings.tiptap.i18nKeys = settings.tiptap.i18nKeys ?: [];
settings.tiptap.i18nKeys.append( [ "tiptapspell:toolbar.spellcheck" ], true );
```

**APPEND, never assign** — `dependsOn` should order this correctly anyway, but
writing it defensively means nothing rests on that belief. The prefix names the
bundle (`i18n/tiptapspell.properties` in your extension); the **JS key stays
unprefixed** (`t( "toolbar.spellcheck" )`).

**Never override `views/admin/layout/ckEditorJs.cfm`.** A view can only be
overridden once — you would silently drop the editor's own strings. That is the
entire reason the key list is a setting.

## Worked example: `preside-ext-tiptap-spellcheck`

```
preside-ext-tiptap-spellcheck/
  manifest.json            { "id":"preside-ext-tiptap-spellcheck",
                             "dependsOn":[ "preside-ext-tiptap" ], … }
  box.json
  config/Config.cfc        appends settings.tiptap.i18nKeys
  i18n/tiptapspell.properties
  assets/StickerBundle.cfc
  assets/dist/spellcheck.<hash>.min.js
  src/index.js
```

**`assets/StickerBundle.cfc`**

```cfml
component output=false {
    public void function configure( required any bundle ) {
        bundle.addAsset( id="tiptap-spellcheck"    , path="/dist/spellcheck.*.min.js"  );
        bundle.addAsset( id="tiptap-spellcheck-css", path="/dist/spellcheck.*.min.css" );

        bundle.asset( "tiptap-spellcheck" )
              .dependsOn( "ckeditor" )         // window.PresideTiptap + the registry
              .dependents( "tiptap-facade" );  // ...and THIS is what includes us at all

        bundle.asset( "tiptap-spellcheck-css" )
              .dependsOn( "tiptap-css" )       // our cascade must follow the host's
              .dependents( "tiptap-facade" );  // pull only - cross-type, no CSS reorder
    }
}
```

### `dependents()` is what gets you onto the page

Sticker only renders an asset something explicitly **includes**, and the editor's
includes live in the host's `ckEditorJs.cfm`. **Never override that view to add
your own `include()`** — a view can only be overridden once, so the last override
wins and silently drops the host's includes *and* its i18n strings. (That is the
same reason the key list is a setting.)

You do not need to. `dependents()` is the documented reverse of `dependsOn()`:

- `BundleManager._mapDependencies()` rewrites `A.dependents = [B]` into
  `B.dependsOn( A )` when bundles are assembled;
- at render time `Sticker._addIncludeDependencies()` walks the `dependsOn` graph
  of everything that *was* included and pulls those in too.

The host already includes `tiptap-facade`, so naming it as your dependent is
enough. **No host change, no setting, and it works against a host release that
knows nothing about your extension.**

### What it costs: you load BEFORE the facade

`dependents()` implies `before()` — a thing you depend on loads first — so the
pull and the order are one decision, and Sticker's transitive walk only follows
`dependsOn`. Anything auto-pulled therefore lands *before* its puller. There is
no way to be pulled in and still land after.

Consequences, both manageable:

- **`PresideTiptap.api` is NOT populated when your bundle parses** — the facade
  publishes it. Reach the helpers through `ctx.api` at runtime (the normal shape)
  and this never comes up; a module-top `var api = T.api` gets `undefined`.
- You still need `dependsOn( "ckeditor" )`, because the **vendor** bundle is what
  defines `window.PresideTiptap` and the plugin registry. Landing between the
  vendor bundle and the facade is comfortably before `formFields.js` mounts any
  editor on DOM-ready, which is the only deadline `register()` actually has.

CSS wants the opposite order, hence the explicit `dependsOn( "tiptap-css" )`
above: Sticker renders each type in its own pass, so a JS-asset `dependents`
constraint cannot disturb where your stylesheet lands.

Load **`sticker-assets`** for the rest, and for why the dist directory must be
real files.

**`src/index.js`**

```js
( function() {
    "use strict";
    var T = window.PresideTiptap;
    if ( !T || !T.plugins || T.apiVersion !== 1 ) { return; }

    var ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"'
        + ' stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
        + '<path d="M4 15l4 -8l4 8"/><path d="M5 13h6"/><path d="M15 16l2 2l4 -4"/></svg>';

    T.plugins.register( {
          name   : "spellcheck"
        , enabled: function( cfg ) { return cfg.defaultConfigs.spellcheck !== false; }

        // Misspellings are DECORATIONS, never marks: a decoration is view-only,
        // so it cannot dirty the form, cannot reach getData(), and has no
        // clean-up path to get wrong. Same reasoning as the editor's own find
        // highlight and outline "you landed here" flash.
        , tiptapExtensions: function( ctx ) {
            return [ T.Extension.create( {
                  name: "presideSpellcheck"
                , addProseMirrorPlugins() {
                    var key = new T.PluginKey( "presideSpellcheck" );
                    return [ new T.Plugin( {
                          key
                        , state: {
                              init : function() { return T.DecorationSet.empty; }
                            , apply: function( tr, old ) { return old.map( tr.mapping, tr.doc ); }
                          }
                        , props: { decorations: function( state ) { return key.getState( state ); } }
                    } ) ];
                  }
            } ) ];
          }

        , commands: {
            Spellcheck: {
                  icon  : ICON
                , label : "Sp"
                , run   : function( editor, cfg ) {
                    // T.api is only there at RUNTIME - this bundle parsed before
                    // the facade published it. focusEditable FIRST, see the
                    // helpers table.
                    T.api.focusEditable( editor );
                    /* …run the check, dispatch a decoration transaction… */
                    return true;
                  }
                , active: function( editor ) { return false; }
            }
          }

        , bubble: { Spellcheck: function() { return true; } }

        , slashItems: function( ctx ) {
            return [ { label: "Check spelling", icon: ICON, group: "preside"
                     , keywords: "spell grammar proof", cmd: "Spellcheck" } ];
          }

        , chrome: function( ctx ) {
            // ctx.frame is null inline - see tiptap-editing-modes.
            var doc = ctx.frame ? ctx.frame.contentDocument : document;
            function onIdle() { /* … */ }
            doc.addEventListener( "keyup", onIdle );
            return function() { doc.removeEventListener( "keyup", onIdle ); };
          }

        , i18nDefaults: { "toolbar.spellcheck": "Check spelling" }
    } );
} )();
```

## Rules the merge points keep — do not fight them

- **An unknown or disabled command is skipped silently**, exactly as an unmapped
  CKEditor button name is. A field that opted your plugin out must look
  **identical** to one where it was never registered — including leaving no
  dangling toolbar separator where your button would have been.
- **A "/" item whose command is unavailable is dropped**, never shown broken.
- **`i18nDefaults` sit under the editor's DEFAULTS.**
- **A registered but idle plugin changes `getData()` by nothing.** Assert this in
  your tests; it is the release criterion.

## Verifying

Load **`tiptap-harness-testing`**. The minimum bar, all of which the core
extension's own `harness/test-plugin-api.html` demonstrates:

1. your Tiptap extension is in `editor.extensionManager.extensions`;
2. your button renders with its icon and translated title, and its `active`
   state toggles;
3. `defaultConfigs.<name> = false` removes **all** of it, separators included;
4. your `chrome` teardown runs on `destroy()` and leaves nothing behind;
5. **`getData()` is byte-identical** with your plugin registered and idle.

`harness/plugin-fixture.js` in the core repo is a working template registering
one of everything — copy it as a starting point.
