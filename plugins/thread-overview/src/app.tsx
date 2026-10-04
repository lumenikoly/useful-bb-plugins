import { useEffect, useId, useState, type ReactNode } from "react";
import { definePluginApp, useSdk, useBbNavigate, ThreadChat, Markdown, experimental_Icon as Icon, experimental_FileLink as FileLink, UrlLink, experimental_Diff as Diff, experimental_SourceCode as SourceCode, experimental_useSidebarThreads as useSidebarThreads, type PluginThreadPanelProps, type PluginThreadHeaderActionProps } from "@get-bb/plugin-sdk/app";
import { backgroundEntries, timelineEntries, mergeEntries, isImage, statusLabel, agentName, historyBlocks, type Entry, type Row } from "./data.ts";
import "./app.css";

type Sdk = ReturnType<typeof useSdk>;
type Changes = Awaited<ReturnType<Sdk["environments"]["diffFiles"]>>;
type Snapshot = { title: string; environmentId: string | null; results: Entry[]; sources: Entry[]; agents: Entry[]; processes: Entry[]; changes: Changes | null; warnings: string[]; partial: boolean };
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

async function load(sdk: Sdk, threadId: string, signal: AbortSignal): Promise<Snapshot> {
  const thread = await sdk.threads.get({ threadId, signal });
  const warnings: string[] = [];
  const [files, timeline, events, children, changes] = await Promise.allSettled([
    sdk.threads.storageFiles({ threadId, limit: "200", signal }),
    sdk.threads.timeline({ threadId, segmentLimit: "100", includeNestedRows: "true", signal }),
    sdk.threads.events.list({ threadId, order: "desc", limit: "100", types: ["item/started", "item/completed", "item/backgroundTask/progress", "item/backgroundTask/completed"], signal }),
    sdk.threads.list({ parentThreadId: threadId, includeHidden: true, limit: 100, signal }),
    thread.environmentId ? sdk.environments.diffFiles({ environmentId: thread.environmentId, target: "uncommitted", signal }) : Promise.resolve(null),
  ]);
  for (const [label, result] of [["Файлы", files], ["История", timeline], ["Процессы", events], ["Субагенты", children], ["Изменения", changes]] as const) {
    if (result.status === "rejected") warnings.push(`${label}: ${errorText(result.reason)}`);
  }
  const stored = files.status === "fulfilled" ? files.value : null;
  const history = timeline.status === "fulfilled" ? timeline.value : null;
  const projected = timelineEntries(history?.rows ?? [], threadId, stored?.storageRootPath ?? "", thread.environmentId);
  const outputs: Entry[] = [], attachments: Entry[] = [];
  for (const file of stored?.files ?? []) {
    const path = file.path.startsWith(`${stored!.storageRootPath}/`) ? file.path.slice(stored!.storageRootPath.length + 1) : file.path;
    const entry: Entry = { id: path, label: file.name, icon: isImage(path) ? "overview-image" : "FileText", target: { kind: "thread-storage", threadId, path } };
    (path.startsWith("Attachments/") ? attachments : outputs).push(entry);
  }
  const childEntries: Entry[] = children.status === "fulfilled" ? children.value.map((child) => ({ id: child.id, label: child.title || child.titleFallback || "Субагент", icon: "UserRound", status: child.status, threadId: child.id })) : [];
  return {
    title: thread.title || thread.titleFallback || "Обзор треда", environmentId: thread.environmentId,
    results: mergeEntries(outputs, projected.results), sources: mergeEntries(attachments, projected.sources),
    agents: mergeEntries(childEntries, projected.agents.filter((agent) => !childEntries.some((child) => child.id === agent.id))),
    processes: events.status === "fulfilled" ? backgroundEntries(events.value) : [],
    changes: changes.status === "fulfilled" ? changes.value : null, warnings,
    partial: Boolean(stored?.truncated || history?.timelinePage.hasOlderRows || (events.status === "fulfilled" && events.value.length === 100) || childEntries.length === 100),
  };
}

