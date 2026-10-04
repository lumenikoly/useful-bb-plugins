# Marketplace submission files

Prepared for the [BB Community marketplace](https://github.com/get-bb/marketplace).
Copy the contents of `entries/`, `overview/` and `screenshots/` into the matching
directories of a marketplace checkout when preparing the submission PR.

## Project Themes

- **Category:** Themes & Appearance
- **Icon:** BB's built-in `Palette` icon
- **Source:** `plugins/project-themes` in this repository
- **Release range:** `^0.1.0`, with tag prefix `project-themes-`

The source requires a public `project-themes-v0.1.0` tag before submission.
These files do not publish the plugin or create a marketplace PR.

The overview is copied from `plugins/project-themes/PLUGIN_OVERVIEW.md`.
Keep both files identical when editing the listing.

Screenshots show the installed plugin in bb, in light and dark mode, at 2× pixel
density. They contain no added artwork or simulated controls. Saved project
colors were left unchanged. Private thread content is outside the frame.

## Git Deck

- **Plugin ID / package:** `git-deck` / `bb-plugin-git-deck`.
- **Category:** Code & Reviews.
- **Icon:** BB's built-in `GitBranch` icon.
- **Source:** `plugins/git-deck` in this repository.
- **Release range:** `^0.1.0`, with tag prefix `git-deck-`.

Publish the public `git-deck-v0.1.0` tag before submitting the entry. The source
repository is public; this release tag is not created by preparing these files.
The overview is copied from `plugins/git-deck/PLUGIN_OVERVIEW.md`; keep the two files
identical. Screenshots show the installed plugin's Log, Changes and Checks with
real repository data. Private paths and email addresses are excluded from the
capture. `git-deck-submission.md` contains the proposed marketplace PR description;
it is a preparation document, not part of the marketplace payload.
