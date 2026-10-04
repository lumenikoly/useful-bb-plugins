# Add Git Deck

Git Deck adds a Git page and thread panel with a branch browser, commit graph,
revision details, file diffs, staging, commits and Fetch/Pull/Push. Compact row
actions offer branch creation, confirmed local deletion and a branch menu; the
creation dialog includes a source selector. Fetch and Pull prune stale
remote-tracking branches. Repository-local
author and SSH settings use system Git and OpenSSH. An optional GitHub Actions
view uses GitHub CLI to inspect failed jobs and prepare editable Fix it requests
in BB's native composer.

## Release source

- Author/submitting account: `lumenikoly`.
- Public repository: https://github.com/lumenikoly/useful-bb-plugins.
- Plugin directory: `plugins/git-deck`.
- Package / version: `bb-plugin-git-deck@0.1.0`.
- Plugin ID: `git-deck`.
- Git range: `^0.1.0`, tag prefix: `git-deck-`.
- First release tag: `git-deck-v0.1.0`.

## Validation

- Plugin typecheck, four existing integration tests and BB build pass.
- The built npm archive includes the app, server and host bundles and metadata,
  source, skill, license and documentation; tests and screenshots are excluded.
- Installed in BB under the new ID and verified with real Git and GitHub data.
- Marketplace schema/build, overview and image checks, and v1 compatibility gate
  pass in a current full-history marketplace checkout.
- Existing marketplace tests pass.
- Preparation prerequisite: the first release tag must be published and the
  marketplace source liveness check must pass before this PR is opened. No release
  or marketplace PR has been published during preparation.

## Requirements and permissions

Requires BB 0.45+, SDK 0.6.15+, Node.js 22.18+, Git and OpenSSH on a Linux/macOS
checkout host. GitHub Actions additionally requires GitHub CLI and an authenticated
GitHub account with repository access. The plugin runs trusted host commands and
can modify the selected repository through explicit Git actions. No separate
external service is required for the basic Git workflow.

Author identity, SSH overrides and the selected GitHub account use repository-local
Git config. System SSH config, keys, agent and credential helpers remain in use.
Askpass responses stay in memory; new host keys require confirmation. GitHub tokens
are read from gh on the host and are not returned to the UI. Fix it prepares an
editable request with bounded diagnostic logs; the user reviews and sends it. It
does not automatically commit, push or rerun CI.

## Marketplace materials

- `entries/git-deck.json`: Git Deck, Code & Reviews category, built-in `GitBranch` icon.
- `overview/git-deck.md`: copied verbatim from the plugin's `PLUGIN_OVERVIEW.md`.
- `screenshots/git-deck/log.png`: branch browser, commit graph and revision details.
- `screenshots/git-deck/changes.png`: file selection, commit controls and side-by-side diff.
- `screenshots/git-deck/checks.png`: real GitHub Actions run, failed job and Fix it control.

Screenshots contain only the installed plugin surface at 2× pixel density
(2640 × 1984, each below 2 MiB). Thread lists and surrounding BB navigation are
outside the capture. Local checkout paths and commit email addresses are hidden
for privacy. No network fixtures or simulated controls were used.
