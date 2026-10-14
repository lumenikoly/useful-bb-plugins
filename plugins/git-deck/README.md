# Git Deck for BB

Browse branches and history, review diffs, commit changes and sync repositories
inside BB. Git Deck follows the IntelliJ IDEA Git tool window layout: branches
on the left, a commit graph in the center, and revision details on the right.
Open **Git Deck** from the navigation or the panel’s new-tab menu, including
in an empty chat before creating a thread. The new-chat panel follows the
project selected in the composer.

## Requirements

- BB 0.45+, Plugin SDK 0.6.15+ and Node.js 22.18+.
- Git and OpenSSH on the selected checkout's host.
- Linux or macOS; interactive askpass uses a Unix socket and `/bin/sh`.
- Optional: GitHub CLI (`gh`) on that host, authenticated with `gh auth login`,
  for GitHub Actions checks and fix requests. Basic Git operations work without it.

## Installation

From a local checkout of this collection:

```sh
npm ci
npm run build --workspace=bb-plugin-git-deck
bb plugin install path:. --plugin git-deck
```

After the public `git-deck-v0.1.0` release tag is published:

```sh
bb plugin install git:https://github.com/lumenikoly/useful-bb-plugins.git@^0.1.0 --plugin git-deck --tag-prefix git-deck-
```

Package: `bb-plugin-git-deck`. Plugin ID: `git-deck`. Releases use the
`git-deck-` tag prefix.

## Branches and history

**Log** opens first. Browse local and remote branches, search branch names
and star favorites. Selecting a branch filters its history; **Checkout** is an
explicit action.

- Use **Branches +**, the row’s **+**, or **… → Create branch from here**; choose HEAD, a local branch,
  or a remote branch in **New branch → Create from**. A selected commit is also
  available when opening the dialog from commit details.
- Check out a remote branch by creating a local tracking branch.
- Delete a local branch using its **…** menu and confirmation dialog.
  Git protects unmerged commits; current branches and branches checked out in
  another worktree cannot be deleted. The row's **…** menu includes Checkout,
  Rename, Merge, Compare and Favorites.
- Merge the selected branch into the current branch; a clean checkout is required.
- Compare branch tips with **Compare with HEAD** and inspect changed files.

Branches checked out in another worktree cannot be checked out here. Resolve
merge conflicts in your editor, stage the resolved files, then choose **Complete
merge**, or use **Abort merge**.

The graph follows actual commit parents. Squash and rebase merges do not create
a merge edge. History loads 100 commits at a time, up to 1,000. Message, author
and hash search, plus the Author filter, cover loaded history; graph lines are hidden while filtering
so omitted commits cannot create false connections. A merge commit's file diff
compares it with its first parent. On narrow panels, revision details move below
the log; the pane icon hides the branch browser. Commit subjects lead each row,
with branch references underneath. Remotes start collapsed.

The commit summary appears above its files. Filter files by path (including the
original path of renames), or use the **List / Tree** segmented control. **Tree**
is the default; your choice is remembered across sessions. Subjects are capped
at two lines with their full text in a tooltip.
Selecting a file opens a full-height diff with the file list alongside it; use
the back button to return to history. File filtering and the view mode carry
across both views. **Commit …** holds View full message, Create branch and Copy hash.

The compact toolbar combines project, current branch and sync controls.
Choose the checkout, remote and Account/SSH under **Repository …**. **Set upstream** pushes
the current branch to the selected remote and establishes tracking. Successful
operation notifications disappear after five seconds; failures remain until
dismissed. The latest operation’s full output stays available under
**Repository … → Activity / Git output**.

## Changes, commits and sync

Select a project and checkout; a thread panel starts with its own environment.
Open **Changes** and use a file’s **+** to stage it. **Staged** shows the index;
its **−** removes a file from the index. Filenames lead each row, with their
directory underneath. **Select files** enables checkboxes explicitly for bulk
operations. Empty Staged stays compact and the commit composer stays below the
scrolling file lists.

Select a file for a side-by-side or unified diff. Its heading states **Working
tree vs Index** or **Index vs HEAD**. For regular text changes, each block offers
**Stage hunk** or **Unstage hunk**. **Select lines** exposes a unified selection
view; choose additions/deletions and apply only the selected lines. Partial
operations update only the index, so a file can appear in both lists. The host
checks the exact diff again before applying it; stale selections fail without
applying a patch. Binary files, renames, conflicts, submodules and file-mode
changes use whole-file staging.

Use **File … → Discard changes…**, or the bulk-selection overflow menu. A confirmation
lists exactly which files will be restored or deleted, with Cancel focused.
In **Changes**, discard restores the working copy from the index and keeps staged
edits. In **Staged**, it restores the selected files and index to the last commit,
including unstaged edits to those files. New files are deleted; in a repository
without commits, discarding staged additions also deletes them. Renames restore
the original path unless another changed file occupies it. Unselected files are
preserved. Open a submodule's checkout to discard its changes.

