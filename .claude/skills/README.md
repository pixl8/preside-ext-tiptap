# Skills for `preside-ext-tiptap`

Task-shaped instructions, loaded on demand. `CLAUDE.md` describes how this repo
**is**; a skill describes how to **do a job**.

They are deliberately written to work **from another repo** — an add-on
extension's own working directory, where this `CLAUDE.md` is not loaded — so
each one restates the constraints it depends on instead of pointing at a file
the reader may not have. That means some overlap between skills, and between a
skill and `CLAUDE.md`. Keep it: a skill that only works when you have already
read something else is a skill that will be half-followed.

## The set

| Skill | Use it when |
|---|---|
| **`tiptap-plugin-api`** | Building a new `preside-ext-tiptap-*` add-on, or making an existing extension talk to the editor. The entry point for "add a feature to the editor from outside". |
| **`preside-extension-anatomy`** | Creating or shipping any Preside extension: `manifest.json`, `box.json`, `config/Config.cfc`, i18n bundles, views/handlers, the CI → ForgeBox release flow, installing into a site. |
| **`sticker-assets`** | Getting JS/CSS onto a Preside page in the right order, or debugging a 404 / a script that ran too early. |
| **`tiptap-icons`** | Drawing a toolbar icon, or making anything theme correctly in light **and** dark. |
| **`tiptap-chrome`** | Building UI inside the editor: dialogs, bubbles, popovers, menus — anything positioned, portalled, or that has to survive the admin's stylesheets. |
| **`tiptap-editing-modes`** | Anything touching frontend editing, or that must behave differently boxed vs inline (Classic vs Modern). |
| **`tiptap-harness-testing`** | Writing or debugging a test, in this repo or an add-on's. |

## Suggested order for a new add-on

1. **`tiptap-plugin-api`** — decide what hooks you actually need, and check the
   feature belongs in an add-on at all.
2. **`preside-extension-anatomy`** — scaffold the extension.
3. **`sticker-assets`** — get the bundle on the page, after the facade.
4. **`tiptap-icons`** / **`tiptap-chrome`** / **`tiptap-editing-modes`** — as the
   feature needs them.
5. **`tiptap-harness-testing`** — before you call it done.

## The rule that outranks every skill

**A plugin must not change what `getData()` stores.** Preside's server-side
renderers, forms and AJAX endpoints assume the stored `{{…}}` token markup is
exactly what CKEditor 4 produced. If your feature needs to persist something,
it persists it *somewhere other than the field's content*, or it is not an
add-on — it is a change to the core extension, with a fidelity discussion
attached.