function Section({ title, count, children, empty }: { title: string; count: number; children: ReactNode[]; empty: string }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  return <section className="overview-section" aria-labelledby={id}>
    <h2 id={id}>{title}{count > 0 && <span>{count}</span>}</h2>
    {count ? <><ul>{(expanded ? children : children.slice(0, 6)).map((child, index) => <li key={index}>{child}</li>)}</ul>
      {count > 6 && <button className="overview-more" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "Свернуть" : `Показать ещё ${count - 6}`}</button>}</>
      : <p className="overview-empty">{empty}</p>}
  </section>;
}
function EntryRow({ entry }: { entry: Entry }) {
  const navigate = useBbNavigate();
  const content = <><Icon name={entry.icon} className="overview-icon" /><span className="overview-label">{entry.label}</span>{entry.status && <StatusMark status={entry.status} />}</>;
  if (entry.target) return <FileLink className="overview-row" title={entry.id} target={entry.target}>{content}</FileLink>;
  if (entry.url) return <UrlLink className="overview-row" title={entry.url} href={entry.url}>{content}</UrlLink>;
  if (entry.threadId) return <button className="overview-row" title={entry.label} onClick={() => navigate.toThread(entry.threadId!)}>{content}</button>;
  if (entry.detail) return <details className="overview-detail"><summary className="overview-row">{content}</summary><pre>{entry.detail}</pre></details>;
  return <div className="overview-row" title={entry.label}>{content}</div>;
}
function Overview({ threadId }: PluginThreadPanelProps) {
  // A panel can be retargeted without a full host remount.
  return <OverviewBody key={threadId} threadId={threadId} />;
}
function OverviewBody({ threadId }: { threadId: string }) {
  const sdk = useSdk();
  const { threads } = useSidebarThreads();
  const backgroundCount = threads.find((thread) => thread.id === threadId)?.activity.backgroundCommands ?? 0;
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        if (document.visibilityState !== "hidden") {
          const next = await load(sdk, threadId, controller.signal);
          if (!controller.signal.aborted) { setData(next); setError(""); }
        }
      } catch (e) { if (!controller.signal.aborted) setError(errorText(e)); }
      finally { if (!controller.signal.aborted) { setBusy(false); timer = setTimeout(refresh, 10000); } }
    }
    setBusy(true);
    void refresh();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [sdk, threadId, revision]);
  const unavailable = (section: string) => data?.warnings.some((warning) => warning.startsWith(`${section}:`)) ? "Не удалось загрузить данные. Повторите обновление." : null;
  const changes = data?.changes?.outcome === "available" ? data.changes.files : [];
  const agent = data?.agents.find((entry) => entry.id === agentId);
  if (agent) return <AgentDetail entry={agent} onClose={() => setAgentId(null)} />;
  if (selected && data?.environmentId) return <div className="overview-shell" lang="ru"><ChangeDetail key={`${data.environmentId}:${selected}`} sdk={sdk} environmentId={data.environmentId} path={selected} onClose={() => setSelected(null)} /></div>;
  return <aside className="overview-shell" lang="ru" aria-label="Обзор треда" aria-busy={busy}>
    <header className="overview-toolbar"><span>Обзор треда</span><button className="overview-icon-button" title="Обновить" aria-label="Обновить обзор" disabled={busy} onClick={() => setRevision((n) => n + 1)}><Icon name="overview-refresh" className="overview-icon" /></button></header>
    <div className="overview-content">
    {error && <p className="overview-error" role="alert">Не удалось обновить обзор: {error}. Нажмите «Обновить».</p>}
    {!data && !error && <p className="overview-empty" role="status">Загрузка обзора…</p>}
    {data && <>
      <Section title="Результаты" count={data.results.length} empty={unavailable("Файлы") || "Нет сохранённых результатов"}>{data.results.map((entry) => <EntryRow key={entry.id} entry={entry} />)}</Section>
      <Section title="Изменения" count={changes.length} empty={unavailable("Изменения") || (data.changes?.outcome === "not_applicable" ? "В этом окружении нет Git-репозитория." : data.changes?.outcome === "unavailable" ? data.changes.failure.message : data.environmentId ? "Нет незакоммиченных изменений." : "Окружение ещё не подключено.")}>
        {changes.map((file) => <button className="overview-row" title={file.path} key={file.path} onClick={() => setSelected(file.path)}><Icon name="FileDiff" className="overview-icon" /><span className="overview-label">{file.path}</span><small className="overview-stats"><span>+{file.additions}</span><span>−{file.deletions}</span></small></button>)}
      </Section>
      <Section title="Субагенты" count={data.agents.length} empty={unavailable("Субагенты") || unavailable("История") || "Субагенты не запускались"}>{data.agents.map((entry) => <AgentRow key={entry.id} entry={entry} onOpen={() => setAgentId(entry.id)} />)}</Section>
      <Section title="Фоновые процессы" count={data.processes.length} empty={unavailable("Процессы") || (backgroundCount ? `Активных команд: ${backgroundCount}. Подробности — в чате.` : "Нет активных процессов")}>{data.processes.map((entry) => <EntryRow key={entry.id} entry={entry} />)}</Section>
      <Section title="Источники" count={data.sources.length} empty={unavailable("История") || unavailable("Файлы") || "Нет источников"}>{data.sources.map((entry) => <EntryRow key={entry.id} entry={entry} />)}</Section>
      {data.warnings.length > 0 && <div className="overview-error" role="alert">{data.warnings.map((warning) => <p key={warning}>{warning}</p>)}<button className="overview-more" onClick={() => setRevision((n) => n + 1)}>Повторить загрузку</button></div>}
      {data.partial && <p className="overview-note">Показана последняя часть истории. Полная история доступна в чате.</p>}
    </>}
  </div></aside>;
}
function useAgentExecution(entry: Entry) {
  const sdk = useSdk();
  const [execution, setExecution] = useState<{ model?: string; reasoning?: string }>({});
  useEffect(() => {
    if (!entry.threadId) return;
    const controller = new AbortController();
    void sdk.threads.defaultExecutionOptions({ threadId: entry.threadId, signal: controller.signal }).then((value) => {
      if (!controller.signal.aborted && value) setExecution({ model: value.model, reasoning: value.reasoningLevel });
    }, () => { /* Optional provider metadata: do not invent it when unavailable. */ });
    return () => controller.abort();
  }, [sdk, entry.threadId, entry.status]);
  return [execution.model || entry.model, execution.reasoning || entry.reasoning].filter(Boolean).join(" · ");
}
function Glyph({ name, className = "overview-icon" }: { name: "check" | "error" | "running" | "chevron" | "terminal" | "activity" | "pause"; className?: string }) {
  const paths = { check: "m5 12 4 4L19 6", error: "m7 7 10 10M17 7 7 17", running: "M20 12a8 8 0 1 1-8-8", chevron: "m9 5 7 7-7 7", terminal: "m5 6 5 5-5 5M13 17h6", activity: "M5 6h14M5 12h14M5 18h9", pause: "M9 5v14M15 5v14" };
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
function StatusMark({ status, active = false }: { status?: string; active?: boolean }) {
  if (!status) return null;
  const running = ["running", "active", "starting", "pending", "stopping"].includes(status);
  const failed = ["error", "failed"].includes(status);
  const paused = ["paused", "interrupted", "stopped"].includes(status);
  const label = running && active ? "Выполняется" : statusLabel(status);
  return <span className="overview-status" data-state={failed ? "error" : running ? "running" : "idle"} title={label} aria-label={label}><Glyph name={failed ? "error" : running ? "running" : paused ? "pause" : "check"} className="overview-status-icon" />{active && (running || failed) && <span>{label}</span>}</span>;
}
function AgentRow({ entry, onOpen }: { entry: Entry; onOpen: () => void }) {
  const execution = useAgentExecution(entry);
  const title = agentName(entry.label);
  return <button className="overview-row overview-agent-row" title={title} onClick={onOpen}><span className="overview-agent-avatar"><Icon name="UserRound" className="overview-icon" /></span><span className="overview-agent-label"><span>{title}</span>{execution && <small>{execution}</small>}</span><StatusMark status={entry.status} active /><Glyph name="chevron" className="overview-row-chevron" /></button>;
}
function AgentDetail({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const execution = useAgentExecution(entry);
  const title = agentName(entry.label);
  return <section className="overview-agent-view" lang="ru" aria-label={`Субагент ${title}`}><header className="overview-toolbar"><button className="overview-icon-button" autoFocus onClick={onClose} aria-label="Назад к обзору" title="Назад к обзору"><Icon name="ArrowLeft" className="overview-icon" /></button><span className="overview-agent-avatar"><Icon name="UserRound" className="overview-icon" /></span><div className="overview-agent-heading"><h2>{title}</h2>{execution && <p>{execution}</p>}</div><StatusMark status={entry.status} active /></header>
    {entry.threadId ? <ThreadChat threadId={entry.threadId} variant="timeline" className="overview-agent-chat" /> : <div className="overview-agent-transcript">{entry.history?.length ? <AgentHistory rows={entry.history} /> : entry.detail ? <article className="overview-agent-message"><Markdown content={entry.detail} /></article> : <p className="overview-empty">История субагента пока недоступна</p>}</div>}
  </section>;
}
function AgentHistory({ rows }: { rows: Row[] }) {
  return <>{historyBlocks(rows).map((block) => block[0].kind === "work" ? <details className="overview-activity" key={block[0].id}><summary><Glyph name="activity" /><span>Действия <span className="overview-count">{block.length}</span></span><Glyph name="chevron" className="overview-disclosure-icon" /></summary><div className="overview-activity-body">{block.map((row) => <AgentHistoryRow key={row.id} row={row} />)}</div></details> : <AgentHistoryRow key={block[0].id} row={block[0]} />)}</>;
}
function AgentHistoryRow({ row }: { row: Row }) {
  if (row.kind === "conversation") return <article className="overview-agent-message" data-role={row.role}>{row.role === "user" && <p className="overview-agent-role">Задание</p>}<Markdown content={row.text} /></article>;
  if (row.kind !== "work") return null;
  const presentation = "presentation" in row ? row.presentation : undefined;
  const workNames: Record<string, string> = { command: "Выполнение команды", tool: "Вызов инструмента", "file-change": "Изменение файла", "file-read": "Чтение файла", "web-search": "Поиск в интернете", "web-fetch": "Открытие страницы", search: "Поиск", delegation: "Субагент", "image-generation": "Создание изображения", "image-view": "Просмотр изображения", "plan-steps": "План", approval: "Подтверждение", question: "Вопрос", form: "Форма", workflow: "Рабочий процесс", extension: "Действие" };
  let title = presentation?.title || workNames[row.workKind] || "Действие";
  let preview = "", body = "";
  if (row.workKind === "command") { title = "Выполнение команды"; preview = row.command.split("\n")[0]; body = row.output; }
  else if (row.workKind === "tool") { preview = row.toolName; body = row.output; }
  else if (row.workKind === "delegation") { title = agentName(row.description || row.subagentType || "Субагент"); body = row.output; }
  else if (row.workKind === "file-change") { preview = row.change.path; body = row.change.diff || ""; }
  else if (row.workKind === "file-read") preview = row.path;
  else if (row.workKind === "web-fetch") preview = row.url;
  else if (row.workKind === "web-search") preview = row.queries.join(", ");
  return <details className="overview-agent-work"><summary><Glyph name={row.workKind === "command" ? "terminal" : "activity"} /><span className="overview-work-label"><span>{title}</span>{preview && <small title={preview}>{preview}</small>}</span><StatusMark status={row.status} /><Glyph name="chevron" className="overview-disclosure-icon" /></summary><div className="overview-work-body">{row.workKind === "command" && <div className="overview-code"><SourceCode content={row.command} path="command.sh" overflow="wrap" /></div>}{body && (row.workKind === "file-change" ? <Diff path={row.change.path} patch={body} view="unified" /> : row.workKind === "delegation" ? <Markdown content={body} /> : <div className="overview-code"><SourceCode content={body} path="output.txt" overflow="wrap" /></div>)}{row.workKind === "delegation" && <AgentHistory rows={row.childRows} />}{!body && row.workKind !== "command" && row.workKind !== "delegation" && preview && <p className="overview-work-context">{preview}</p>}</div></details>;
}
function ChangeDetail({ sdk, environmentId, path, onClose }: { sdk: Sdk; environmentId: string; path: string; onClose: () => void }) {
  const [patch, setPatch] = useState<string | null>(null), [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void sdk.environments.diffPatch({ environmentId, paths: [path], target: { type: "uncommitted" }, signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;
      if (result.outcome === "available") { setPatch(result.patches[0]?.patch ?? ""); if (result.patches[0]?.truncated) setError("Показана только часть изменений этого файла."); }
      else setError(result.outcome === "unavailable" ? result.failure.message : result.message);
    }, (e) => { if (!controller.signal.aborted) setError(errorText(e)); });
    return () => controller.abort();
  }, [sdk, environmentId, path]);
  return <section className="overview-diff" aria-label={`Изменения ${path}`}><button className="overview-more" autoFocus onClick={onClose}>Назад к обзору</button><h2>{path}</h2>{error && <p role="alert">{error}</p>}{patch === null && !error ? <p role="status">Загрузка изменений…</p> : patch ? <Diff path={path} patch={patch} view="unified" /> : !error && <p>Нет текстового diff. Файл может быть бинарным или уже изменился.</p>}</section>;
}
function HeaderButton({ isCompactViewport }: PluginThreadHeaderActionProps) {
  const navigate = useBbNavigate();
  return <button className="overview-launcher" aria-label="Открыть обзор треда" title="Обзор треда" onClick={() => navigate.openThreadPanel({ actionId: "overview" })}><Icon name="overview-panel" className="overview-icon" />{!isCompactViewport && <span>Обзор</span>}</button>;
}
export default definePluginApp((app) => {
  const icons = {
    "overview-panel": "M9 6a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0M13 6h7M9 17a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0M13 17h7",
    "overview-refresh": "M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1",
    "overview-image": "M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1M3 17l5-5 4 4 3-3 6 6M8 7h.01",
  };
  for (const [name, d] of Object.entries(icons)) app.experimental_icons.register({ name, component: ({ className }) => <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg> });
  app.slots.threadPanelAction({ id: "overview", title: "Обзор", icon: "overview-panel", layout: "flush", component: Overview });
  app.slots.experimental_threadHeaderAction({ id: "overview", title: "Обзор треда", component: HeaderButton });
});
