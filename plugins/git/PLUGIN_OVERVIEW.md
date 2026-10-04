## Git alongside your code

An IntelliJ IDEA inspired Git tool window in BB: a branch browser, commit graph,
commit details and file diffs. The Changes view provides staging, commit messages
and side-by-side or unified diffs. Open it as a dedicated page or a thread panel.

### Features

- Project and checkout selection, including the current thread’s environment and remote hosts.
- Stage selected files and unstage them while preserving the working tree.
- Standard Git commits with hooks and signing settings.
- Search and favorite local and remote branches; filter the log by branch.
- Checkout, create from a branch or commit, tracking, rename and safe deletion.
- Merge with conflict recovery or abort, and compare a branch with HEAD.
- Commit graph, search loaded history, inspect files and view commit diffs.
- Fetch, regular Push and fast-forward-only Pull.
- Per-repository author identity and SSH settings.
- On-demand SSH passwords, passphrases and HTTPS credentials.
- GitHub Actions runs, failed jobs and step logs through GitHub CLI (`gh`).
- Fix it prepares a diagnostic request in BB’s native composer; you choose the agent and send it.
- Per-repository GitHub accounts without changing gh’s globally active account.

### System Git and SSH

Commands run on the checkout’s host using its Git config, `~/.ssh/config`,
SSH aliases, keys, ssh-agent and credential helpers. Project settings use
`git config --local`; the global config is unchanged. The plugin keeps askpass
responses in memory and requires explicit confirmation of new SSH host keys.

Requires BB 0.45+, SDK 0.6.15+, Node.js 22.18+, Git and OpenSSH. This version
supports Linux/macOS. Resolve conflicts in your editor and stage the files;
use a regular Git terminal for advanced operations.

### GitHub Checks

Install GitHub CLI on the checkout’s host and sign in with `gh auth login`.
Open **Checks** to see the latest 30 workflow runs for the current branch.
The toolbar’s remote selector also chooses the repository used by Checks.
Use **Account and SSH → GitHub account** to select a stored gh account for this
repository. The selection is saved in local Git config (`bb.githubAccount`);
the token remains in gh’s credential storage. SSH aliases resolve through the
system SSH config, and GitHub Enterprise hosts use their own gh login.

**View logs** reads failed-step output. **Fix it** prepares an editable request
with the run, attempt, job, failed commit, current commit and bounded logs.
It opens the native BB composer with a worktree based on the current branch.
In a thread panel, **Add to current chat** is also available when that chat uses
the selected checkout; it appends the request without sending it.

Fix requests require the current branch to contain the failed commit. Earlier
runs include both revisions and instruct the agent to verify the failure still
applies. Changed checkouts and rerun attempts require refreshing the checks.
The plugin doesn’t commit, push or rerun workflows through Fix it. This first
version shows GitHub Actions runs; third-party CI checks are not included.
