import { useCallback, useEffect, useId, useRef, useState } from "react";
import { experimental_Icon as Icon, experimental_NewThreadComposer as NewThreadComposer, useBbNavigate, useComposers, useRpc, useSdk } from "@get-bb/plugin-sdk/app";
import type { GithubDetail, GithubRun, GithubState, Target, rpcContract } from "./contracts.ts";
import { Glyph } from "./log.tsx";

type Rpc = ReturnType<typeof useRpc<typeof rpcContract>>;
const errorText = (e: unknown) => e instanceof Error ? e.message : String(e);
const failing = (s: string) => ["failure", "timed_out", "action_required", "startup_failure"].includes(s);
const status = (s: string, conclusion: string) => (conclusion || s).replaceAll("_", " ");
const date = (s: string) => new Date(s).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

function useGithub(rpc: Rpc, target: Target, remote: string) {
  const [data, setData] = useState<GithubState | null>(null), [error, setError] = useState(""), [pending, setPending] = useState(false);
  const generation = useRef(0), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; generation.current++; }; }, []);
  const refresh = useCallback(async () => {
    const ticket = ++generation.current;
    setPending(true); setError("");
    try {
      const result = await rpc.call("github", { projectId: target.projectId, targetId: target.id, remote });
      if (alive.current && generation.current === ticket) setData(result);
    } catch (e) { if (alive.current && generation.current === ticket) setError(errorText(e)); }
    finally { if (alive.current && generation.current === ticket) setPending(false); }
  }, [rpc, target.projectId, target.id, remote]);
  useEffect(() => { setData(null); if (remote) void refresh(); }, [refresh, remote]);
  return { data, error, pending, refresh };
}

function Status({ state, conclusion }: { state: string; conclusion: string }) {
  const value = conclusion || state;
  return <span className="git-check-status" data-status={failing(value) ? "failure" : value === "success" ? "success" : state === "completed" ? "neutral" : "pending"}>
    <Icon className="git-icon" name={failing(value) ? "CircleX" : value === "success" ? "CircleCheck" : state === "completed" ? "CircleMinus" : "Clock"} />{status(state, conclusion)}
  </span>;
}

export function GithubAccount({ rpc, target, remote }: { rpc: Rpc; target: Target; remote: string }) {
  const { data, error, pending, refresh } = useGithub(rpc, target, remote);
  const [saving, setSaving] = useState(false), [saveError, setSaveError] = useState("");
  const id = useId();
  return <section className="git-github-account"><h2>GitHub account</h2>
    <p className="git-muted">Checks use GitHub CLI on this checkout’s host. Choose an account for this repository; Git and SSH settings are independent.</p>
    {!remote ? <p className="git-muted">Add a GitHub remote to use Checks.</p> : <>
      {data && <><label htmlFor={id}>Account · {data.hostname || "GitHub"}</label><select id={id} value={data.account} disabled={saving || pending || !data.installed} onChange={async (e) => {
        const login = e.target.value;
        setSaving(true); setSaveError("");
        try { await rpc.call("githubAccount", { projectId: target.projectId, targetId: target.id, login }); await refresh(); }
        catch (e) { setSaveError(errorText(e)); } finally { setSaving(false); }
      }}><option value="">Use gh default{data.activeAccount ? ` (${data.activeAccount})` : ""}</option>
        {data.account && !data.accounts.some((a) => a.login === data.account) && <option value={data.account}>{data.account} · sign in required</option>}
        {data.accounts.map((a) => <option key={a.login} value={a.login}>{a.login}{a.state === "success" ? "" : " · check authentication"}</option>)}
      </select></>}
      {(error || saveError || data?.error) && <p className="git-error" role="alert">{saveError || error || data?.error}</p>}
      <p className="git-muted">{data?.installed === false ? <>Install <code>gh</code> on the checkout’s host, then sign in with </> : <>To add or reconnect an account, run </>}<code>gh auth login{data?.hostname && data.hostname !== "github.com" ? ` --hostname ${data.hostname}` : ""}</code> in that host’s terminal. Tokens stay in gh’s credential storage.</p>
      <button disabled={pending || saving} onClick={() => void refresh()}>{pending ? "Checking connection…" : "Check connection"}</button>
    </>}
  </section>;
}

