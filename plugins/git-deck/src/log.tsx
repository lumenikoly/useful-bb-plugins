import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { experimental_Diff as Diff, useRpc } from "@get-bb/plugin-sdk/app";
import type { Action, Branch, Commit, Inspection, Snapshot, Target, rpcContract } from "./contracts.ts";

type Rpc = ReturnType<typeof useRpc<typeof rpcContract>>;
const colors = ["#7c83db", "#48a87b", "#d69a48", "#c573bd", "#4ba5c5"];
const date = (value: string) => new Date(value).toLocaleDateString("en-US", { day: "2-digit", month: "short" });
const errorText = (e: unknown) => e instanceof Error ? e.message : String(e);

export function Glyph({ name, filled = false }: { name: "branch" | "star" | "plus" | "trash" | "pane" | "more" | "close" | "head" | "fetch" | "pull" | "push" | "refresh" | "settings" | "undo" | "minus"; filled?: boolean }) {
  const paths = {
    fetch: <><path d="M5 13H4a3 3 0 0 1-.4-6A5 5 0 0 1 13 5a4 4 0 0 1 3 8h-1M10 9v8m-3-3 3 3 3-3" /></>,
    pull: <><path d="M10 2v11m-4-4 4 4 4-4M3 14v3h14v-3" /></>,
    push: <><path d="M10 14V3m-4 4 4-4 4 4M3 14v3h14v-3" /></>,
    refresh: <><path d="M16 7a6.5 6.5 0 1 0 .4 5M16 3v4h-4" /></>,
    undo: <path d="M3 8h8a5 5 0 0 1 0 10M3 8l4-4M3 8l4 4" />,
    settings: <><path d="m8 2-.5 2-2 .9-1.9-.6-2 3.4L3 9v2l-1.4 1.3 2 3.4 1.9-.6 2 .9.5 2h4l.5-2 2-.9 1.9.6 2-3.4L17 11V9l1.4-1.3-2-3.4-1.9.6-2-.9L12 2Z" /><circle cx="10" cy="10" r="3" /></>,
    branch: <><circle cx="5" cy="4" r="2" /><circle cx="5" cy="16" r="2" /><circle cx="15" cy="4" r="2" /><path d="M5 6v8M15 6v1a5 5 0 0 1-5 5H5" /></>,
    star: <path d="m10 2 2.5 5.1 5.6.8-4.1 4 1 5.6-5-2.6-5 2.6 1-5.6-4.1-4 5.6-.8Z" />,
    minus: <path d="M3 10h14" />,
    plus: <path d="M10 3v14M3 10h14" />,
    trash: <><path d="M3 5h14M7 5V3h6v2M5 5l1 12h8l1-12M8 8v6M12 8v6" /></>,
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
      ? commit.parents.map((parent) => ({ from, to: lanes.indexOf(parent), color: colors[from % colors.length], start: 23 }))
      : [{ from, to: lanes.indexOf(hash), color: colors[from % colors.length], start: 0 }]);
    return { lane, edges, width: Math.max(before.length, lanes.length, 1) * 16 + 16 };
  });
}

