# Git для BB

<!-- impeccable:product-schema 1 -->

## Platform

Web interface inside BB; Git/OpenSSH run on the checkout's enrolled Linux/macOS host.

## Users

BB users who want to review changes and perform basic Git operations without
leaving the project/thread interface.

## Product Purpose

Provide branch browsing, graph history, checkout/tracking, create/rename/safe-delete,
merge/recovery, branch comparison, staging, commits, fetch/pull/push and repository-specific accounts using
standard Git commands. The user explicitly requested IntelliJ IDEA's Git workflow
as the reference, system SSH configuration and interactive password entry.

## Constraints

Keep the implementation simple. Use the current public BB SDK, the host-owned
diff renderer and standard Git/OpenSSH. Avoid extra tests and dependencies.
Author identity is local to the Git repository; SSH identity follows its remote
alias or local SSH command. Passwords are entered on demand and not stored by
the plugin. Rebase, cherry-pick, force operations and remote branch deletion remain in the terminal.

## Visual commitment

The user rejected the initial commit-centered panel and explicitly pinned the IntelliJ
IDEA Git Log screenshot: branch browser left, graph log center, commit inspector right.
Preserve this IDE composition in BB’s current theme. Branch selection browses history;
checkout is an explicit action. Dense desktop workflow takes priority over decorative UI.
