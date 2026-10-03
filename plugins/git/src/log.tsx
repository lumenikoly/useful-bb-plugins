import { useEffect, useMemo, useRef, useState } from "react";
import { experimental_Diff as Diff, useRpc } from "@get-bb/plugin-sdk/app";
import type { Action, Branch, Commit, Inspection, Snapshot, Target, rpcContract } from "./contracts.ts";

type Rpc = ReturnType<typeof useRpc<typeof rpcContract>>;
const colors = ["#7c83db", "#48a87b", "#d69a48", "#c573bd", "#4ba5c5"];
const date = (value: string) => new Date(value).toLocaleDateString("ru-RU", { day: "2-digit", month: "short" });
const errorText = (e: unknown) => e instanceof Error ? e.message : String(e);

export function Glyph({ name, filled = false }: { name: "branch" | "star" | "plus" | "pane" | "more" | "close" | "head" | "fetch" | "pull" | "push" | "refresh" | "settings"; filled?: boolean }) {
  const paths = {
    fetch: <><path d="M5 13H4a3 3 0 0 1-.4-6A5 5 0 0 1 13 5a4 4 0 0 1 3 8h-1M10 9v8m-3-3 3 3 3-3" /></>,
    pull: <><path d="M10 2v11m-4-4 4 4 4-4M3 14v3h14v-3" /></>,
    push: <><path d="M10 14V3m-4 4 4-4 4 4M3 14v3h14v-3" /></>,
    refresh: <><path d="M16 7a6.5 6.5 0 1 0 .4 5M16 3v4h-4" /></>,
    settings: <><path d="m8 2-.5 2-2 .9-1.9-.6-2 3.4L3 9v2l-1.4 1.3 2 3.4 1.9-.6 2 .9.5 2h4l.5-2 2-.9 1.9.6 2-3.4L17 11V9l1.4-1.3-2-3.4-1.9.6-2-.9L12 2Z" /><circle cx="10" cy="10" r="3" /></>,
    branch: <><circle cx="5" cy="4" r="2" /><circle cx="5" cy="16" r="2" /><circle cx="15" cy="4" r="2" /><path d="M5 6v8M15 6v1a5 5 0 0 1-5 5H5" /></>,
    star: <path d="m10 2 2.5 5.1 5.6.8-4.1 4 1 5.6-5-2.6-5 2.6 1-5.6-4.1-4 5.6-.8Z" />,
    plus: <path d="M10 3v14M3 10h14" />,
    pane: <><rect x="2.5" y="3" width="15" height="14" rx="1.5" /><path d="M8 3v14M4.5 6h1.5M4.5 9h1.5" /></>,
    more: <><circle cx="4" cy="10" r="1" /><circle cx="10" cy="10" r="1" /><circle cx="16" cy="10" r="1" /></>,
    close: <path d="m5 5 10 10M15 5 5 15" />,
    head: <><circle cx="10" cy="10" r="6" /><circle cx="10" cy="10" r="2" /></>,
  };
  return <svg className="git-glyph" viewBox="0 0 20 20" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}


// Each lane follows a real parent hash. Merge edges join existing lanes.
function graph(commits: Commit[]) {
  let lanes: string[] = [];
  return commits.map((commit) => {
    if (!lanes.includes(commit.hash)) lanes.push(commit.hash);
    const before = [...lanes], lane = lanes.indexOf(commit.hash);
    lanes.splice(lane, 1);
    commit.parents.forEach((parent, i) => { if (!lanes.includes(parent)) lanes.splice(Math.min(lane + i, lanes.length), 0, parent); });
    const edges = before.flatMap((hash, from) => hash === commit.hash
      ? commit.parents.map((parent) => ({ from, to: lanes.indexOf(parent), color: colors[from % colors.length], start: 16 }))
      : [{ from, to: lanes.indexOf(hash), color: colors[from % colors.length], start: 0 }]);
    return { lane, edges, width: Math.max(before.length, lanes.length, 1) * 16 + 16 };
  });
}

