---
name: thread-overview
description: Explain or troubleshoot the Thread Overview plugin's right-side panel in bb.
---

Open Overview (Обзор) in an existing thread header or in the right panel's new-tab menu.
The plugin has no CLI commands or settings. It reads public SDK data, polls every
10 seconds while visible, and offers a manual refresh. It never sends messages or
modifies files. Results cover thread storage and provider-published images; sources
cover attachments and recent reads/searches. Processes require provider backgroundTask
reporting. History and storage queries are bounded; the panel indicates partial history.
Inspect plugin status/logs for loading issues; see README.md for precise limits.
