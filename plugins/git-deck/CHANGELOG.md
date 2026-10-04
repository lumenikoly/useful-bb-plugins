# Changelog

## 0.1.0

Initial release as **Git Deck**. Plugin ID: `git-deck`.

- Dedicated page and thread panel with a branch browser, commit graph and revision inspector.
- Local and remote branches, search, favorites, tracking checkout, branch creation, rename and safe local deletion.
- Compact branch-row actions and a source-branch selector in the creation dialog.
- Branch menus support keyboard navigation; narrow panels preserve branch names,
  and reselecting a branch preserves its commit details.
- Merge, conflict recovery and abort, branch-tip comparisons, and commit file diffs.
- File selection, staging, unstaging, commits, and side-by-side or unified diffs.
- Fetch and fast-forward-only Pull prune stale remote-tracking branches; regular Push uses standard Git commands.
- Repository-specific author identity and SSH command settings, system SSH aliases, keys, agent and credential helpers.
- Interactive passwords, passphrases and SSH host-key confirmation; guidance for HTTPS remotes.
- GitHub Actions runs, jobs, failed steps and logs through GitHub CLI.
- Editable Fix it requests in BB's native composer, with repository-scoped GitHub accounts and revision/attempt checks.
- Compact icon toolbar, English UI, responsive panes and paginated history.
- Report operations as complete after releasing the repository lock, so consecutive actions can start reliably.
- Open Git Deck from the new-chat panel before creating a thread, following the composer’s selected project.
