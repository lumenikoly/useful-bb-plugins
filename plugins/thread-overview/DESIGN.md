---
name: Thread Overview
description: A full-width thread overview consistent with BB's native panels.
colors:
  background: "var(--background)"
  foreground: "var(--foreground)"
  muted-foreground: "var(--muted-foreground)"
  border: "var(--border)"
  accent: "var(--accent)"
  ring: "var(--ring)"
  destructive: "var(--destructive)"
typography:
  body:
    fontFamily: "inherit"
    fontSize: "13px"
    lineHeight: 1.5
  section-title:
    fontFamily: "inherit"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.5
  message:
    fontFamily: "inherit"
    fontSize: "14px"
    lineHeight: 1.7
  label:
    fontFamily: "inherit"
    fontSize: "12px"
  metadata:
    fontFamily: "inherit"
    fontSize: "11px"
rounded:
  code: "4px"
  message: "8px"
  control: "6px"
spacing:
  tight: "4px"
  compact: "8px"
  standard: "12px"
  gutter: "16px"
components:
  row:
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    padding: "7px 6px"
    typography: "{typography.body}"
  row-hover:
    backgroundColor: "{colors.accent}"
  icon-button:
    rounded: "{rounded.control}"
    width: "28px"
    height: "28px"
  launcher:
    rounded: "{rounded.control}"
    padding: "4px 6px"
    typography: "{typography.label}"
---

# Design System: Thread Overview

## Overview

Mode: Operate. BB is the visual authority: the overview fills the native panel with
compact list rows, quiet section labels and thin separators. There is no nested
card, artificial maximum width, or repeated conversation title. The toolbar stays
above the scrolling body. The user-specified two-circle/two-line launcher remains.

The host owns tabs, resizing, compact drawer behavior, theme and typography.
File links, Markdown, source viewing, diff and child-thread chat use host renderers.

## Colors

All colors are live BB semantic tokens, preserving light and dark theme behavior. There is no local brand color or fixed color ramp.

### Neutral
- **Background and foreground:** the panel surface and primary row text.
- **Muted foreground:** headings, icons, counts, statuses and supporting text.
- **Border:** the container outline, section separators and transcript header divider.
- **Accent:** interactive row hover and expanded detail summaries.
- **Ring:** keyboard focus outlines.
- **Destructive:** overview loading failures and partial-source warnings.

**The Host Palette Rule.** Reuse BB semantic colors instead of freezing screenshot colors into local values.

## Typography

The host font is inherited; there is no separate display face. The narrow hierarchy keeps section labels quiet and gives filenames and agent names prominence.

### Hierarchy
- **Body:** primary row labels.
- **Section title:** regular-weight section headings.
- **Label:** counts, empty states, helper copy and agent detail metadata.
- **Metadata:** row statuses and agent execution details.

Agent detail titles use the body size with medium weight. List labels truncate on one line; detail titles and transcript content can wrap. Counts and diff statistics use tabular numerals. Keep full titles and paths available through existing tooltip behavior.

**The Quiet Heading Rule.** Keep section names muted and medium weight; do not turn them into display headings or uppercase kickers.

## Layout

The panel is a full-height flex column with a fixed toolbar of at least 44px and
one scrolling content region. Main content uses 16px gutters; sections have 16px
vertical spacing and a thin separator. Rows have 16px icons, 8px gaps, 7px 6px
padding and a 34px minimum height. Lists extend 6px into the gutter so the label
and section heading align. Each section initially shows six rows.

On viewports up to 600px, rows are at least 44px tall and gutters reduce to 12px.
Subagent detail has the same toolbar and an independently scrolling transcript.

## Elevation & Depth

There are no custom shadows. Active status icons rotate; reduced-motion disables rotation. Depth comes from outlines, separators and accent-colored interaction surfaces. Focus uses the host ring with a 2px outline and 2px offset.

**The Flat Panel Rule.** Preserve the host surface and establish hierarchy with borders and interaction states.

## Shapes

The overview has no enclosing outline or rounded container. Small controls and rows use 6px corners; user-message backgrounds use 8px and code surfaces 4px. Rows are not individual cards. The launcher icon uses two small circles on the left and two horizontal strokes on the right. Registered custom SVG icons use a 24-unit viewbox, rounded caps and joins, and a 1.5-unit stroke.

## Components

### Overview container

A compact toolbar and refresh control introduce separated sections for results, changes, subagents, background processes and sources. Loading, empty, partial-history and recoverable error messages stay inline. Successful sections remain visible when another source fails.

### Rows and disclosure

Files and websites use BB's native links. Change rows replace the overview with a native unified diff and a back control. Background details use native disclosure with wrapped, scrollable text. Interactive rows have accent hover and visible keyboard focus.

### Subagent rows and transcript

Every agent row opens an in-panel transcript. A two-line label shows a readable task name and model/reasoning when available. Service paths are humanized for display; provider task titles are preserved. A compact status icon stays on the right; text is shown only for active work or errors. Completed rows do not repeat a status word. Missing execution metadata is omitted.

The detail header contains a native-size back control, round agent glyph, task name, available execution metadata and compact status. Child BB threads use native timeline chat. Provider-only agents render messages with BB Markdown. User instructions have a muted message background. Consecutive work rows collapse into one activity group; individual actions have icons, compact previews and nested disclosure. Commands and output use BB SourceCode; file patches use BB Diff. Unavailable history has an explicit empty state.

### Buttons and navigation

The launcher combines its icon with a short label and becomes icon-only in compact viewports. Refresh is a square icon button, dimmed and disabled during loading. Expand/collapse and back controls are understated text actions. Icon-only controls retain accessible names.

## Do's and Don'ts

### Do:
- **Do** inherit BB theme tokens, host font and native content renderers.
- **Do** keep headings muted, rows compact and sections separated by thin rules.
- **Do** keep every subagent row actionable and show execution metadata only when available.
- **Do** preserve visible focus and honest loading, empty, partial-history and error states.

### Don't:
- **Don't** introduce a separate dashboard identity, decorative imagery or animation.
- **Don't** turn individual rows into cards or section headings into display typography.
- **Don't** invent model, reasoning, transcript or status data to fill visual gaps.
- **Don't** add placeholder plus menus or imply capped history is exhaustive.
