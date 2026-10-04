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

BB's native Git tool window follows the user-pinned IntelliJ IDEA Git Log reference: a branch browser, an actual parent graph and a revision inspector. The dense, flat workspace inherits BB's theme and font, using restrained blue selection and small colored graph lanes to organize repository history. Log, Changes and Checks are separate tabs. Checks extends this tool window with a compact workflow-run browser and diagnostics pane; Account remains accessible through the toolbar gear.

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

Project and checkout selectors, a wrapping network toolbar and the Log / Changes / Checks tab strip precede the workspace. The desktop Log grid is `minmax(190px, 21%) minmax(280px, 1fr) minmax(220px, 26%)`: branch browser left, graph log middle, changed files and commit details right. Each pane scrolls independently. The branch-pane toggle gives the log more room. Selecting a revision file opens the host Diff renderer in a lower panel (42% height, minimum 180px).

Log responsiveness follows the tool window's container width. At (1050px), pane widths tighten and author columns disappear. At (780px), branches occupy a (190px) left column and the revision inspector moves below the log; inspector files and details sit side by side. At (520px), the branch column narrows to (160px), branch-row actions sit below the full-width name, date columns and reference badges hide, and inspector files and details stack. The branch toggle remains available.

Changes retains its own files/commit and Diff split: `minmax(230px, 30%) minmax(0, 1fr)`. Viewport media queries tighten that split at (760px) and stack it at (520px). Account content scrolls and caps at (650px). Compact spacing repeats around controls and dividers; log rows are (32px) high.

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

The top-level tab strip uses an active blue underline, explicit labels and arrow/Home/End keyboard navigation. The branch tree groups favorites, local branches and remotes; selected rows receive a soft blue fill. Branch rows reveal compact create, safe local delete and overflow buttons on hover, keyboard focus or selection. On narrow panels these actions sit below the name to keep it readable. Favorites use a gold branch symbol and are toggled in the row menu. Row menus use native top-layer popovers, support arrow/Home/End navigation and Escape, and close on outside click or branch-list scroll. They do not clip inside the branch pane. The duplicate action strip above the log appears only while the branch pane is hidden. Branch controls use authored SVG shapes and accessible button labels.

**The Browse Before Checkout Rule.** Selecting a branch changes the history being browsed; checkout remains a separately labeled action.

### Graph log and revision inspector

Commit rows align subject/graph, author and date in a dense grid. Small bordered reference badges accompany subjects on wider panels. Actual parent hashes determine lane connections, spaced (16px) apart; selected rows use a restrained blue fill. Revision files show status, filename and secondary path, followed by commit message, author, hash and metadata. The host Diff renderer serves revision and working-copy inspection.

**The Parent Graph Rule.** Draw graph connections from commit parent hashes; when text filtering hides intervening commits, show dots without connecting lines.

### Checks and fix handoff

Workflow rows remain flat, full-width and border-separated. Selected runs reuse the muted blue log selection; workflow names lead, secondary titles truncate, and hashes/dates use compact metadata. Text and SVG status cues accompany failures in the host error color; successful and pending states retain host foreground. The detail pane exposes jobs, failed steps and explicit View logs / Fix it actions. Logs use wrapping monospace text on a muted surface, with bounded scrolling.

Fix it prepares a reviewable request. In a matching thread, the user can add it to the existing composer or open a new chat. New-chat navigation uses BB's main composer and seeds the project and managed-worktree selection through public `setSelection`. The failed branch supplies context; the agent checks the exact checkout commit before applying a fix. A small bare banner shows branch/hash and selection progress or errors. The user reviews the workspace and sends manually; branch mismatch and older-run notices remain visible beside diagnostics.

### Dialogs and operation feedback

Branch actions and Git/SSH prompts share native modal styling and explicit labels. New branch offers HEAD and grouped local/remote sources; opening from a row preselects that branch, while opening from a commit preserves its revision. Delete confirmation focuses Cancel and uses Git's merged-history check; checked-out branches are protected. Credential prompts use password inputs where required. Operation output stays in a compact bottom strip; merge recovery uses a muted amber banner and labeled actions.

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

Fetch, Pull, Push and refresh use the shared 15px SVG family in 30px buttons,
with native tooltips and accessible names. A divider separates the Account/SSH
gear; its pressed state marks the settings view. Log, Changes and Checks remain
in the tab strip. At narrow widths the upstream text hides; full tracking
information remains in the branch browser footer.
