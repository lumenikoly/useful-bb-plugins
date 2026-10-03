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

### System Git and SSH

Commands run on the checkout’s host using its Git config, `~/.ssh/config`,
SSH aliases, keys, ssh-agent and credential helpers. Project settings use
`git config --local`; the global config is unchanged. The plugin keeps askpass
responses in memory and requires explicit confirmation of new SSH host keys.

Requires BB 0.45+, SDK 0.6.15+, Node.js 22.18+, Git and OpenSSH. This version
supports Linux/macOS. Resolve conflicts in your editor and stage the files;
use a regular Git terminal for advanced operations.
