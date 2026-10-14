---
name: Git Deck
description: Native BB Git tool window with an IntelliJ IDEA Git Log composition.
colors:
  log-selection: "color-mix(in srgb, #578bea 17%, var(--background))"
  branch-selection: "color-mix(in srgb, #578bea 19%, var(--background))"
  primary: "var(--primary)"
  primary-foreground: "var(--primary-foreground)"
  background: "var(--background)"
  foreground: "var(--foreground)"
  muted-foreground: "var(--muted-foreground)"
  border: "var(--border)"
  input: "var(--input)"
  selection: "var(--accent)"
  hover: "var(--state-hover, var(--muted))"
  focus: "var(--ring)"
  error: "var(--destructive-text, var(--destructive))"
typography:
  body:
    fontFamily: inherit
    fontSize: "12px"
  label:
    fontFamily: inherit
    fontSize: "11px"
  metadata:
    fontFamily: inherit
    fontSize: "10px"
  code:
    fontFamily: monospace
rounded:
  tree-row: "4px"
  control: "5px"
spacing:
  compact: "6px"
  control: "8px"
  section: "12px"
  inset: "16px"
components:
  button:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    padding: "4px 10px"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.control}"
    padding: "4px 10px"
  input:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    padding: "8px 10px"
---

# Design System: Git Deck

## Overview

**Creative North Star: "BB's native Git workspace"**

BB's native Git tool window follows the user-pinned IntelliJ IDEA Git Log reference: a branch browser, an actual parent graph and a revision inspector. The dense, flat workspace inherits BB's theme and font, using restrained blue selection and small colored graph lanes to organize repository history. Log, Changes and Checks are separate tabs. Checks extends this tool window with a compact workflow-run browser and diagnostics pane; Account and remote selection live in the repository overflow menu.

**Key Characteristics:**

- Host-themed surfaces, compact controls and bordered panes.
- Branch browsing, graph history and revision details share one desktop view.
- Responsive lower inspector, optional branch pane and authored SVG controls.

## Colors

### Primary

The host primary pair identifies commit and save actions. Muted blue mixtures distinguish selected branches, commits and revision files without turning whole panes into accents. The active tab has a blue underline. Changes-tab file selection retains the host accent.

### Secondary

Graph lanes cycle through violet, green, amber, pink and cyan. These distinguish paths, not branch status. Revision file status adds green for added, blue for modified and red for deleted. Favorites have a restrained gold cue.

### Neutral

BB background, foreground, muted foreground, border and input values remain live CSS references. The branch pane and log column header blend a small amount of the host muted surface into the background.

**The Host Surface Rule.** Resolve surfaces, text, borders and focus from BB tokens; reserve fixed colors for restrained selection, graph lanes and Git status cues.

## Typography

The host font is inherited throughout this utility interface. The compact body is (12px); supporting file labels are (11px), and author/date metadata is (10px). Pane headings use restrained semibold weight. Account headings are (14px); dialog headings are (16px). There is no display type role. Counts and dates use tabular numerals; hashes, file-status letters, commands and output use monospace. Long names truncate in rows while commit details wrap.

## Layout

A single compact toolbar combines the project selector, current branch, upstream and sync controls; the Log / Changes / Checks tab strip is the second row. The desktop Log grid is `minmax(190px, 21%) minmax(280px, 1fr) minmax(220px, 26%)`: branch browser left, graph log middle, a compact commit summary above changed files right. Each pane scrolls independently. The branch-pane toggle gives the log more room. Selecting a revision file replaces the history workspace with files left and the host Diff renderer right, using its full height. A back button names the selected commit. File search and List/Tree state persist between modes.

Log responsiveness follows the tool window’s container width. At (1050px), pane widths tighten and author columns disappear. At (780px), branches occupy a (160px) left column and the revision inspector moves below the log; summary and files remain vertically arranged. At (520px), the branch column narrows to (140px) and date columns hide. Search and branch filtering stay available. The toolbar wraps the project selector into its own row below (780px). The diff keeps files and content side by side, with a (135px) file column below (520px).