export function GitLog({ rpc, target, data, busy, start }: { rpc: Rpc; target: Target; data: Snapshot; busy: boolean; start: (action: Action) => Promise<void> }) {
  const input = { projectId: target.projectId, targetId: target.id };
  const [ref, setRef] = useState("");
  const [query, setQuery] = useState(""), [branchQuery, setBranchQuery] = useState("");
  const [commits, setCommits] = useState<Commit[]>([]), [more, setMore] = useState(false), [limit, setLimit] = useState(100);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [selected, setSelected] = useState("");
  const [comparison, setComparison] = useState("");
  const [detail, setDetail] = useState<Inspection | null>(null), [detailError, setDetailError] = useState("");
  const [file, setFile] = useState<Inspection["files"][number] | null>(null), [patch, setPatch] = useState<string | null>(null), [patchError, setPatchError] = useState("");
  const [split, setSplit] = useState(true), [showBranches, setShowBranches] = useState(true);
  const [dialog, setDialog] = useState<{ kind: "create" | "track" | "rename" | "delete" | "merge"; branch: string; name: string } | null>(null);
  const favoritesKey = `bb-git-favorites:${target.hostId}:${data.root}`;
  const [favorites, setFavorites] = useState<string[]>(() => { try { const value = JSON.parse(localStorage.getItem(favoritesKey) || "[]"); return Array.isArray(value) ? value.filter((s) => typeof s === "string") : []; } catch { return []; } });
  const selectedBranch = data.refs.find((b) => b.ref === ref);
  const rows = useMemo(() => graph(commits), [commits]);
  const graphWidth = Math.min(160, Math.max(44, ...rows.map((r) => r.width)));
  useEffect(() => {
    if (ref && ref !== "HEAD" && !data.refs.some((b) => b.ref === ref)) { setRef(""); setLimit(100); }
  }, [data.refs, ref]);
  useEffect(() => {
    let current = true;
    setLoading(true); setError("");
    void rpc.call("log", { ...input, ref, limit }).then((result) => {
      if (!current) return;
      setCommits(result.commits); setMore(result.more); setLoading(false);
      setSelected((hash) => result.commits.some((c) => c.hash === hash) ? hash : result.commits[0]?.hash ?? "");
    }, (e) => { if (current) { setError(errorText(e)); setLoading(false); setCommits([]); } });
    return () => { current = false; };
  }, [rpc, target.id, target.projectId, ref, limit, data]);
  useEffect(() => {
    let current = true;
    setDetail(null); setDetailError(""); setFile(null);
    if (comparison || selected) void rpc.call("inspect", { ...input, revision: comparison || selected, compare: !!comparison }).then((result) => {
      if (current) setDetail(result);
    }, (e) => { if (current) setDetailError(errorText(e)); });
    return () => { current = false; };
  }, [rpc, target.id, target.projectId, selected, comparison, data]);
  useEffect(() => {
    let current = true;
    setPatch(null); setPatchError("");
    if (file && detail) void rpc.call("revisionDiff", { ...input, tip: detail.tip, base: detail.base, pathspec: file.path, original: file.original }).then((r) => {
      if (current) setPatch(r.patch);
    }, (e) => { if (current) setPatchError(errorText(e)); });
    return () => { current = false; };
  }, [rpc, target.id, target.projectId, file, detail]);
  function choose(value: string) { setRef(value); setLimit(100); setComparison(""); setSelected(""); }
  function favorite(value: string) {
    const next = favorites.includes(value) ? favorites.filter((v) => v !== value) : [...favorites, value];
    setFavorites(next); try { localStorage.setItem(favoritesKey, JSON.stringify(next)); } catch { /* optional */ }
  }
  function checkout(branch: Branch) {
    if (branch.remote) setDialog({ kind: "track", branch: branch.ref, name: branch.name.slice(branch.remote.length + 1) });
    else void start({ kind: "switch", branch: branch.name, create: false });
  }
  const branchRow = (branch: Branch, favoriteRow = false) => <div className="git-tree-row" key={branch.ref} data-selected={ref === branch.ref}>
    <button className="git-tree-name" title={`${branch.name}${branch.upstream ? ` → ${branch.upstream}` : ""}${branch.worktree ? `\nCheckout: ${branch.worktree}` : ""}`} onClick={() => choose(branch.ref)}>
      <span className="git-branch-symbol" aria-hidden="true"><Glyph name={branch.current ? "head" : "branch"} /></span><span>{branch.remote && !favoriteRow ? branch.name.slice(branch.remote.length + 1) : branch.name}</span>{branch.current && <small>HEAD</small>}
    </button>
    <button className="git-favorite" aria-label={`${favorites.includes(branch.ref) ? "Убрать из избранного" : "В избранное"}: ${branch.name}`} aria-pressed={favorites.includes(branch.ref)} onClick={() => favorite(branch.ref)}><Glyph name="star" filled={favorites.includes(branch.ref)} /></button>
  </div>;
  const matches = (b: Branch) => b.name.toLowerCase().includes(branchQuery.toLowerCase());
  const visible = commits.map((c, i) => ({ c, i })).filter(({ c }) => `${c.subject} ${c.author} ${c.hash}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="git-log-shell">
    <div className="git-log-layout" data-branches={showBranches}>
      <aside className="git-branches" aria-label="Ветки">
        <div className="git-pane-heading"><strong>Ветки</strong><button aria-label="Создать ветку" title="Создать ветку от выбранной" disabled={busy} onClick={() => setDialog({ kind: "create", branch: ref || "HEAD", name: "" })}><Glyph name="plus" /></button></div>
        <div className="git-search"><input aria-label="Поиск веток" placeholder="Найти ветку…" value={branchQuery} onChange={(e) => setBranchQuery(e.target.value)} /></div>
        <div className="git-branch-scroll">
          <button className="git-tree-scope" aria-pressed={!ref} onClick={() => choose("")}><Glyph name="branch" /> <span>Все ветки</span><small>{data.refs.length}</small></button>
          <button className="git-tree-scope" aria-pressed={ref === "HEAD"} disabled={data.unborn} onClick={() => choose("HEAD")}><Glyph name="head" /> <span>HEAD <small>Текущая ветка</small></span></button>
          {data.refs.some((b) => favorites.includes(b.ref) && matches(b)) && <details open className="git-tree-group"><summary>Избранное</summary>{data.refs.filter((b) => favorites.includes(b.ref) && matches(b)).map((b) => branchRow(b, true))}</details>}
          <details open className="git-tree-group"><summary>Локальные <span>{data.refs.filter((b) => !b.remote).length}</span></summary>{data.refs.filter((b) => !b.remote && matches(b)).map((b) => branchRow(b))}</details>
          <details open className="git-tree-group"><summary>Удалённые</summary>{data.remotes.map((remote) => <details open className="git-remote-group" key={remote.name}><summary>{remote.name}<span>{data.refs.filter((b) => b.remote === remote.name).length}</span></summary>{data.refs.filter((b) => b.remote === remote.name && matches(b)).map((b) => branchRow(b))}</details>)}</details>
          {branchQuery && !data.refs.some(matches) && <p className="git-muted git-tree-empty">Ветки не найдены.</p>}
        </div>
        <div className="git-branch-bottom"><span className="git-branch-symbol"><Glyph name="head" /></span><span><strong>{data.branch}</strong><small>{data.upstream || "Нет upstream"}{data.upstream && ` · ↑${data.ahead} ↓${data.behind}`}</small></span></div>
      </aside>
      <main className="git-log-main">
        <div className="git-log-tools">
          <button className="git-icon-button" title="Показать / скрыть ветки" aria-label="Показать / скрыть ветки" aria-pressed={showBranches} onClick={() => setShowBranches(!showBranches)}><Glyph name="pane" /></button>
          <input aria-label="Поиск коммитов" placeholder="Сообщение, автор или хеш…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <span className="git-log-filter" title={ref || "Все ветки"}>{selectedBranch?.name || ref || "Все ветки"}</span>{ref && <button aria-label="Сбросить фильтр ветки" onClick={() => choose("")}><Glyph name="close" /></button>}
        </div>
        <div className="git-branch-actions">
          <span title={selectedBranch?.upstream || ""}>{selectedBranch?.current ? "Текущая ветка" : selectedBranch?.remote ? "Удалённая ветка" : selectedBranch ? "Локальная ветка" : "Журнал репозитория"}</span>
          {selectedBranch && <>
            <button disabled={busy || selectedBranch.current || !!selectedBranch.worktree} title={selectedBranch.worktree ? `Уже открыта: ${selectedBranch.worktree}` : "Переключить рабочую директорию на ветку"} onClick={() => checkout(selectedBranch)}>Переключиться</button>
            {!selectedBranch.current && <><button disabled={busy || data.unborn || data.merging} onClick={() => setDialog({ kind: "merge", branch: selectedBranch.ref, name: selectedBranch.name })}>Merge в {data.branch}</button><button disabled={data.unborn} onClick={() => setComparison(selectedBranch.ref)}>Сравнить с HEAD</button></>}
            <details className="git-branch-menu"><summary aria-label="Другие действия с веткой"><Glyph name="more" /></summary><div>
              <button disabled={busy} onClick={(e) => { e.currentTarget.closest("details")?.removeAttribute("open"); setDialog({ kind: "create", branch: selectedBranch.ref, name: "" }); }}>Новая ветка отсюда…</button>
              {!selectedBranch.remote && <><button disabled={busy || !!selectedBranch.worktree && !selectedBranch.current} onClick={(e) => { e.currentTarget.closest("details")?.removeAttribute("open"); setDialog({ kind: "rename", branch: selectedBranch.name, name: selectedBranch.name }); }}>Переименовать…</button><button disabled={busy || selectedBranch.current || !!selectedBranch.worktree} onClick={(e) => { e.currentTarget.closest("details")?.removeAttribute("open"); setDialog({ kind: "delete", branch: selectedBranch.name, name: selectedBranch.name }); }}>Удалить локальную ветку…</button></>}
            </div></details>
          </>}
        </div>
        <div className="git-log-columns"><span>Граф / Коммит</span><span>Автор</span><span>Дата</span></div>
        <div className="git-log-scroll" aria-label="Журнал коммитов" aria-busy={loading}>
          {error ? <p className="git-error" role="alert">{error}</p> : !commits.length ? <div className="git-empty">{loading ? "Загрузка журнала…" : "Пока нет коммитов."}</div> : !visible.length ? <div className="git-empty">В загруженных коммитах совпадений нет.</div> : visible.map(({ c, i }) => <button key={c.hash} className="git-log-row" data-selected={selected === c.hash && !comparison} aria-pressed={selected === c.hash && !comparison} onClick={() => { setSelected(c.hash); setComparison(""); }}>
            <span className="git-log-subject">
              <svg className="git-graph" width={query ? 24 : graphWidth} height="32" aria-hidden="true">
                {!query && rows[i].edges.map((edge, n) => <path key={n} d={`M ${16 + edge.from * 16} ${edge.start} C ${16 + edge.from * 16} 24, ${16 + edge.to * 16} 24, ${16 + edge.to * 16} 32`} stroke={edge.color} strokeWidth="1.8" fill="none" />)}
                {!query && <path d={`M ${16 + rows[i].lane * 16} 0 V 16`} stroke={colors[rows[i].lane % colors.length]} strokeWidth="1.8" />}
                <circle cx={query ? 12 : 16 + rows[i].lane * 16} cy="16" r="3.8" fill={colors[rows[i].lane % colors.length]} />
              </svg>
              <span className="git-ref-badges">{data.refs.filter((b) => b.hash === c.hash).slice(0, 3).map((b) => <span key={b.ref} className={b.current ? "git-ref-current" : ""} title={b.name}>{b.current && <Glyph name="head" />}{b.name}</span>)}</span>
              <span className="git-subject-text" title={`${c.subject}\n${c.hash}`}>{c.subject}</span>
            </span><span className="git-log-author" title={c.author}>{c.author}</span><time dateTime={c.date} title={new Date(c.date).toLocaleString("ru-RU")}>{date(c.date)}</time>
          </button>)}
          {more && limit < 1000 && <button className="git-load-more" disabled={loading} onClick={() => setLimit((v) => v + 100)}>Показать ещё 100</button>}
        </div>
        <div className="git-log-status"><span>{loading ? "Обновление…" : `${visible.length} коммитов${more ? " · загружена часть истории" : ""}`}</span>{query && <span>Поиск среди {commits.length} загруженных</span>}</div>
      </main>
      <aside className="git-revision" aria-label="Детали коммита">
        <div className="git-pane-heading"><strong>{comparison ? "Сравнение с HEAD" : "Изменённые файлы"}</strong><span>{detail?.files.length ?? ""}</span>{comparison && <button aria-label="Закрыть сравнение" onClick={() => setComparison("")}><Glyph name="close" /></button>}</div>
        {detailError ? <p className="git-error" role="alert">{detailError}</p> : detail ? <>
          {comparison && <p className="git-comparison-label">{data.branch} → {selectedBranch?.name || comparison.replace(/^refs\/(heads|remotes)\//, "")}</p>}
          <div className="git-revision-files">{detail.files.length ? detail.files.map((f) => <button key={f.path} data-selected={file?.path === f.path} title={f.original ? `${f.original} → ${f.path}` : f.path} onClick={() => setFile(f)}><span className={`git-change-${f.status[0]}`}>{f.status[0]}</span><span>{f.path.split("/").pop()}<small>{f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : ""}</small></span></button>) : <p className="git-muted">Нет изменений файлов.</p>}</div>
          <div className="git-commit-detail"><h3>{comparison ? "Разница между вершинами веток" : detail.message.split("\n")[0]}</h3>{!comparison && detail.message.includes("\n") && <p className="git-commit-body">{detail.message.slice(detail.message.indexOf("\n") + 1).trim()}</p>}<p><code title={detail.tip}>{detail.tip.slice(0, 8)}</code><span>{detail.author}</span></p><p className="git-muted">{detail.email}<br />{new Date(detail.date).toLocaleString("ru-RU")}</p>{!comparison && <button disabled={busy} onClick={() => setDialog({ kind: "create", branch: detail.tip, name: "" })}>Создать ветку отсюда…</button>}{detail.base && <small className="git-muted">{comparison ? "HEAD" : "Родитель"}: {detail.base.slice(0, 8)}</small>}</div>
        </> : <div className="git-empty">{selected ? "Читаю коммит…" : "Выберите коммит в журнале."}</div>}
      </aside>
    </div>
    {file && <section className="git-log-diff"><div className="git-diff-heading"><span>{file.path} <small>{detail?.tip.slice(0, 8)}</small></span><div><button onClick={() => setSplit(!split)}>{split ? "Рядом" : "В строку"}</button><button aria-label="Закрыть diff" onClick={() => setFile(null)}><Glyph name="close" /></button></div></div><div className="git-log-diff-content">{patchError ? <p className="git-error" role="alert">{patchError}</p> : patch === null ? <p className="git-empty">Загрузка diff…</p> : patch ? <Diff patch={patch} path={file.path} view={split ? "split" : "unified"} /> : <p className="git-empty">Нет текстовых изменений.</p>}</div></section>}
    {dialog && <BranchDialog key={`${dialog.kind}:${dialog.branch}`} value={dialog} current={data.branch} close={() => setDialog(null)} submit={async (name) => {
      const action: Action = dialog.kind === "create" || dialog.kind === "track" ? { kind: "branch-create", name, from: dialog.branch, track: dialog.kind === "track" } : dialog.kind === "rename" ? { kind: "branch-rename", branch: dialog.branch, name } : { kind: dialog.kind === "delete" ? "branch-delete" : "merge", branch: dialog.branch };
      await start(action); setDialog(null);
    }} />}
  </div>;
}

function BranchDialog({ value, current, close, submit }: { value: { kind: string; branch: string; name: string }; current: string; close: () => void; submit: (name: string) => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(value.name), [pending, setPending] = useState(false);
  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close(); }, []);
  const editable = ["create", "track", "rename"].includes(value.kind);
  const title = value.kind === "create" ? "Новая ветка" : value.kind === "track" ? "Checkout удалённой ветки" : value.kind === "rename" ? "Переименовать ветку" : value.kind === "delete" ? "Удалить локальную ветку?" : `Merge в ${current}`;
  return <dialog ref={dialog} className="git-credential" aria-label={title} onCancel={close}><form onSubmit={(e) => { e.preventDefault(); setPending(true); void submit(name.trim()).finally(() => setPending(false)); }}><h2>{title}</h2><p className="git-prompt">{value.branch.replace(/^refs\/(heads|remotes)\//, "")}</p>{editable && <><label htmlFor="git-branch-name">Имя локальной ветки</label><input id="git-branch-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} required maxLength={255} placeholder="feature/new-branch" /></>}
    <p className="git-muted">{value.kind === "delete" ? "Git удалит ветку только если её коммиты уже объединены. Удалённая ветка останется на сервере." : value.kind === "merge" ? "Изменения выбранной ветки будут объединены с текущей. При конфликтах можно завершить или отменить merge в панели изменений." : value.kind === "track" ? "Будет создана локальная ветка с upstream и выполнено переключение на неё." : value.kind === "create" ? "Ветка будет создана от выбранной точки. Рабочая директория переключится на новую ветку." : "Новое имя применяется к локальной ветке."}</p>
    <div className="git-credential-actions"><button type="button" onClick={close} disabled={pending}>Отмена</button><button className="git-primary" disabled={pending || editable && !name.trim()}>{value.kind === "delete" ? "Удалить" : value.kind === "merge" ? "Объединить" : value.kind === "rename" ? "Переименовать" : "Создать и переключиться"}</button></div></form></dialog>;
}