**Commit** includes the entire current index, including changes staged in a
terminal or another IDE. Git hooks and commit signing run through system Git;
GPG and pinentry remain system-managed.

**Generate & Commit All** uses BB's built-in commit action: generate a message
with the service selected in **Settings → AI services → Commit message**, stage
all changed files (including unstaged and new files), and commit immediately.
There is no message review step. If AI is disabled or generation fails, BB uses
`bb: automated commit`. This action requires a ready BB environment for the
selected checkout; main checkouts work when a BB chat uses that same path.
The button is disabled during another operation or a merge. The generated
subject and commit hash appear in the operation output after success.

The toolbar provides Fetch, Pull, Push and Refresh. **Repository …** opens Account and SSH.
Fetch uses the selected remote. Fetch and Pull prune stale remote-tracking
branches using Git's standard `--prune` behavior. Pull is fast-forward-only and
follows the current upstream. Push preserves an upstream destination on the selected remote; without
one, it sets upstream for the current branch. Force push, rebase, cherry-pick and
remote branch deletion remain available through your Git terminal.

## Per-project accounts and SSH

Open **Account and SSH** to set the commit author's name and email. Settings use
local Git configuration and are shared across worktrees of the same repository.
Empty fields remove local overrides and restore inherited settings, including
`includeIf`. The global Git configuration remains unchanged.

Commit authorship and SSH authentication are separate. Use the checkout host's
standard SSH config, keys, ssh-agent and credential helpers. For example:

```sshconfig
Host github-work
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_work
  IdentitiesOnly yes

Host github-personal
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_personal
  IdentitiesOnly yes
```

Use `git@github-work:team/repo.git` for a work repository and
`git@github-personal:me/repo.git` for a personal repository. Leave **SSH command**
empty to inherit system settings, or supply a local `core.sshCommand`, such as
`ssh -i ~/.ssh/id_work -o IdentitiesOnly=yes`. Existing `GIT_SSH_COMMAND` and
`GIT_SSH` environment settings follow Git's normal precedence.

An HTTPS remote uses HTTPS credentials even when an SSH command is configured.
The URL form changes the fetch URL. A separate push URL is shown and preserved;
change it in a terminal with `git remote set-url --push <remote> <url>`.

Passwords, key passphrases, HTTPS credentials and new SSH host-key confirmations
appear in BB dialogs when requested. Unknown host keys require your confirmation.
OpenSSH `BatchMode yes` disables interactive password requests for that host.
The plugin keeps askpass responses in memory and does not save them to files,
settings or logs; a system credential helper may store HTTPS credentials under
its own rules. Use a protected connection when accessing BB remotely.

## GitHub Actions and Fix it

Open **Checks** to browse the latest 30 workflow runs for the current branch.
The toolbar's remote selector chooses the GitHub repository. Inspect failed jobs,
steps and logs, then use **Fix it** to prepare an editable diagnostic request in
BB's native composer. The project and worktree selection are seeded; review the
workspace and agent before sending. In a thread panel, **Add to current chat**
appends the request when the chat uses the selected checkout, without sending it.

Choose a stored GitHub CLI account under **Account and SSH → GitHub account**.
The selection uses local `bb.gitDeckAccount` configuration; the plugin obtains
that account's token from gh for each command without changing gh's active
account. Tokens are not sent to the UI. GitHub API authentication is separate
from SSH push credentials. System SSH aliases and authenticated GitHub
Enterprise hosts are supported.

Fix requests include the run attempt, failed and current commits, jobs and a
bounded log tail (96,000 characters). The current branch must contain the failed
commit. The agent is instructed to check its checkout and determine whether an
older failure still applies. Refresh after switching checkouts or rerunning a
workflow. **Fix it** does not automatically send a message, commit, push or rerun
CI. This version supports GitHub Actions; third-party CI checks are not included.

## Operation limits

Commands run on the checkout's enrolled host. Operations on one repository,
including its worktrees, are serialized and can be cancelled. Cancellation does
not undo an already completed commit or push. Git operations have a ten-minute
timeout and a 4 MiB output limit; the UI retains a 256 KiB tail. Jobs live in host
worker memory and stop on restart or disconnection. Check Git status before retrying.

## Development

```sh
npm run dev:git-deck
npm run typecheck --workspace=bb-plugin-git-deck
npm test --workspace=bb-plugin-git-deck
npm run build --workspace=bb-plugin-git-deck
```

Six integration tests cover Git workflows, selected-file rollback and staged
preservation, per-repository settings, encrypted OpenSSH keys and interactive
askpass, tracking branches and merge recovery, GitHub account scoping, bounded
logs and revision guards, plus BB's native automatic commit integration. Release instructions:
[docs/RELEASING.md](../../docs/RELEASING.md).

[MIT license](LICENSE).