export function GitLog({ rpc, target, data, busy, start }: { rpc: Rpc; target: Target; data: Snapshot; busy: boolean; start: (action: Action) => Promise<void> }) {
  const input = { projectId: target.projectId, targetId: target.id };
  const [ref, setRef] = useState("");
  const shell = useRef<HTMLDivElement>(null);
  const [fileQuery, setFileQuery] = useState(""), [fileTree, setFileTree] = useState(() => { try { return localStorage.getItem("bb-git-deck-file-view") !== "list"; } catch { return true; } });
  const [messageOpen, setMessageOpen] = useState(false);
  const [author, setAuthor] = useState("");
  const [query, setQuery] = useState(""), [branchQuery, setBranchQuery] = useState("");
  const [commits, setCommits] = useState<Commit[]>([]), [more, setMore] = useState(false), [limit, setLimit] = useState(100);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [selected, setSelected] = useState("");
  const [comparison, setComparison] = useState("");
  const [detail, setDetail] = useState<Inspection | null>(null), [detailError, setDetailError] = useState("");
  const [file, setFile] = useState<Inspection["files"][number] | null>(null), [patch, setPatch] = useState<string | null>(null), [patchError, setPatchError] = useState("");
  const [split, setSplit] = useState(true), [showBranches, setShowBranches] = useState(true);
  const [dialog, setDialog] = useState<{ kind: "create" | "track" | "rename" | "delete" | "merge"; branch: string; name: string } | null>(null);
  const favoritesKey = `bb-git-deck-favorites:${target.hostId}:${data.root}`;
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
  useEffect(() => {
    const element = shell.current?.querySelector<HTMLButtonElement>(file ? ".git-diff-back" : ".git-log-row[data-selected=true]");
    if (file || shell.current?.contains(document.activeElement)) element?.focus({ preventScroll: true });
  }, [!!file]);
  function choose(value: string) {
    if (value !== ref || limit !== 100) setSelected("");
    setRef(value); setLimit(100); setComparison("");
  }
  function favorite(value: string) {
    const next = favorites.includes(value) ? favorites.filter((v) => v !== value) : [...favorites, value];
    setFavorites(next); try { localStorage.setItem(favoritesKey, JSON.stringify(next)); } catch { /* optional */ }
  }
  function checkout(branch: Branch) {
    if (branch.remote) setDialog({ kind: "track", branch: branch.ref, name: branch.name.slice(branch.remote.length + 1) });
    else void start({ kind: "switch", branch: branch.name, create: false });
  }
  const branchRow = (branch: Branch, favoriteRow = false) => <BranchRow key={branch.ref} branch={branch} selected={ref === branch.ref} favorite={favorites.includes(branch.ref)} favoriteRow={favoriteRow} busy={busy} current={data.branch} canMerge={!data.unborn && !data.merging} canCompare={!data.unborn}
    choose={() => choose(branch.ref)} checkout={() => checkout(branch)} toggleFavorite={() => favorite(branch.ref)} compare={() => { choose(branch.ref); setComparison(branch.ref); }}
    create={() => setDialog({ kind: "create", branch: branch.ref, name: "" })} rename={() => setDialog({ kind: "rename", branch: branch.name, name: branch.name })} remove={() => setDialog({ kind: "delete", branch: branch.name, name: branch.name })} merge={() => setDialog({ kind: "merge", branch: branch.ref, name: branch.name })} />;
  const matches = (b: Branch) => b.name.toLowerCase().includes(branchQuery.toLowerCase());
  const visible = commits.map((c, i) => ({ c, i })).filter(({ c }) => `${c.subject} ${c.author} ${c.hash}`.toLowerCase().includes(query.toLowerCase()) && (!author || c.author === author));
  const filesPane = <RevisionFiles detail={detail} file={file} choose={setFile} query={fileQuery} setQuery={setFileQuery} tree={fileTree} setTree={(value) => { setFileTree(value); try { localStorage.setItem("bb-git-deck-file-view", value ? "tree" : "list"); } catch { /* optional preference */ } }} />;
  return <div ref={shell} className="git-log-shell" data-diff={!!file}>
    <div className="git-log-layout" data-branches={showBranches}>
      <aside className="git-branches" aria-label="Branches">
        <div className="git-pane-heading"><strong>Branches</strong><button aria-label="Create branch" title="Create a branch from the selection" disabled={busy} onClick={() => setDialog({ kind: "create", branch: ref || "HEAD", name: "" })}><Glyph name="plus" /></button></div>
        <div className="git-search"><input aria-label="Search branches" placeholder="Search branches…" value={branchQuery} onChange={(e) => setBranchQuery(e.target.value)} /></div>
        <div className="git-branch-scroll" onScroll={(e) => e.currentTarget.querySelector<HTMLDivElement>(".git-row-menu:popover-open")?.hidePopover()}>
          <button className="git-tree-scope" aria-pressed={!ref} onClick={() => choose("")}><Glyph name="branch" /> <span>All</span><small>{data.refs.length}</small></button>

          {data.refs.some((b) => favorites.includes(b.ref) && matches(b)) && <details open className="git-tree-group"><summary>Favorites</summary>{data.refs.filter((b) => favorites.includes(b.ref) && matches(b)).map((b) => branchRow(b, true))}</details>}
          <details open className="git-tree-group"><summary>Local <span>{data.refs.filter((b) => !b.remote).length}</span></summary>{data.refs.filter((b) => !b.remote && matches(b)).sort((a, b) => Number(b.current) - Number(a.current)).map((b) => branchRow(b))}</details>
          <details open className="git-tree-group"><summary>Remote <span>{data.refs.filter((b) => b.remote).length}</span></summary>{data.remotes.map((remote) => <details open={!!branchQuery} className="git-remote-group" key={remote.name}><summary>{remote.name}<span>{data.refs.filter((b) => b.remote === remote.name).length}</span></summary>{data.refs.filter((b) => b.remote === remote.name && matches(b)).map((b) => branchRow(b))}</details>)}</details>
          {branchQuery && !data.refs.some(matches) && <p className="git-muted git-tree-empty">No branches found.</p>}
        </div>

      </aside>
      <main className="git-log-main">
        <div className="git-log-tools">
          <button className="git-icon-button" title="Show / hide branches" aria-label="Show / hide branches" aria-pressed={showBranches} onClick={() => setShowBranches(!showBranches)}><Glyph name="pane" /></button>
          <input aria-label="Search commits" placeholder="Search commits…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <select className="git-log-filter" aria-label="Filter history by branch" value={ref} onChange={(e) => choose(e.target.value)}><option value="">All branches</option><option value="HEAD">Current branch</option><optgroup label="Local">{data.refs.filter((b) => !b.remote).map((b) => <option key={b.ref} value={b.ref}>{b.name}</option>)}</optgroup><optgroup label="Remote">{data.refs.filter((b) => b.remote).map((b) => <option key={b.ref} value={b.ref}>{b.name}</option>)}</optgroup></select>
          <select className="git-author-filter" aria-label="Filter history by author" value={author} onChange={(e) => setAuthor(e.target.value)}><option value="">Author</option>{[...new Set(commits.map((c) => c.author))].sort().map((name) => <option key={name}>{name}</option>)}</select>
        </div>
        {selectedBranch && !showBranches && <div className="git-branch-actions"><span>{selectedBranch.name}</span><ActionsMenu label={`Actions for ${selectedBranch.name}`} actions={[
          { label: "Checkout", disabled: busy || selectedBranch.current || !!selectedBranch.worktree, run: () => checkout(selectedBranch) },
          { label: "Create branch from here…", disabled: busy, run: () => setDialog({ kind: "create", branch: selectedBranch.ref, name: "" }) },
          ...(!selectedBranch.current ? [{ label: `Merge into ${data.branch}…`, disabled: busy || data.unborn || data.merging, run: () => setDialog({ kind: "merge" as const, branch: selectedBranch.ref, name: selectedBranch.name }) }, { label: "Compare with HEAD", disabled: data.unborn, run: () => setComparison(selectedBranch.ref) }] : []),
          ...(!selectedBranch.remote ? [{ label: "Rename…", disabled: busy || !!selectedBranch.worktree && !selectedBranch.current, run: () => setDialog({ kind: "rename" as const, branch: selectedBranch.name, name: selectedBranch.name }) }, { label: "Delete local branch…", disabled: busy || selectedBranch.current || !!selectedBranch.worktree, run: () => setDialog({ kind: "delete" as const, branch: selectedBranch.name, name: selectedBranch.name }) }] : []),
        ]} /></div>}
        <div className="git-log-columns"><span>Graph / Commit</span><span>Author</span><span>Date</span></div>
        <div className="git-log-scroll" aria-label="Commit log" aria-busy={loading}>
          {error ? <p className="git-error" role="alert">{error}</p> : !commits.length ? <div className="git-empty">{loading ? "Loading log…" : "No commits yet."}</div> : !visible.length ? <div className="git-empty">No matching commits in the loaded history.</div> : visible.map(({ c, i }) => <button key={c.hash} className="git-log-row" data-selected={selected === c.hash && !comparison} aria-pressed={selected === c.hash && !comparison} onClick={() => { setSelected(c.hash); setComparison(""); }}>
            <span className="git-log-subject">
              <svg className="git-graph" width={query || author ? 24 : graphWidth} height="46" aria-hidden="true">
                {!query && !author && rows[i].edges.map((edge, n) => <path key={n} d={`M ${16 + edge.from * 16} ${edge.start} C ${16 + edge.from * 16} 34, ${16 + edge.to * 16} 34, ${16 + edge.to * 16} 46`} stroke={edge.color} strokeWidth="1.8" fill="none" />)}
                {!query && !author && <path d={`M ${16 + rows[i].lane * 16} 0 V 23`} stroke={colors[rows[i].lane % colors.length]} strokeWidth="1.8" />}
                <circle cx={query || author ? 12 : 16 + rows[i].lane * 16} cy="23" r="3.8" fill={colors[rows[i].lane % colors.length]} />
              </svg>
              <span className="git-commit-label"><span className="git-subject-text" title={`${c.subject}\n${c.hash}`}>{c.subject}</span><span className="git-ref-badges">{data.refs.filter((b) => b.hash === c.hash).slice(0, 3).map((b) => <span key={b.ref} className={b.current ? "git-ref-current" : ""} title={b.name}>{b.current && <Glyph name="head" />}{b.name}</span>)}</span></span>
            </span><span className="git-log-author" title={c.author}>{c.author}</span><time dateTime={c.date} title={new Date(c.date).toLocaleString("en-US")}>{date(c.date)}</time>
          </button>)}
          {more && limit < 1000 && <button className="git-load-more" disabled={loading} onClick={() => setLimit((v) => v + 100)}>Load 100 more</button>}
        </div>
        <div className="git-log-status"><span>{loading ? "Refreshing…" : `${visible.length} commits${more ? " · partial history loaded" : ""}`}</span>{query && <span>Searching {commits.length} loaded commits</span>}</div>
      </main>
      <aside className="git-revision" aria-label="Commit details">
        {detailError ? <p className="git-error" role="alert">{detailError}</p> : detail ? <>
          <div className="git-commit-detail">
            <h3 title={detail.message}>{comparison ? "Difference between branch tips" : detail.message.split("\n")[0]}</h3>

            <p className="git-commit-meta"><code title={detail.tip}>{detail.tip.slice(0, 8)}</code><span title={detail.email}>{detail.author}</span><time dateTime={detail.date} title={new Date(detail.date).toLocaleString("en-US")}>{date(detail.date)}</time></p>
            <div className="git-commit-actions"><small className="git-muted">{detail.base ? `${comparison ? "HEAD" : "Parent"} ${detail.base.slice(0, 8)}` : "Root commit"}</small><ActionsMenu label="Commit actions" actions={[
              { label: "View full message", run: () => setMessageOpen(true) },
              { label: "Create branch from here…", disabled: busy, run: () => setDialog({ kind: "create", branch: detail.tip, name: "" }) },
              { label: "Copy hash", run: () => { void navigator.clipboard.writeText(detail.tip).catch((e) => setDetailError(errorText(e))); } },
            ]} /></div>
            {comparison && <div className="git-comparison-label">{data.branch} → {selectedBranch?.name || comparison.replace(/^refs\/(heads|remotes)\//, "")}<button aria-label="Close comparison" onClick={() => setComparison("")}><Glyph name="close" /></button></div>}
          </div>
          {filesPane}
        </> : <div className="git-empty">{selected ? "Loading commit…" : "Select a commit in the log."}</div>}
      </aside>
    </div>
    {file && <section className="git-log-diff" aria-label="Commit diff"><div className="git-diff-heading"><button className="git-diff-back" onClick={() => setFile(null)} title={detail?.message.split("\n")[0]}><Glyph name="undo" />{comparison ? "Back to comparison" : detail?.message.split("\n")[0] || "Back to history"}</button><button aria-pressed={split} onClick={() => setSplit(!split)}>{split ? "Side by side" : "Unified"}</button></div><div className="git-revision-diff-layout">{filesPane}<main className="git-log-diff-content"><div className="git-diff-path" title={file.path}>{file.path}</div>{patchError ? <p className="git-error" role="alert">{patchError}</p> : patch === null ? <p className="git-empty">Loading diff…</p> : patch ? <Diff patch={patch} path={file.path} view={split ? "split" : "unified"} /> : <p className="git-empty">No text changes.</p>}</main></div></section>}
    {messageOpen && detail && <CommitMessage message={detail.message} close={() => setMessageOpen(false)} />}
    {dialog && <BranchDialog key={`${dialog.kind}:${dialog.branch}`} value={dialog} current={data.branch} branches={data.refs} close={() => setDialog(null)} submit={async (name, from) => {
      const action: Action = dialog.kind === "create" || dialog.kind === "track" ? { kind: "branch-create", name, from, track: dialog.kind === "track" } : dialog.kind === "rename" ? { kind: "branch-rename", branch: dialog.branch, name } : { kind: dialog.kind === "delete" ? "branch-delete" : "merge", branch: dialog.branch };
      await start(action); setDialog(null);
    }} />}
  </div>;
}

function CommitMessage({ message, close }: { message: string; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = dialog.current!; element.showModal(); return () => element.close(); }, []);
  return <dialog ref={dialog} className="git-credential" aria-label="Commit message" onCancel={close}><h2>Commit message</h2><p className="git-commit-body">{message}</p><div className="git-credential-actions"><button autoFocus onClick={close}>Close</button></div></dialog>;
}

export function ActionsMenu({ label, actions, children }: { label: string; actions: { label: string; disabled?: boolean; run: () => void }[]; children?: ReactNode }) {
  const id = useId(), trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  return <><button ref={trigger} className="git-icon-button" popoverTarget={id} aria-expanded={open} aria-label={label} title={label}><Glyph name="more" /></button><div id={id} ref={menu} popover="auto" className="git-row-menu" aria-label={label} onToggle={(e) => {
    setOpen(e.newState === "open");
    if (e.newState !== "open" || !trigger.current) return;
    const anchor = trigger.current.getBoundingClientRect(), box = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.left = `${Math.max(8, Math.min(anchor.right - box.width, window.innerWidth - box.width - 8))}px`;
    e.currentTarget.style.top = `${Math.max(8, Math.min(anchor.bottom + 4, window.innerHeight - box.height - 8))}px`;
    e.currentTarget.querySelector<HTMLElement>("button:not(:disabled), select:not(:disabled)")?.focus();
  }} onKeyDown={(e) => {
    if (e.target instanceof HTMLSelectElement || !["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), select:not(:disabled)")], index = items.indexOf(document.activeElement as HTMLElement);
    items[e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (index + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  }}>{children}{actions.map((action) => <button key={action.label} disabled={action.disabled} onClick={() => { menu.current?.hidePopover(); action.run(); }}>{action.label}</button>)}</div></>;
}

function RevisionFiles({ detail, file, choose, query, setQuery, tree, setTree }: { detail: Inspection | null; file: Inspection["files"][number] | null; choose: (file: Inspection["files"][number]) => void; query: string; setQuery: (query: string) => void; tree: boolean; setTree: (tree: boolean) => void }) {
  const files = (detail?.files || []).filter((f) => `${f.path} ${f.original || ""}`.toLowerCase().includes(query.toLowerCase()));
  function row(f: Inspection["files"][number]) {
    return <button key={f.path} data-selected={file?.path === f.path} aria-pressed={file?.path === f.path} title={f.original ? `${f.original} → ${f.path}` : f.path} onClick={() => choose(f)}><span className={`git-change-${f.status[0]}`}>{f.status[0]}</span><span>{f.path.split("/").pop()}{!tree && <small>{f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : ""}</small>}</span></button>;
  }
  function folders(items: typeof files, prefix = ""): ReactNode {
    const dirs = [...new Set(items.filter((f) => f.path.slice(prefix.length).includes("/")).map((f) => f.path.slice(prefix.length).split("/")[0]))].sort();
    return <>{dirs.map((dir) => <details key={prefix + dir} open className="git-file-folder"><summary title={prefix + dir}>{dir}</summary>{folders(items.filter((f) => f.path.startsWith(prefix + dir + "/")), prefix + dir + "/")}</details>)}{items.filter((f) => !f.path.slice(prefix.length).includes("/")).map(row)}</>;
  }
  return <section className="git-revision-file-pane" aria-label="Changed files"><div className="git-pane-heading"><strong>Files</strong><span>{query ? `${files.length} / ` : ""}{detail?.files.length ?? 0}</span></div><div className="git-files-tools"><input aria-label="Filter files" placeholder="Filter files…" value={query} onChange={(e) => setQuery(e.target.value)} /><div role="group" aria-label="File view"><button aria-pressed={!tree} onClick={() => setTree(false)}>List</button><button aria-pressed={tree} onClick={() => setTree(true)}>Tree</button></div></div><div className="git-revision-files">{files.length ? tree ? folders(files) : files.map(row) : <p className="git-muted">{detail?.files.length ? "No matching files." : "No file changes."}</p>}</div></section>;
}

function BranchRow({ branch, selected, favorite, favoriteRow, busy, current, canMerge, canCompare, choose, checkout, toggleFavorite, compare, create, rename, remove, merge }: {
  branch: Branch; selected: boolean; favorite: boolean; favoriteRow: boolean; busy: boolean; current: string; canMerge: boolean; canCompare: boolean;
  choose: () => void; checkout: () => void; toggleFavorite: () => void; compare: () => void; create: () => void; rename: () => void; remove: () => void; merge: () => void;
}) {
  return <div className="git-tree-row" data-selected={selected}>
    <button className="git-tree-name" aria-pressed={selected} title={`${branch.name}${branch.upstream ? ` → ${branch.upstream}` : ""}${branch.worktree ? `\nCheckout: ${branch.worktree}` : ""}`} onClick={choose}>
      <span className="git-branch-symbol" data-current={branch.current}><Glyph name={favorite ? "star" : branch.current ? "head" : "branch"} filled={favorite} /></span><span>{branch.remote && !favoriteRow ? branch.name.slice(branch.remote.length + 1) : branch.name}</span>{branch.current && <small>HEAD</small>}
    </button>
    <div className="git-tree-actions"><button aria-label={`Create branch from ${branch.name}`} title={`New branch from ${branch.name}…`} disabled={busy} onClick={create}><Glyph name="plus" /></button><ActionsMenu label={`Actions for ${branch.name}`} actions={[
      { label: branch.remote ? "Checkout as local branch…" : "Checkout", disabled: busy || branch.current || !!branch.worktree, run: checkout },
      { label: "Create branch from here…", disabled: busy, run: create },
      ...(!branch.current ? [{ label: `Merge into ${current}…`, disabled: busy || !canMerge, run: merge }, { label: "Compare with HEAD", disabled: !canCompare, run: compare }] : []),
      ...(!branch.remote ? [{ label: "Rename…", disabled: busy || !!branch.worktree && !branch.current, run: rename }, { label: "Delete local branch…", disabled: busy || branch.current || !!branch.worktree, run: remove }] : []),
      { label: favorite ? "Remove from favorites" : "Add to favorites", run: toggleFavorite },
    ]} /></div>
  </div>;
}

function BranchDialog({ value, current, branches, close, submit }: { value: { kind: string; branch: string; name: string }; current: string; branches: Branch[]; close: () => void; submit: (name: string, from: string) => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(value.name), [from, setFrom] = useState(value.branch), [pending, setPending] = useState(false), [error, setError] = useState("");
  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close(); }, []);
  const editable = ["create", "track", "rename"].includes(value.kind);
  const title = value.kind === "create" ? "New branch" : value.kind === "track" ? "Checkout remote branch" : value.kind === "rename" ? "Rename branch" : value.kind === "delete" ? "Delete local branch?" : `Merge into ${current}`;
  return <dialog ref={dialog} className="git-credential" aria-label={title} onCancel={(e) => { if (pending) e.preventDefault(); else close(); }}><form onSubmit={(e) => { e.preventDefault(); if (pending) return; setPending(true); setError(""); void submit(name.trim(), from).catch((e) => setError(errorText(e))).finally(() => setPending(false)); }}><h2>{title}</h2>{value.kind !== "create" && <p className="git-prompt">{value.branch.replace(/^refs\/(heads|remotes)\//, "")}</p>}{editable && <><label htmlFor="git-branch-name">Local branch name</label><input id="git-branch-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} disabled={pending} required maxLength={255} placeholder="feature/new-branch" /></>}
    {value.kind === "create" && <><label htmlFor="git-branch-from">Create from</label><select id="git-branch-from" value={from} onChange={(e) => setFrom(e.target.value)} disabled={pending}>
      <option value="HEAD">HEAD — {current}</option>
      {value.branch !== "HEAD" && !branches.some((b) => b.ref === value.branch) && <option value={value.branch}>Commit {value.branch.slice(0, 8)}</option>}
      <optgroup label="Local branches">{branches.filter((b) => !b.remote).map((b) => <option key={b.ref} value={b.ref}>{b.name}</option>)}</optgroup>
      <optgroup label="Remote branches">{branches.filter((b) => b.remote).map((b) => <option key={b.ref} value={b.ref}>{b.name}</option>)}</optgroup>
    </select></>}
    <p className="git-muted">{value.kind === "delete" ? "Git will only delete the branch if its commits have been merged. The remote branch will remain on the server." : value.kind === "merge" ? "The selected branch will be merged into the current branch. If conflicts occur, you can complete or abort the merge in Changes." : value.kind === "track" ? "A local tracking branch will be created and checked out." : value.kind === "create" ? "A branch will be created from the selected revision and checked out." : "The new name applies to the local branch."}</p>
    {error && <p className="git-error" role="alert">{error}</p>}
    <div className="git-credential-actions"><button type="button" autoFocus={!editable} onClick={close} disabled={pending}>Cancel</button><button className="git-primary" disabled={pending || editable && !name.trim()}>{pending ? "Starting…" : value.kind === "delete" ? "Delete" : value.kind === "merge" ? "Merge" : value.kind === "rename" ? "Rename" : "Create and checkout"}</button></div></form></dialog>;
}
