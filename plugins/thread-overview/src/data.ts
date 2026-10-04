import type { PluginBrowserBbSdk, ExperimentalLiveFileTarget } from "@get-bb/plugin-sdk/app";

type Timeline = Awaited<ReturnType<PluginBrowserBbSdk["threads"]["timeline"]>>;
export type Row = Timeline["rows"][number];
type Events = Awaited<ReturnType<PluginBrowserBbSdk["threads"]["events"]["list"]>>;
export type Entry = { id: string; label: string; icon: string; target?: ExperimentalLiveFileTarget; url?: string; detail?: string; status?: string; threadId?: string; history?: Row[]; model?: string; reasoning?: string };
export const basename = (path: string) => path.split(/[\\/]/).pop() || path;
export const isImage = (path: string) => /\.(png|jpe?g|webp|gif|avif|svg)$/i.test(path);
export function fileTarget(path: string, threadId: string, storageRoot: string, environmentId: string | null): ExperimentalLiveFileTarget | undefined {
  if (storageRoot && path.startsWith(`${storageRoot}/`)) return { kind: "thread-storage", threadId, path: path.slice(storageRoot.length + 1) };
  return environmentId ? { kind: "workspace", environmentId, path } : undefined;
}
export function timelineEntries(rows: Row[], threadId: string, root: string, environmentId: string | null) {
  const results = new Map<string, Entry>(), sources = new Map<string, Entry>(), agents = new Map<string, Entry>();
  const execution = new Map<string, { model?: string; reasoning?: string }>();
  function collectExecution(row: Row) {
    if (row.kind === "turn") { row.children?.forEach(collectExecution); return; }
    if (row.kind !== "work" || row.workKind !== "tool" || !row.toolArgs) return;
    const args = row.toolArgs;
    const model = typeof args.model === "string" ? args.model : undefined;
    const level = args.reasoning_effort ?? args.reasoningLevel ?? args.reasoning_level;
    execution.set(row.callId, { model, reasoning: typeof level === "string" ? level : undefined });
  }
  rows.forEach(collectExecution);
  function visit(row: Row) {
    if (row.kind === "turn") { row.children?.forEach(visit); return; }
    if (row.kind !== "work") return;
    if (row.workKind === "delegation") {
      agents.set(row.childRef || row.callId, { id: row.childRef || row.callId, label: row.description || row.subagentType || row.toolName, icon: "UserRound", status: row.status, detail: row.output, history: row.childRows, ...execution.get(row.callId) });
      return; // A child's sources and artifacts belong to its own overview.
    }
    if (row.status !== "completed") return;
    if (row.workKind === "image-generation" && row.path) results.set(row.path, { id: row.path, label: basename(row.path), icon: "overview-image", target: fileTarget(row.path, threadId, root, environmentId) });
    if (row.workKind === "file-read") sources.set(row.path, { id: row.path, label: basename(row.path), icon: "FileText", target: fileTarget(row.path, threadId, root, environmentId) });
    if (row.workKind === "web-fetch") {
      try { const url = new URL(row.url); if (/^https?:$/.test(url.protocol)) sources.set(url.href, { id: url.href, label: url.hostname + (url.pathname === "/" ? "" : url.pathname), icon: "Globe", url: url.href }); } catch { /* Invalid provider URL is not a link. */ }
    }
    if (row.workKind === "web-search") sources.set("web-search", { id: "web-search", label: "Поиск в интернете", icon: "Globe", detail: row.queries.join("\n") });
  }
  rows.forEach(visit);
  return { results: [...results.values()], sources: [...sources.values()], agents: [...agents.values()] };
}
export function backgroundEntries(events: Events): Entry[] {
  const tasks = new Map<string, Entry>();
  for (const event of [...events].sort((a, b) => a.seq - b.seq)) {
    if (event.type !== "item/started" && event.type !== "item/completed" && event.type !== "item/backgroundTask/progress" && event.type !== "item/backgroundTask/completed") continue;
    const item = event.data.item;
    if (item.type !== "backgroundTask") continue;
    tasks.set(item.id, { id: item.id, label: item.description, icon: "Terminal", status: item.taskStatus, detail: item.error || item.summary || item.description });
  }
  return [...tasks.values()].filter((task) => ["running", "pending", "paused"].includes(task.status!));
}
export function mergeEntries(...groups: Entry[][]) {
  const entries = new Map<string, Entry>();
  for (const entry of groups.flat()) {
    const key = entry.target ? JSON.stringify(entry.target) : entry.url || entry.id;
    entries.set(key, entry);
  }
  return [...entries.values()];
}
export const statusLabel = (status?: string) => ({ running: "Работает", active: "Работает", starting: "Запуск", stopping: "Остановка", pending: "Ожидание", paused: "Пауза", completed: "Завершено", idle: "Завершён", error: "Ошибка", failed: "Ошибка", interrupted: "Прерван" }[status ?? ""] ?? status);


export function agentName(label: string) {
  const value = label.trim();
  if (!value) return "Субагент";
  if (!value.startsWith("/root/") && !/^[\w-]+(?:_[\w-]+)+$/.test(value)) return value;
  const name = basename(value).replace(/^impeccable_/, "");
  const roles: Record<string, string> = {
    design_documenter: "Документация дизайна", documenter: "Документация дизайна",
    finish_reviewer: "Проверка интерфейса", branch_finish_review: "Проверка изменений",
    branch_design_documenter: "Документация дизайна",
  };
  const title = roles[name] || name.replace(/[_-]+/g, " ");
  return title.charAt(0).toUpperCase() + title.slice(1);
}

export function historyBlocks(rows: Row[]): Row[][] {
  const flat: Row[] = [];
  function flatten(row: Row) { if (row.kind === "turn") row.children?.forEach(flatten); else if (row.kind === "conversation" || row.kind === "work") flat.push(row); }
  rows.forEach(flatten);
  const blocks: Row[][] = [];
  for (const row of flat) {
    const last = blocks.at(-1);
    if (row.kind === "work" && last?.[0].kind === "work") last.push(row);
    else blocks.push([row]);
  }
  return blocks;
}
