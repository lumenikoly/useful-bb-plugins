# Project Themes design

Extends bb's existing settings UI in Operate mode. The primary task is to select
a project, choose a color, toggle surfaces, and save. No extra navigation page.

Uses bb fonts and semantic CSS tokens: foreground, background, muted-foreground,
border, input, ring, and sidebar. One project-wide palette with eight swatches
and a native color input precedes three rows, each with a label, description,
and switch. The preview and Save/Reset buttons complete the form.

Accent palette: Sage #8fa58d, Eucalyptus #82a9a3, Blue #8ba6bf, Lavender #a399bb,
Rose #be9aa5, Sand #b9aa88, Peach #c3a18a, Slate #929fae. These are user accents,
not replacements for settings UI tokens. Background: 7% color over the theme
canvas. Rows: 12%, hover 22%, selected 32%. Browser tabs: 18%, active 30%.
The favicon uses the selected color.

All surfaces are enabled by default. The initial shared color is selected
from the palette using the project ID. Edits stay in the preview until saved.
Controls have labels; swatches use aria-pressed, switches role=switch,
status messages role=status, and errors role=alert. Focus uses the ring token.
Switch motion respects prefers-reduced-motion.

Swatches and the custom picker wrap on narrow screens. Text colors follow
the current theme; project colors are applied to surfaces. All plugin copy,
including accessible labels and status messages, is in English.
