---
name: preside-extension-anatomy
description: Create, structure or ship a Preside CMS extension. Use when scaffolding a new extension, adding config/settings, i18n resource bundles, view or handler overrides, coldbox interceptors, Preside objects; or when setting up the CI release to ForgeBox, versioning, and installing an extension into a website. Covers manifest.json, box.json, config/Config.cfc, load order and dependsOn.
---

# Anatomy of a Preside extension

A Preside extension is a directory under a website's
`application/extensions/<id>/`. Preside discovers it, merges its config, and
layers its views/handlers/objects/i18n over core and over earlier extensions.
There is no registration step beyond being present and listed.

## Directory shape

Only `manifest.json` is required. Everything else is convention, and each
directory is picked up automatically if it exists.

```
preside-ext-<name>/
  manifest.json          REQUIRED - id, title, author, version, dependsOn
  box.json               ForgeBox/CommandBox manifest (needed to publish)
  README.md
  config/
    Config.cfc           settings (merged into the app's config)
    Wirebox.cfc          DI bindings
    Routes.cfm           URL routes
  handlers/              coldbox handlers; same path as core = override
  views/                 same path as core = override  (SEE THE WARNING BELOW)
  services/ or api/      model CFCs (autowired by convention)
  preside-objects/       Preside object definitions (DB tables)
  forms/                 form definitions
  i18n/<bundle>.properties
  assets/
    StickerBundle.cfc    asset declarations (see the `sticker-assets` skill)
    <files>              served from the extension mount
  interceptors/
```

### `manifest.json`

```json
{
	  "id"        : "preside-ext-tiptap-spellcheck"
	, "title"     : "Preside Tiptap — Spellcheck"
	, "author"    : "Pixl8 Group"
	, "version"   : "$VERSION_NUMBER"
	, "dependsOn" : [ "preside-ext-tiptap" ]
}
```

- **`id` must match the directory name.** The asset mount and the install path
  are both derived from it.
- **`version` ships as the literal `$VERSION_NUMBER` placeholder** — CI
  substitutes it (below). Do not hardcode a version anywhere.
- **`dependsOn` is what makes everything else deterministic.** It orders
  extension loading, and therefore config merging *and* Sticker registration.
  An extension building on another must list it.

### `config/Config.cfc`

Runs once, in dependency order, merging into the application's settings.

```cfml
component {
	public void function configure( required struct config ) {
		var settings = arguments.config.settings ?: {};

		settings.myThing = settings.myThing ?: {};
		settings.myThing.enabled = settings.myThing.enabled ?: true;
	}
}
```

Two habits worth having, both cheap:

- **Append, never assign, to anything another extension might also write.**
  `dependsOn` should make the order what you expect; writing defensively means
  nothing rests on that belief being correct.
  ```cfml
  settings.some.list = settings.some.list ?: [];
  settings.some.list.append( [ "a", "b" ], true );   // true = merge the array
  ```
- **Guard with `?:` before reading a nested key.** A site may not have the
  parent struct at all.

Read a setting later with `getSetting( name="a.b.c", defaultValue=… )` — **dot
notation works** and resolves nested structs.

### i18n

`i18n/<bundle>.properties`; referenced as `translateResource( uri="<bundle>:<key>" )`.
Sites localise by adding `<bundle>_<lang>.properties`. Keep bundle names
distinctive — they share one namespace across core and every extension.

### Views and handlers

Same relative path as core = override. **A view can only be overridden once:**
if two extensions override the same view, the later one wins and the earlier
one's behaviour silently disappears. This is a real failure mode, not a
theoretical one — it is exactly why `preside-ext-tiptap` moved its editor i18n
key list out of `views/admin/layout/ckEditorJs.cfm` and into a setting.

**Before overriding a view, check nothing else already does**, and prefer a
mechanism that composes (a setting, an interceptor, a Sticker asset) whenever
one exists.

## Installing into a website

Two supported approaches.