Changes retains its own files/commit and Diff split: `minmax(230px, 30%) minmax(0, 1fr)`. Nonempty Changes and Stage groups share the available height and scroll independently; empty groups stay compact, with the commit form anchored below. Viewport media queries tighten that split at (760px) and stack it at (520px). Account content scrolls and caps at (650px). Compact spacing repeats around controls and dividers; log rows are (46px) high to accommodate references below subjects.

Branch-action and credential dialogs share a centered native modal, capped at (460px), with (16px) viewport margins and internal scrolling. Toolbar and dialog actions wrap.

Checks uses a two-pane grid, `minmax(230px, 34%) minmax(0, 1fr)`: recent workflow runs left and selected-run diagnostics right, each scrolling independently. At container width (780px), the run column tightens to `minmax(170px, 32%)` and row status moves below the workflow name. At (520px), the panes stack, the run list caps at (220px), and the detail joins the shared scroll flow.

## Elevation & Depth

Workspace panes are flat, divided by one-pixel host borders and slight tonal differences. The branch overflow menu uses a modest floating shadow; native dialogs use a stronger shadow and dark backdrop. These are the only recorded elevation roles. State changes are immediate; no custom animation system is established.

## Shapes

Controls use modest corners, branch rows slightly tighter corners, and reference badges tighter still. Log rows and tab underlines remain straight. Dialogs use (8px) corners. Authored SVG icons use a (20 × 20) viewBox, round stroke caps and joins, and a (1.5) stroke width; standard placement is (15px), shrinking to (10px) inside reference badges. SDK icons remain on the global branch indicator and empty Diff state.

## Components

### Controls and fields

Native compact buttons use host colors, hover treatment and disabled opacity (0.5). Toolbar and branch-action buttons remove visible borders. Primary commit/save actions use the host primary pair and hover opacity (0.9). Inputs retain host borders; search fields compress their padding and height for the pane toolbar. Keyboard focus uses a host-ring outline (2px) with offset (2px).

### Navigation and branch browser

The top-level tab strip uses an active blue underline, explicit labels, 10px horizontal hover padding and arrow/Home/End keyboard navigation. The branch tree groups favorites, local branches and remotes; selected rows receive a soft blue fill. Branch rows reveal create (+) and overflow buttons on hover, keyboard focus or selection. Safe delete, checkout and other actions live in that menu. Current branches alone receive an accent icon; other branch and favorite icons remain neutral. Remote groups start collapsed and open when searching. Row menus use native top-layer popovers, support arrow/Home/End navigation and Escape, and close on outside click or branch-list scroll. They do not clip inside the branch pane. The duplicate action strip above the log appears only while the branch pane is hidden. Branch controls use authored SVG shapes and accessible button labels.

**The Browse Before Checkout Rule.** Selecting a branch changes the history being browsed; checkout remains a separately labeled action.

### Graph log and revision inspector

Commit rows align subject/graph, author and date in a dense grid. Subjects lead each row; neutral branch references occupy a secondary line. Actual parent hashes determine lane connections, spaced (16px) apart; selected rows use a restrained blue fill. A compact commit summary leads the inspector, with hash, author, date and parent. Subjects clamp to two lines with a full-text tooltip; full messages open from the overflow menu; branch creation and Copy hash live in its overflow menu. Files occupy the remaining space, with search and a bordered List/Tree segment; Tree is the default and the choice persists; rows show status, filename and secondary path. The host Diff renderer serves revision and working-copy inspection.

**The Parent Graph Rule.** Draw graph connections from commit parent hashes; when text filtering hides intervening commits, show dots without connecting lines.

### Checks and fix handoff