export function GithubChecks({ rpc, target, remote, revision, threadId, openAccount }: { rpc: Rpc; target: Target; remote: string; revision: string; threadId?: string; openAccount: () => void }) {
  const { data, error, pending, refresh } = useGithub(rpc, target, remote);
  const [selected, setSelected] = useState<number | null>(null), [detail, setDetail] = useState<GithubDetail | null>(null), [detailError, setDetailError] = useState("");
  const [detailRevision, setDetailRevision] = useState(0);
  const [logs, setLogs] = useState<{ text: string; truncated: boolean } | null>(null), [logJob, setLogJob] = useState<number | null>(null);
  const [operation, setOperation] = useState<"logs" | "fix" | null>(null), [actionError, setActionError] = useState("");
  const [fix, setFix] = useState<{ prompt: string; branch: string; head: string } | null>(null);
  const [fixJob, setFixJob] = useState<number | null>(null);
  const ticket = useRef(0), alive = useRef(true), operationTicket = useRef(0);
  const navigate = useBbNavigate(), sdk = useSdk(), composers = useComposers();
  const currentComposer = composers.find((c) => c.scope.kind === "thread" && c.scope.threadId === threadId);
  const input = { projectId: target.projectId, targetId: target.id, remote };
  const previousRevision = useRef(revision);
  useEffect(() => { if (previousRevision.current !== revision) { previousRevision.current = revision; setFix(null); void refresh(); } }, [revision, refresh]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; ticket.current++; operationTicket.current++; }; }, []);
  useEffect(() => {
    if (data) setSelected((id) => data.runs.some((r) => r.databaseId === id) ? id : data.runs.find((r) => r.headSha === data.head && failing(r.conclusion))?.databaseId ?? data.runs[0]?.databaseId ?? null);
  }, [data]);
  const run = data?.runs.find((r) => r.databaseId === selected);
  useEffect(() => {
    const n = ++ticket.current; operationTicket.current++;
    setDetail(null); setDetailError(""); setActionError(""); setLogs(null); setFix(null); setOperation(null);
    if (!run) return;
    void rpc.call("githubRun", { ...input, runId: run.databaseId }).then((d) => {
      if (alive.current && n === ticket.current) setDetail(d);
    }, (e) => { if (alive.current && n === ticket.current) setDetailError(errorText(e)); });
  }, [rpc, target.projectId, target.id, remote, run?.databaseId, run?.attempt, run?.status, run?.conclusion, detailRevision]);
  async function diagnostics(kind: "logs" | "fix", jobId: number | null) {
    if (!detail || !data || operation) return;
    const n = ++operationTicket.current;
    setOperation(kind); setActionError("");
    try {
      const args = { ...input, runId: detail.run.databaseId, jobId, attempt: detail.run.attempt };
      if (kind === "logs") {
        const result = await rpc.call("githubLogs", args);
        if (alive.current && n === operationTicket.current) { setLogs(result); setLogJob(jobId); setFix(null); }
      } else {
        const result = await rpc.call("githubFix", { ...args, head: data.head });
        if (alive.current && n === operationTicket.current) { setFix(result); setFixJob(jobId); setLogs(null); }
      }
    } catch (e) { if (alive.current && n === operationTicket.current) setActionError(errorText(e)); }
    finally { if (alive.current && n === operationTicket.current) setOperation(null); }
  }
  const current = !!detail && !!data && !!data.head && detail.run.headBranch === data.branch;
  const runs = data?.runs ?? [];
  const failures = runs.filter((r) => r.headSha === data?.head && failing(r.conclusion)).length;
  const connectionError = error || data?.error;
  return <div className="git-checks-shell">
    <div className="git-checks-toolbar"><Icon name="Github" className="git-icon" /><strong>{data?.repository || "GitHub Actions"}</strong>
      {data?.branch && <span className="git-muted">{data.branch}</span>}{failures > 0 && <span className="git-check-failures">{failures} failed</span>}
      <span className="git-checks-toolbar-spacer" />
      <button className="git-icon-button" aria-label="GitHub account settings" title={`GitHub account: ${data?.account || data?.activeAccount || "gh default"}`} onClick={openAccount}><Glyph name="settings" /></button>
      <button className="git-icon-button" aria-label="Refresh checks" title="Refresh checks" disabled={pending || !remote || !!operation} onClick={() => { setDetailRevision((v) => v + 1); void refresh(); }}><Glyph name="refresh" /></button>
    </div>
    {!remote ? <div className="git-empty"><Icon name="Github" className="git-empty-icon" /><p>Add a GitHub remote to view workflow checks.</p><button onClick={openAccount}>Set up remote</button></div>
      : connectionError ? <div className="git-checks-connection"><h2>GitHub checks unavailable</h2><p className="git-error" role="alert">{connectionError}</p><p className="git-muted">{data && !data.hostname ? <>Select a GitHub remote in the toolbar or update its URL in Account settings.</> : data?.installed === false ? <>Install GitHub CLI on this checkout’s host, then run <code>gh auth login</code>.</> : <>Check repository access or reconnect using <code>gh auth login</code> on this checkout’s host.</>}</p><div><button className="git-primary" onClick={openAccount}>Account settings</button><button disabled={pending} onClick={() => void refresh()}>Retry</button></div></div>
      : !data ? <p className="git-empty" role="status">Loading checks…</p>
      : !runs.length ? <div className="git-empty"><Icon name="CircleCheck" className="git-empty-icon" /><p>No workflow runs for {data.branch || "this commit"}.</p><span className="git-muted">Push your branch to trigger its configured GitHub Actions.</span></div>
      : <div className="git-checks-layout" aria-busy={pending}>
        <aside className="git-check-runs" aria-label="Workflow runs"><div className="git-check-pane-heading">Recent runs <span>{runs.length}</span></div>
          {runs.map((r: GithubRun) => <button key={r.databaseId} className="git-check-run" aria-pressed={r.databaseId === selected} onClick={() => setSelected(r.databaseId)}>
            <div><strong>{r.workflowName || r.displayTitle}</strong><Status state={r.status} conclusion={r.conclusion} /></div>
            <span className="git-check-run-title" title={r.displayTitle}>{r.displayTitle}</span><small><code>{r.headSha.slice(0, 7)}</code><span>{date(r.createdAt)}</span>{r.headSha === data.head && <span>HEAD</span>}</small>
          </button>)}
        </aside>
        <main className="git-check-detail">
          {detailError ? <p className="git-error" role="alert">{detailError} <button onClick={() => setDetailRevision((v) => v + 1)}>Retry</button></p> : !detail ? <p className="git-empty" role="status">Loading workflow…</p> : <>
            <header className="git-check-detail-heading"><div><h2>{detail.run.workflowName || detail.run.displayTitle}</h2><p className="git-muted">{detail.run.displayTitle}</p><div className="git-check-metadata"><Status state={detail.run.status} conclusion={detail.run.conclusion} /><code>{detail.run.headSha.slice(0, 7)}</code><span>Attempt {detail.run.attempt}</span></div></div>
              <button className="git-icon-button" aria-label="Open workflow on GitHub" title="Open on GitHub" onClick={() => navigate.openUrl(detail.run.url)}><Icon name="ExternalLink" className="git-icon" /></button>
            </header>
            {!current ? <p className="git-check-stale">Switch to this run’s branch to prepare a fix.</p> : detail.run.headSha !== data.head && <p className="git-check-stale">This run is from an earlier commit. The agent will check whether the failure still applies to the current code.</p>}
            <div className="git-check-jobs"><div className="git-check-pane-heading">Jobs <span>{detail.jobs.length}</span></div>
              {detail.jobs.length === 0 && <p className="git-muted">No jobs reported yet. Open the workflow on GitHub for details.</p>}
              {detail.jobs.map((j) => <section className="git-check-job" key={j.databaseId}><div className="git-check-job-heading"><strong>{j.name}</strong><Status state={j.status} conclusion={j.conclusion} /></div>
                {j.steps.filter((s) => failing(s.conclusion)).map((s) => <p className="git-check-failed-step" key={s.number}>{s.name}</p>)}
                {failing(j.conclusion) && <div className="git-check-job-actions"><button disabled={!!operation} onClick={() => void diagnostics("logs", j.databaseId)}>View logs</button><button className="git-primary" disabled={!!operation || !current} title={current ? "Prepare a fix request with this job’s diagnostics" : "Switch to the failed branch"} onClick={() => void diagnostics("fix", j.databaseId)}><Icon name="WandSparkles" className="git-icon" />Fix it</button></div>}
              </section>)}
            </div>
            {failing(detail.run.conclusion) && <div className="git-check-run-actions"><button disabled={!!operation} onClick={() => void diagnostics("logs", null)}>View all failed logs</button><button disabled={!!operation || !current} onClick={() => void diagnostics("fix", null)}>Fix failed checks</button></div>}
            {operation && <p className="git-muted" role="status">{operation === "fix" ? "Preparing fix request…" : "Loading failed-step logs…"}</p>}
            {actionError && <p className="git-error" role="alert">{actionError}</p>}
            {logs && <section className="git-check-logs"><div className="git-check-pane-heading"><strong>{logJob ? detail.jobs.find((j) => j.databaseId === logJob)?.name : "Failed steps"}</strong><button className="git-icon-button" aria-label="Close logs" onClick={() => setLogs(null)}><Glyph name="close" /></button></div>{logs.truncated && <p className="git-muted">Showing the last 96,000 characters. Open GitHub for complete logs.</p>}<pre>{logs.text || "No failed-step logs were returned. See job status or open the workflow on GitHub."}</pre></section>}
            {fix && <section className="git-check-fix"><div className="git-check-pane-heading"><strong>Fix failed check</strong><button className="git-icon-button" aria-label="Close fix request" onClick={() => setFix(null)}><Glyph name="close" /></button></div>
              <p className="git-muted">Review the request, agent and workspace, then send. A new thread uses an isolated worktree by default.</p>
              {currentComposer && <button onClick={async () => {
                try {
                  const thread = await sdk.threads.get({ threadId: threadId! });
                  if (thread.projectId !== target.projectId || !thread.environmentId) throw new Error("This chat belongs to a different checkout. Use the new-thread composer below.");
                  const environment = await sdk.environments.get({ environmentId: thread.environmentId });
                  if (environment.path !== target.path || environment.hostId !== target.hostId) throw new Error("This chat belongs to a different checkout. Use the new-thread composer below.");
                  currentComposer.insert(fix.prompt, { at: "end" }); currentComposer.focus(); setFix(null);
                } catch (e) { setActionError(errorText(e)); }
              }}>Add to current chat</button>}
              <NewThreadComposer key={`${detail.run.databaseId}:${detail.run.attempt}:${fix.head}:${fixJob}`} draftKey={`git-fix:${target.projectId}:${detail.run.databaseId}:${detail.run.attempt}:${fix.head}:${fixJob}`} defaultProjectId={target.projectId}
                defaultEnvironment={{ type: "host", hostId: target.hostId, workspace: { type: "managed-worktree", baseBranch: { kind: "named", name: fix.branch } } }}
                initialPrompt={fix.prompt} layout="document" onSubmit={async (request) => {
                  if (request.projectId !== target.projectId) throw new Error("Choose the project containing this failed check.");
                  const latest = await rpc.call("github", input);
                  if (latest.error) throw new Error(`Cannot verify this check before sending: ${latest.error}`);
                  if (latest.head !== fix.head || latest.branch !== fix.branch) throw new Error("The checkout changed. Refresh Checks and prepare the request again.");
                  const latestRun = latest.runs.find((r) => r.databaseId === detail.run.databaseId);
                  if (!latestRun || latestRun.attempt !== detail.run.attempt || !failing(latestRun.conclusion)) throw new Error("This workflow changed. Refresh Checks and prepare the request again.");
                  const t = await sdk.threads.spawn({ ...request, title: `Fix ${detail.run.workflowName || "GitHub check"}` });
                  navigate.toThread(t.id);
                }} />
            </section>}
          </>}
        </main>
      </div>}
  </div>;
}