**1. `box.json` local dependency (reproducible; recommended for sharing).**
In the *website's* `box.json`:

```json
"dependencies":  { "preside-ext-x": "/abs/path/to/preside-ext-x/" },
"installPaths":  { "preside-ext-x": "application/extensions/preside-ext-x/" }
```

`box install` **copies** the folder in. Re-run it after editing source.

**2. Symlink hybrid (live edits during development).** Real install directory;
symlink the CFML files and keep any served asset directory a real copy:

```bash
ln -s <repo>/{manifest.json,box.json,config,views} <install>/
mkdir <install>/assets && ln -s <repo>/assets/StickerBundle.cfc <install>/assets/
rsync -a --delete <repo>/assets/dist/ <install>/assets/dist/
```

**Why the split**: CFML files are loaded by component/view resolution, which has
no path guard. **Served static files are different** — `StaticAssetDownload`
rejects any file whose canonical path is outside the extensions directory, and
CFML engines resolve symlinks, so a symlinked asset directory 404s. See the
`sticker-assets` skill.

**After any structural change or `.cfc` edit, restart the server or `fwreinit`.**
Production mode caches the extension list, views, Wirebox bindings and Sticker
bundles.

## Releasing to ForgeBox

The pattern used across Pixl8's extensions (`.github/workflows/ci.yml`).
**The ref name IS the version** — there is nothing to edit:

| push this ref | published version | result |
|---|---|---|
| tag `v1.2.0` | `1.2.0+<build>` | stable release |
| branch `release-1.2.0` | `1.2.0-SNAPSHOT<build>` | prerelease |

`<build>` is the zero-padded GitHub run number. Publishing runs **only** from a
`release-*` or `v*` ref, never from a PR. So a stable release is:

```bash
git tag v1.2.0 && git push origin v1.2.0
```

The pipeline:

1. **Every run**: build, then **fail if committed build output differs from a
   fresh build** — the guard against someone editing source without committing
   the rebuild.
2. **Publish runs**: `pixl8/github-action-twgit-release-version-generator`
   computes the semver; `envsubst` injects it into the `$VERSION_NUMBER`
   placeholders in **`box.json` and `manifest.json`**.
3. The project is zipped, excluding everything in `box.json`'s `ignore` list
   (source, tests, `node_modules`, build config, agent files); a GitHub release
   is created with the zip attached; that asset URL replaces `$DOWNLOAD_URL` in
   `box.json`; `pixl8/github-action-box-publish` pushes to ForgeBox.

Needs repo/org secrets **`FORGEBOX_USER`** and **`FORGEBOX_PASS`**.

`box.json` essentials:

```json
{
    "name": "PresideCMS Extension: X",
    "type": "preside-extensions",
    "version": "$VERSION_NUMBER",
    "location": "$DOWNLOAD_URL",
    "slug": "preside-ext-x",
    "directory": "application/extensions",
    "ignore": [ ".git/*", ".github/*", "node_modules/*", "src/*", "harness/*",
                "package.json", "package-lock.json", "CLAUDE.md", "devlocal.md" ]
}
```

**If your extension has a build step, commit the build output** and keep the
lockfile committed too — otherwise a floating dependency changes the shipped
bytes on every CI run, and step 1's guard becomes noise.

## Checklist for a new extension

- [ ] `manifest.json` with a matching `id`, `$VERSION_NUMBER`, and correct `dependsOn`
- [ ] `box.json` with `$VERSION_NUMBER`, `$DOWNLOAD_URL`, a sane `ignore` list
- [ ] `config/Config.cfc` appending rather than assigning shared settings
- [ ] i18n bundle with a distinctive name
- [ ] no view override that another extension is likely to want
- [ ] served assets are real files under the install (never symlinked)
- [ ] `.github/workflows/ci.yml` + `FORGEBOX_USER`/`FORGEBOX_PASS`
- [ ] `fwreinit` and confirm it loads before assuming anything works