Workflow rows remain flat, full-width and border-separated. Selected runs reuse the muted blue log selection; workflow names lead, secondary titles truncate, and hashes/dates use compact metadata. Text and SVG status cues accompany failures in the host error color; successful and pending states retain host foreground. The detail pane exposes jobs, failed steps and explicit View logs / Fix it actions. Logs use wrapping monospace text on a muted surface, with bounded scrolling.

Fix it prepares a reviewable request. In a matching thread, the user can add it to the existing composer or open a new chat. New-chat navigation uses BB's main composer and seeds the project and managed-worktree selection through public `setSelection`. The failed branch supplies context; the agent checks the exact checkout commit before applying a fix. A small bare banner shows branch/hash and selection progress or errors. The user reviews the workspace and sends manually; branch mismatch and older-run notices remain visible beside diagnostics.

### Dialogs and operation feedback

Changes keeps manual index commits and adds a full-width secondary **Generate &
Commit All** button below the commit footer. Its label states the all-files scope;
the tooltip explains new and unstaged files. BB supplies generation and commit
behavior. Controls disable while it runs, a temporary notification shows progress, and
success exposes the generated subject and hash. Unsupported checkouts show a
disabled button with guidance to select a checkout associated with a BB chat.

Changes file rows lead with filename and a secondary directory. A visible + stages
an unstaged file; − unstages an indexed file. Checkboxes appear only in the
explicit Select files mode, labeled as bulk selection. Discard lives in row and
bulk overflow menus. Empty Staged says No staged changes and stays compact; the
composer stays below the independently scrolling groups.

Working diff headings explicitly label Working tree vs Index or Index vs HEAD.
Each supported text hunk uses the host Diff renderer with a compact Stage hunk /
Unstage hunk action. Select lines switches that hunk to a unified checkbox view
with an explicit apply-selection button. Selection is separate from Git status.
The host rebuilds patches from the fresh diff and selected line IDs, rejecting
stale views; it applies patches only to the index.

Discard retains its native modal: Cancel receives initial focus, single-file
confirmation names the file, and the exact list shows Restore/Delete. Copy
explains whether staged edits are kept or rolled back. New-file deletion is
explicit; long paths wrap and the list scrolls within the modal.

Branch actions and Git/SSH prompts share native modal styling and explicit labels. New branch offers HEAD and grouped local/remote sources; opening from a row preselects that branch, while opening from a commit preserves its revision. Branch dialogs stay pending until the Git job completes; errors retain the input and appear inside the dialog. Delete confirmation focuses Cancel and uses Git's merged-history check; checked-out branches are protected even with force. An unmerged-branch refusal exposes Force delete…; that opens a separate confirmation with Cancel focused and an explicit Delete branch anyway action in the host error color. The confirmation explains that only the local ref is deleted and commits reachable only through it may become unavailable. Credential prompts use password inputs where required. Success notifications overlay the workspace and disappear after five seconds; failures persist until dismissed. Full output for the latest operation opens only on request from the repository overflow menu; merge recovery uses a muted amber banner and labeled actions.

## Do's and Don'ts

### Do:

- Do inherit BB surface tokens, font and visible keyboard focus.
- Do keep branch browsing, commit selection and explicit checkout distinct.
- Do preserve the native host Diff renderer and expose pane controls at narrow widths.
- Do use the authored SVG icon family for branch, favorite, pane and overflow controls.

### Don't:

- Don't turn the Git Log into a commit form or a card dashboard.
- Don't invent graph connections between filtered commits.
- Don't freeze the host surface palette or introduce a display font into this native tool.

## Compact toolbar

The project selector, the current branch and upstream status share one
row with incoming/outgoing counts and Fetch, Pull, Push, Refresh and overflow.
Checkout and remote selection and Account/SSH live in the overflow menu. Missing upstream is
an explicit Set upstream action whose tooltip explains that it pushes the branch.
Log, Changes and Checks remain directly beneath the toolbar. Context selectors
wrap on narrow panels; the upstream action remains accessible.
