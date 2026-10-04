import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { experimental_defineHostEntry } from "@get-bb/plugin-sdk";
import { createAskpass } from "./askpass.ts";
import { hostContract, type Job } from "./contracts.ts";
import { diff, git, perform, repository, snapshot, log, inspect, revisionDiff } from "./git.ts";
import { checks, setAccount, runDetail, failedLogs, fixPrompt } from "./github.ts";

type GitJob = { view: Job; root: string; abort: AbortController; reply?: (value: string | null) => void; finished?: number };
const jobs = new Map<string, GitJob>();
const locks = new Map<string, string>();

async function findJob(path: string, jobId: string, signal: AbortSignal) {
  const job = jobs.get(jobId);
  if (!job || job.root !== await repository(path, signal)) throw new Error("Operation not found. The plugin may have been reloaded; refresh Git status.");
  return job;
}

export default experimental_defineHostEntry({
  contract: hostContract,
  handlers: {
    github: ({ path, remote }, { signal }) => checks(path, remote, signal),
    githubAccount: ({ path, login }, { signal }) => setAccount(path, login, signal),
    githubRun: ({ path, remote, runId }, { signal }) => runDetail(path, remote, runId, signal),
    githubLogs: ({ path, remote, runId, jobId, attempt }, { signal }) => failedLogs(path, remote, runId, jobId, attempt, signal),
    githubFix: ({ path, remote, runId, jobId, attempt, head }, { signal }) => fixPrompt(path, remote, runId, jobId, attempt, head, signal),
    snapshot: async ({ path }, { signal }) => {
      const result = await snapshot(path, signal);
      result.activeJob = [...jobs.values()].find((job) => job.root === result.root && job.view.state === "running")?.view.id ?? null;
      return result;
    },
    diff: ({ path, pathspec, staged }, { signal }) => diff(path, pathspec, staged, signal),
    log: ({ path, ref, limit }, { signal }) => log(path, ref, limit, signal),
    inspect: ({ path, revision, compare }, { signal }) => inspect(path, revision, compare, signal),
    revisionDiff: ({ path, tip, base, pathspec, original }, { signal }) => revisionDiff(path, tip, base, pathspec, original, signal),
    start: async ({ path, action }, context) => {
      context.signal.throwIfAborted();
      const root = await repository(path, context.signal);
      const common = (await git(root, ["rev-parse", "--git-common-dir"], { signal: context.signal })).stdout.replace(/\r?\n$/, "");
      const lock = resolve(root, common);
      if (locks.has(lock)) throw new Error("A Git command is already running in this repository. Wait for it to finish.");
      // ponytail: in-memory jobs, recovered from Git status after worker restart.
      for (const [id, job] of jobs) if (job.finished && Date.now() - job.finished > 300_000) jobs.delete(id);
      const id = randomUUID(), abort = new AbortController();
      const view: Job = { id, kind: action.kind, state: "running", output: "", prompt: null };
      const job: GitJob = { root, view, abort };
      jobs.set(id, job);
      locks.set(lock, id);
      const lease = context.experimental_retainWorker();
      const stop = () => { abort.abort(); job.reply?.(null); };
      context.lifecycle.signal.addEventListener("abort", stop, { once: true });
      const timeout = setTimeout(stop, 600_000);
      void (async () => {
        let bridge: Awaited<ReturnType<typeof createAskpass>> | undefined;
        try {
          if (["push", "pull", "fetch", "commit", "merge", "merge-continue"].includes(action.kind)) {
            bridge = await createAskpass((text, confirm) => new Promise((reply) => {
              if (abort.signal.aborted || job.reply) { reply(null); return; }
              const confirmation = confirm || /yes\/no/i.test(text);
              const secret = !confirmation && !/^(username|user name)\b/i.test(text);
              view.prompt = { id: randomUUID(), text, confirm: confirmation, secret };
              job.reply = (value) => { job.reply = undefined; view.prompt = null; reply(value); };
            }), abort.signal);
          }
          await perform(root, action, { signal: abort.signal, env: bridge?.env,
            onOutput: (s) => { view.output = (view.output + s).slice(-262144); },
          });
          view.state = "done";
          if (!view.output) view.output = "Done.";
        } catch (error) {
          view.state = abort.signal.aborted ? "cancelled" : "failed";
          view.output = (view.output + "\n" + (error instanceof Error ? error.message : String(error))).slice(-262144);
        } finally {
          job.reply?.(null);
          try { await bridge?.dispose(); } catch {
            // Credentials are never written to disk; cleanup failure must not
            // turn a completed Git operation into an unhandled rejection.
          } finally {
            clearTimeout(timeout);
            context.lifecycle.signal.removeEventListener("abort", stop);
            locks.delete(lock);
            job.finished = Date.now();
            lease.dispose();
          }
        }
      })();
      return { ...view };
    },
    job: async ({ path, jobId }, { signal }) => ({ ...(await findJob(path, jobId, signal)).view }),
    answer: async ({ path, jobId, promptId, value }, { signal }) => {
      const job = await findJob(path, jobId, signal);
      if (job.view.prompt?.id !== promptId || !job.reply) throw new Error("The credential request has already ended. Refresh the panel.");
      job.reply(value);
      return null;
    },
    cancel: async ({ path, jobId }, { signal }) => {
      const job = await findJob(path, jobId, signal);
      if (job.view.state === "running") { job.abort.abort(); job.reply?.(null); }
      return null;
    },
  },
  dispose: () => {
    for (const job of jobs.values()) { job.abort.abort(); job.reply?.(null); }
  },
});
