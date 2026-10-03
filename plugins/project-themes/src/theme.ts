export const PALETTE = [
  { name: "Sage", color: "#8fa58d" },
  { name: "Eucalyptus", color: "#82a9a3" },
  { name: "Blue", color: "#8ba6bf" },
  { name: "Lavender", color: "#a399bb" },
  { name: "Rose", color: "#be9aa5" },
  { name: "Sand", color: "#b9aa88" },
  { name: "Peach", color: "#c3a18a" },
  { name: "Slate", color: "#929fae" },
] as const;
export const SURFACES = [
  { id: "threads", title: "Thread rows", description: "Project rows in the thread list." },
  { id: "browser", title: "Browser tab", description: "The bb favicon and internal Browser tabs." },
  { id: "background", title: "Background", description: "A subtle tint for the workspace and sidebar." },
] as const;
export type SurfaceId = (typeof SURFACES)[number]["id"];
export type ProjectTheme = { color: string; threads: boolean; browser: boolean; background: boolean };
export type Themes = Record<string, ProjectTheme>;
export function defaultTheme(projectId = ""): ProjectTheme {
  const index = [...projectId].reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 0) % PALETTE.length;
  return { color: PALETTE[index].color, threads: true, browser: true, background: true };
}
export function tint(color: string, base: string, amount: number): string {
  return `color-mix(in oklab, ${color} ${amount}%, ${base})`;
}
/** Values from the server are validated again before entering CSS selectors. */
export function themeCss(themes: Themes, projectId: string | null): string {
  const rules: string[] = [];
  const validColor = (color: string) => /^#[0-9a-f]{6}$/i.test(color);
  for (const [id, theme] of Object.entries(themes)) {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id) || !theme.threads || !validColor(theme.color)) continue;
    const row = `.group\\/thread-row:has(a[data-sidebar-thread-id][href^="/projects/${id}/threads/"])`;
    rules.push(`${row} { background-color: ${tint(theme.color, "var(--sidebar)", 12)} !important; }`);
    rules.push(`${row}:hover, ${row}:focus-within { background-color: ${tint(theme.color, "var(--sidebar-accent)", 22)} !important; }`);
    rules.push(`${row}.bb-sidebar-selected-row { background: ${tint(theme.color, "var(--sidebar-accent)", 32)} !important; }`);
  }
  const current = projectId ? themes[projectId] : undefined;
  if (current?.background && validColor(current.color)) {
    const background = tint(current.color, "var(--canvas)", 7);
    rules.push(`html:root { --background: ${background} !important; --card: ${background} !important; --sidebar: ${tint(current.color, "color-mix(in oklab, var(--ink) 3%, var(--canvas))", 7)} !important; }`);
  }
  if (current?.browser && validColor(current.color)) {
    const tab = '[data-testid="secondary-panel-tab-strip"] .group\\/tab-pill:has([data-icon="Globe"])';
    rules.push(`${tab} { background: ${tint(current.color, "var(--sidebar)", 18)} !important; }`);
    rules.push(`${tab}:has(button[aria-pressed="true"]), ${tab}:hover { background: ${tint(current.color, "var(--sidebar-accent)", 30)} !important; }`);
  }
  return rules.join("\n");
}
