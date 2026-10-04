# bb-plugins

A collection of small, standalone plugins for bb. Each package has its own
version, documentation, source code, tests, and release tags.

| Plugin | Package | Description |
| --- | --- | --- |
| [Project Themes](plugins/project-themes/README.md) | `bb-plugin-project-themes` | One subtle color per project across threads, the browser tab, and the overall background. |
| [Git Deck](plugins/git-deck/README.md) | `bb-plugin-git-deck` | Branches, diffs, commits, push/pull, per-project accounts, and GitHub Actions fix requests. |
| [Thread Overview](plugins/thread-overview/README.md) | `bb-plugin-thread-overview` | Results, changes, subagents, processes, and sources in the thread sidebar. |

## Repository structure

```text
.bb/plugins.json             Catalog for installing individual plugins
.github/workflows/           Shared CI and release draft creation
plugins/
  project-themes/
    package.json             Standalone bb/npm manifest
    src/                     Frontend and backend
    tests/
    skills/
    README.md
    PLUGIN_OVERVIEW.md
    CHANGELOG.md
docs/RELEASING.md             Independent version release workflow
scripts/release-info.mjs      Maps tags to directories and package versions
package.json                 Private npm workspace
package-lock.json            One lockfile for the entire collection
```

The `packages/` directory is added only when there is actual shared code.
Dependencies are declared in plugin packages; npm hoisting installs shared versions
once. The SDK version is pinned in each package, and the `bb-app` version used for
builds is pinned at the root. Each plugin's tsconfig is self-contained so the plugin
can be installed from a Git subdirectory.

## Development

Use Node.js 24 (`nvm use`), then run these commands from the repository root:

```sh
npm install
npm run typecheck
npm test
npm run build
```

To work on a single plugin:

```sh
npm run build --workspace=bb-plugin-project-themes
npm run dev:project-themes
bb plugin install path:. --plugin project-themes
```

## Adding a plugin

1. Create `plugins/<id>/` with its own `package.json`, source code, and README.
2. Declare `bb.server`, optionally `bb.app`, branding, and compatibility.
3. Add `{ "name": "<id>", "source": "./plugins/<id>" }` to `.bb/plugins.json`.
4. Add `build`, `typecheck`, and `test` scripts to the package; shared commands and CI will pick them up.
5. Run `npm install` at the root and add a description to the table above.

## Releases

Tags follow the format `project-themes-v0.1.0`. Plugins are versioned independently;
the root workspace is not published. Pushing a tag builds the selected package
and creates a **draft** GitHub Release with an npm package archive. The draft is
published manually.

For detailed commands covering installation from Git, releases, and optional npm publishing, see
[docs/RELEASING.md](docs/RELEASING.md).

## License

[MIT](LICENSE), copyright © 2026 lumenikoly.
