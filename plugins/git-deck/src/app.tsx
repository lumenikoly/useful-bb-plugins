import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { definePluginApp, experimental_Diff as Diff, experimental_Icon as Icon, useBbContext, useRpc, type PluginThreadPanelProps } from "@get-bb/plugin-sdk/app";
import type { Action, Change, Job, Snapshot, Target, rpcContract } from "./contracts.ts";
import "./app.css";
import { GitLog, Glyph } from "./log.tsx";
import { FixChatSetup, GithubAccount, GithubChecks } from "./github-ui.tsx";

type Rpc = ReturnType<typeof useRpc<typeof rpcContract>>;
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
const staged = (c: Change) => c.index !== " " && c.index !== "?";
const unstaged = (c: Change) => c.worktree !== " " && c.worktree !== undefined;
const statusText = (c: Change) => c.conflict ? "Conflict" : c.index === "?" ? "New" : (c.index + c.worktree).includes("D") ? "Deleted" : c.original ? "Renamed" : (c.index + c.worktree).includes("A") ? "Added" : "Modified";
const readSaved = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const save = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* optional preference */ } };

function GitPage({ threadId: panelThreadId }: { threadId?: string }) {
  const rpc = useRpc<typeof rpcContract>();
  const context = useBbContext();
  const threadId = panelThreadId ?? context.threadId ?? undefined;
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectId, setProjectId] = useState(context.projectId ?? readSaved("bb-git-deck-project") ?? "");
  const [targets, setTargets] = useState<Target[]>([]);
  const [targetId, setTargetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let current = true;
    void rpc.call("projects").then((result) => {
      if (!current) return;
      setProjects(result);
      setProjectId((id) => result.some((p) => p.id === id) ? id : result[0]?.id ?? "");
      setLoading(false);
    }, (e) => { if (current) { setError(errorText(e)); setLoading(false); } });
    return () => { current = false; };
  }, [rpc, revision]);
  useEffect(() => {
    if (!projectId) return;
    let current = true;
    setLoading(true); setError(""); setTargets([]); setTargetId("");
    save("bb-git-deck-project", projectId);
    void rpc.call("targets", { projectId, ...(threadId ? { threadId } : {}) }).then((result) => {
      if (!current) return;
      setTargets(result);
      const remembered = readSaved(`bb-git-deck-target:${projectId}`);
      setTargetId(!threadId && result.some((t) => t.id === remembered) ? remembered! : result[0]?.id ?? "");
      setLoading(false);
    }, (e) => { if (current) { setError(errorText(e)); setLoading(false); } });
    return () => { current = false; };
  }, [rpc, projectId, threadId, revision]);
  const target = targets.find((t) => t.id === targetId);
  return <div className="git-page">
    <div className="git-context">
      <Icon name="GitBranch" className="git-icon" /><strong>Git Deck</strong>
      <select aria-label="Project" value={projectId} disabled={busy} onChange={(e) => setProjectId(e.target.value)}>
        {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <select aria-label="Checkout" value={targetId} disabled={busy || !targets.length} onChange={(e) => { setTargetId(e.target.value); save(`bb-git-deck-target:${projectId}`, e.target.value); }}>
        {targets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
      </select>
    </div>
    {error && <div className="git-error" role="alert">{error} <button onClick={() => setRevision((v) => v + 1)}>Retry</button></div>}
    {target ? <Repository key={`${projectId}:${target.id}`} rpc={rpc} target={target} threadId={threadId} onBusy={setBusy} />
      : <div className="git-empty" role="status">{loading ? "Loading checkout…" : projects.length ? "This project has no available Git checkout. Add a repository path in project settings." : "Add a Git project to BB to get started."}</div>}
  </div>;
}

function Repository({ rpc, target, threadId, onBusy }: { rpc: Rpc; target: Target; threadId?: string; onBusy: (busy: boolean) => void }) {
  const input = { projectId: target.projectId, targetId: target.id };
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [remote, setRemote] = useState("");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [file, setFile] = useState<{ path: string; staged: boolean } | null>(null);
  const [patch, setPatch] = useState<string | null>(null);
  const [diffError, setDiffError] = useState("");
  const [diffView, setDiffView] = useState<"unified" | "split">("split");
  const [tab, setTab] = useState<"diff" | "history" | "checks" | "account">("history");

  const alive = useRef(true), request = useRef(0);
  const messageId = useId();
  const panelId = useId();
  const busy = starting || job?.state === "running";
  useEffect(() => { onBusy(busy); return () => onBusy(false); }, [busy, onBusy]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; request.current++; }; }, []);
  const refresh = useCallback(async () => {
    const revision = ++request.current;
    try {
      const next = await rpc.call("snapshot", { projectId: target.projectId, targetId: target.id });
      if (!alive.current || revision !== request.current) return;
      setData(next);
      setFile((current) => {
        if (!current) return null;
        const change = next.changes.find((c) => c.path === current.path);
        if (!change) return null;
        const side = current.staged ? staged(change) : unstaged(change);
        return side ? current : { path: current.path, staged: staged(change) };
      });
      setRemote((value) => next.remotes.some((r) => r.name === value) ? value : next.remotes.find((r) => next.upstream.startsWith(`${r.name}/`))?.name ?? next.remotes.find((r) => r.name === "origin")?.name ?? next.remotes[0]?.name ?? "");
      if (next.activeJob) {
        const active = await rpc.call("job", { projectId: target.projectId, targetId: target.id, jobId: next.activeJob });
        if (alive.current && revision === request.current) setJob(active);
      }
    } catch (e) { if (alive.current && revision === request.current) setError(errorText(e)); }
  }, [rpc, target.projectId, target.id]);
  useEffect(() => {
    void refresh();
    const focus = () => { void refresh(); };
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [refresh]);
  useEffect(() => {
    if (!job || job.state !== "running") return;
    let current = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await rpc.call("job", { ...input, jobId: job.id });
        if (!current) return;
        setJob(next);
        if (next.state !== "running") {
          setSelected(new Set());
          if (next.state === "done" && next.kind === "commit") setMessage("");
          await refresh();
          return;
        }
      } catch (e) {
        if (current) {
          setError(errorText(e));
          if (errorText(e).includes("Operation not found")) {
            setJob({ ...job, state: "failed", prompt: null, output: "Connection to the operation was lost. Check Git status before trying again." });
            await refresh();
            return;
          }
        }
      }
      if (current) timer = setTimeout(poll, 800);
    };
    void poll();
    return () => { current = false; clearTimeout(timer); };
  }, [rpc, target.projectId, target.id, job?.id, job?.state, refresh]);
  useEffect(() => {
    if (!file) return;
    let current = true;
    setPatch(null); setDiffError("");
    void rpc.call("diff", { ...input, pathspec: file.path, staged: file.staged }).then((result) => {
      if (current) setPatch(result.patch);
    }, (e) => { if (current) setDiffError(errorText(e)); });
    return () => { current = false; };
  }, [rpc, target.projectId, target.id, file, data]);
  async function start(action: Action) {
    if (busy) return;
    setStarting(true); setError("");
    try {
      const next = await rpc.call("start", { ...input, action });
      if (alive.current) setJob(next);
    } catch (e) { if (alive.current) setError(errorText(e)); }
    finally { if (alive.current) setStarting(false); }
  }
  async function cancel() {
    if (!job) return;
    try { await rpc.call("cancel", { ...input, jobId: job.id }); } catch (e) { setError(errorText(e)); }
  }
  const toggle = (key: string) => setSelected((previous) => { const next = new Set(previous); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const showFile = (path: string, isStaged: boolean) => { setFile({ path, staged: isStaged }); setTab("diff"); };
  if (!data) return <div className="git-empty" role="status">{error ? <><p className="git-error" role="alert">{error}</p><button onClick={() => { setError(""); void refresh(); }}>Retry</button></> : "Loading Git status…"}</div>;
  const index = data.changes.filter((c) => staged(c) && !c.conflict);
  const working = data.changes.filter((c) => unstaged(c) && !c.conflict);
  const conflicts = data.changes.filter((c) => c.conflict);
  const group = (title: string, changes: Change[], isStaged: boolean) => {
    const key = isStaged ? "index:" : "worktree:";
    const paths = changes.filter((c) => selected.has(key + c.path)).map((c) => c.path);
    return <section className="git-file-group">
      <div className="git-group-heading"><strong>{title} <span>{changes.length}</span></strong>
        <button disabled={busy || !changes.length} onClick={() => setSelected((previous) => {
          const next = new Set(previous), all = changes.every((c) => next.has(key + c.path));
          for (const c of changes) { if (all) next.delete(key + c.path); else next.add(key + c.path); }
          return next;
        })}>{changes.length && paths.length === changes.length ? "Deselect all" : "Select all"}</button>
      </div>
      {changes.length ? <ul>{changes.map((c) => <li key={c.path} data-selected={file?.path === c.path && file.staged === isStaged}>
        <input type="checkbox" aria-label={`Select ${c.path} (${title})`} checked={selected.has(key + c.path)} disabled={busy} onChange={() => toggle(key + c.path)} />
        <button className="git-file" onClick={() => showFile(c.path, isStaged)} title={c.original ? `${c.original} → ${c.path}` : c.path}>
          <span className="git-file-status" title={statusText(c)}>{c.index === "?" ? "?" : isStaged ? c.index : c.worktree}</span><span>{c.path}</span>
        </button>
      </li>)}</ul> : <p className="git-muted">{isStaged ? "Stage files to include them in the commit." : "Working directory is clean."}</p>}
      {!!changes.length && <button className="git-stage" disabled={busy || !paths.length} onClick={() => void start({ kind: isStaged ? "unstage" : "stage", paths })}>
        {isStaged ? "Unstage" : "Stage"}{paths.length ? ` · ${paths.length}` : ""}
      </button>}
    </section>;
  };
  return <>
    <div className="git-toolbar">
      <span className="git-current-branch"><Icon name="GitBranch" className="git-icon" /><strong>{data.branch}</strong></span>
      <span className="git-tracking" title={data.upstream || "No upstream"}>{data.upstream || "No upstream"}{data.upstream ? ` · ↑${data.ahead} ↓${data.behind}` : ""}</span>
      <select aria-label="Remote for Fetch and Push" value={remote} disabled={busy || !data.remotes.length} onChange={(e) => setRemote(e.target.value)}>{data.remotes.map((r) => <option key={r.name}>{r.name}</option>)}</select>
      <button className="git-icon-button" aria-label="Fetch" title="Fetch — get changes from remote" disabled={busy || !remote} onClick={() => void start({ kind: "fetch", remote })}><Glyph name="fetch" /></button>
      <button className="git-icon-button" aria-label="Pull" disabled={busy || !data.upstream} title="Pull — update current branch (fast-forward)" onClick={() => void start({ kind: "pull" })}><Glyph name="pull" /></button>
      <button className="git-icon-button" aria-label="Push" title="Push — push current branch" disabled={busy || !remote || data.unborn} onClick={() => void start({ kind: "push", remote })}><Glyph name="push" /></button>
      <button className="git-icon-button" aria-label="Refresh Git status" title="Refresh Git status" onClick={() => { setError(""); void refresh(); }}><Glyph name="refresh" /></button>
      <span className="git-toolbar-divider" aria-hidden="true" />
      <button className="git-icon-button git-settings-button" aria-label="Account and SSH" title="Account and SSH" aria-pressed={tab === "account"} onClick={() => setTab((current) => current === "account" ? "history" : "account")}><Glyph name="settings" /></button>
    </div>
    {error && <p role="alert" className="git-error">{error}<button aria-label="Dismiss error" onClick={() => setError("")}>Close</button></p>}
        <div className="git-tabs" role="tablist" aria-label="Git views">{(["history", "diff", "checks"] as const).map((id, i, tabs) => <button key={id} id={`${panelId}-${id}`} role="tab" tabIndex={tab === id || tab === "account" && id === "history" ? 0 : -1} aria-selected={tab === id} onClick={() => setTab(id)} onKeyDown={(e) => {
          const next = e.key === "ArrowRight" ? (i + 1) % tabs.length : e.key === "ArrowLeft" ? (i + tabs.length - 1) % tabs.length : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : null;
          if (next === null) return;
          e.preventDefault(); setTab(tabs[next]); (e.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
        }}>{id === "diff" ? `Changes · ${data.changes.length}` : id === "checks" ? "Checks" : "Log"}</button>)}</div>
    {data.merging && <div className="git-merge-banner"><strong>Merge in progress</strong><span>{conflicts.length ? `Conflicts: ${conflicts.length}. Resolve the files and stage them.` : "Conflicts resolved. Complete the merge."}</span><button onClick={() => setTab("diff")}>Open Changes</button><button disabled={busy || !!conflicts.length} onClick={() => void start({ kind: "merge-continue" })}>Complete merge</button><button disabled={busy} onClick={() => void start({ kind: "merge-abort" })}>Abort merge</button></div>}
    <div className="git-log-tab" hidden={tab !== "history"}><GitLog rpc={rpc} target={target} data={data} busy={busy} start={start} /></div>
    {tab === "checks" && <GithubChecks key={remote} rpc={rpc} target={target} remote={remote} revision={`${data.branch}:${data.history[0]?.hash || ""}`} threadId={threadId} openAccount={() => setTab("account")} />}
    {tab === "account" && <div className="git-account-scroll"><Account key={JSON.stringify(data.config) + JSON.stringify(data.remotes)} data={data} busy={busy} start={start} rpc={rpc} target={target} githubRemote={remote} /></div>}
    <div className="git-workspace" hidden={tab !== "diff"}>

      <aside className="git-changes">
        <div className="git-file-lists">
          {!!conflicts.length && <section className="git-conflicts"><strong>Resolve conflicts · {conflicts.length}</strong><p>Resolve the files, then stage them.</p>{conflicts.map((c) => <div key={c.path}><button className="git-file" onClick={() => showFile(c.path, false)}>{c.path}</button><button disabled={busy} onClick={() => void start({ kind: "stage", paths: [c.path] })}>Stage</button></div>)}</section>}
          {group("Changes", working, false)}{group("Stage", index, true)}
        </div>
        <form className="git-commit" onSubmit={(e) => { e.preventDefault(); void start({ kind: "commit", message }); }}>
          <label htmlFor={messageId}>Commit message</label>
          <textarea id={messageId} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What changed and why?" disabled={busy} rows={4} maxLength={65536} />
          <div className="git-commit-footer"><button type="button" className="git-identity" onClick={() => setTab("account")} title={`${data.config.name} <${data.config.email}>`}>{data.config.name || "Set up author"}</button><button className="git-primary" disabled={busy || !message.trim() || !index.length || !!conflicts.length}>Commit · {index.length}</button></div>
        </form>
      </aside>
      <main className="git-inspector">
        <div className="git-inspector-content">
          {tab === "diff" && (file ? <><div className="git-diff-heading"><span title={file.path}>{file.path} <small>{file.staged ? "stage" : "working tree"}</small></span><button aria-pressed={diffView === "split"} onClick={() => setDiffView((v) => v === "split" ? "unified" : "split")}>{diffView === "split" ? "Side by side" : "Unified"}</button></div>
            {diffError ? <p className="git-error" role="alert">{diffError}</p> : patch === null ? <p className="git-empty">Loading diff…</p> : patch ? <Diff patch={patch} path={file.path} view={diffView} /> : <p className="git-empty">No text changes.</p>}
          </> : <div className="git-empty"><Icon name="FileDiff" className="git-empty-icon" /><p>Select a file to view its changes.</p></div>)}

        </div>
      </main>
    </div>
    {job && <div className="git-operation" aria-live="polite"><div><strong>{job.state === "running" ? `${job.kind}: ${job.prompt ? "waiting for input" : "running…"}` : job.state === "done" ? `${job.kind}: done` : job.state === "cancelled" ? "Operation cancelled" : `${job.kind}: failed`}</strong>{job.state === "running" ? <button onClick={() => void cancel()}>Cancel</button> : <button onClick={() => setJob(null)}>Close</button>}</div>{job.output && <pre>{job.output}</pre>}</div>}
    {job?.prompt && <Credential key={job.prompt.id} job={job} answer={async (value) => { await rpc.call("answer", { ...input, jobId: job.id, promptId: job.prompt!.id, value }); }} cancel={cancel} />}
  </>;
}

function Account({ data, busy, start, rpc, target, githubRemote }: { data: Snapshot; busy: boolean; start: (action: Action) => Promise<void>; rpc: Rpc; target: Target; githubRemote: string }) {
  const [name, setName] = useState(data.config.localName), [email, setEmail] = useState(data.config.localEmail), [sshCommand, setSshCommand] = useState(data.config.localSshCommand);
  const [remote, setRemote] = useState(data.remotes[0]?.name ?? ""), [url, setUrl] = useState(data.remotes[0]?.url ?? "");
  const id = useId();
  return <div className="git-account">
    <h2>Project account</h2><p className="git-muted">Settings are saved in this repository’s Git config and apply to its worktrees. Empty fields inherit system settings.</p>
    <form onSubmit={(e) => { e.preventDefault(); void start({ kind: "account", name, email, sshCommand }); }}>
      <fieldset disabled={busy}>
        <label htmlFor={`${id}-name`}>Author name</label><input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} placeholder={data.config.name || "user.name"} maxLength={4096} />
        <label htmlFor={`${id}-email`}>Author email</label><input id={`${id}-email`} value={email} onChange={(e) => setEmail(e.target.value)} placeholder={data.config.email || "user.email"} maxLength={4096} />
        <label htmlFor={`${id}-ssh`}>SSH command <span className="git-muted">optional</span></label><input id={`${id}-ssh`} value={sshCommand} onChange={(e) => setSshCommand(e.target.value)} placeholder={data.config.sshCommand || "System SSH and ~/.ssh/config"} maxLength={4096} />
        <p className="git-muted">For a specific key: <code>ssh -i ~/.ssh/id_work -o IdentitiesOnly=yes</code>. To use an SSH alias, leave this field empty and use the alias in the remote URL.</p>
        <button className="git-primary">Save account</button>
      </fieldset>
    </form>
    <h2>Remote</h2>
    {data.remotes.length ? <form onSubmit={(e) => { e.preventDefault(); void start({ kind: "remote", remote, url }); }}><fieldset disabled={busy}>
      <label htmlFor={`${id}-remote`}>Remote</label><select id={`${id}-remote`} value={remote} onChange={(e) => { setRemote(e.target.value); setUrl(data.remotes.find((r) => r.name === e.target.value)?.url ?? ""); }}>{data.remotes.map((r) => <option key={r.name}>{r.name}</option>)}</select>
      <label htmlFor={`${id}-url`}>URL</label><input id={`${id}-url`} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="git@github-work:team/repo.git" maxLength={4096} />
      {data.remotes.find((r) => r.name === remote)?.pushUrl !== data.remotes.find((r) => r.name === remote)?.url && <p className="git-muted">Separate push URL: <code>{data.remotes.find((r) => r.name === remote)?.pushUrl}</code>. Change it using <code>git remote set-url --push</code>.</p>}
      {/^https?:/i.test(data.remotes.find((r) => r.name === remote)?.pushUrl || "") && <p className="git-muted">Push uses HTTPS, so the SSH command and key do not apply. To use SSH, enter a URL such as <code>git@github.com:owner/repo.git</code> or your SSH alias.</p>}
      <button disabled={!url.trim()}>Save URL</button>
    </fieldset></form> : <p className="git-muted">No remotes yet. Add one using <code>git remote add origin &lt;url&gt;</code>.</p>}
    <p className="git-muted">Git and SSH run on the checkout’s host, using its SSH config, known_hosts, ssh-agent and credential helpers. Passwords and passphrases are entered on request and are not stored by the plugin.</p>
    <GithubAccount key={githubRemote} rpc={rpc} target={target} remote={githubRemote} />
  </div>;
}

function Credential({ job, answer, cancel }: { job: Job; answer: (value: string) => Promise<void>; cancel: () => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState(""), [error, setError] = useState(""), [pending, setPending] = useState(false);
  const id = useId(), prompt = job.prompt!;
  useEffect(() => { const element = dialog.current!; element.showModal(); return () => element.close(); }, []);
  async function submit(e: FormEvent) {
    e.preventDefault(); setPending(true); setError("");
    try { await answer(value); setValue(""); } catch (e) { setError(errorText(e)); setPending(false); }
  }
  return <dialog ref={dialog} className="git-credential" aria-labelledby={`${id}-title`} onCancel={(e) => { e.preventDefault(); void cancel(); }}>
    <form onSubmit={(e) => void submit(e)}><h2 id={`${id}-title`}>{prompt.confirm ? "SSH confirmation" : prompt.secret ? "Git / SSH: password" : "Git: username"}</h2>
      <p className="git-prompt">{prompt.text}</p>
      <label htmlFor={`${id}-input`}>{prompt.confirm ? "Answer: yes / no or fingerprint" : prompt.secret ? "Password or passphrase" : "Answer"}</label>
      <input id={`${id}-input`} autoFocus autoComplete="off" type={prompt.secret ? "password" : "text"} value={value} onChange={(e) => setValue(e.target.value)} disabled={pending} maxLength={8192} />
      {error && <p role="alert" className="git-error">{error}</p>}
      <div className="git-credential-actions"><button type="button" onClick={() => { setValue(""); void cancel(); }}>Cancel operation</button><button className="git-primary" disabled={pending || !value}>Continue</button></div>
    </form>
  </dialog>;
}

export default definePluginApp((app) => {
  app.composer.customize({ id: "git-deck-fix", scopes: ["new-thread"], banners: [{ id: "git-deck-fix-context", chrome: "bare", component: FixChatSetup }] });
  app.slots.navPanel({ id: "git-deck", title: "Git Deck", icon: "GitBranch", path: "git-deck", component: () => <GitPage /> });
  app.slots.threadPanelAction({ id: "git-deck", title: "Git Deck", icon: "GitBranch", component: ({ threadId }: PluginThreadPanelProps) => <GitPage threadId={threadId} />, run: ({ openPanel }) => { openPanel({ title: "Git Deck" }); } });
});
