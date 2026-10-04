import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { hostContract, rpcContract, type Target } from "./contracts.ts";

export { rpcContract } from "./contracts.ts";

export default function plugin(bb: BbPluginApi) {
  const host = bb.hosts.experimental_client({ contract: hostContract });
  const mutations = new Set<string>();
  async function mutate<T>(t: { hostId: string; path: string }, run: () => Promise<T>): Promise<T> {
    const key = `${t.hostId}\0${t.path}`;
    if (mutations.has(key)) throw new Error("A Git operation is already starting or running in this checkout. Wait for it to finish.");
    mutations.add(key);
    try { return await run(); } finally { mutations.delete(key); }
  }
  async function targets(projectId: string, threadId?: string): Promise<Target[]> {
    const project = await bb.sdk.projects.get({ projectId });
    const environments = (await bb.sdk.environments.list({ projectId, status: "ready", limit: 100 }))
      .filter((e) => e.projectId === projectId && e.path && e.isGitRepo && e.lifecycle.phase === "active");
    const sources: Target[] = project.sources.map((source) => ({
      id: `source:${source.id}`, projectId, hostId: source.hostId, path: source.path,
      label: `${source.isDefault ? "Main checkout" : "Checkout"} · ${source.path}`,
      canAutoCommit: environments.some((e) => e.hostId === source.hostId && e.path === source.path),
    }));
    let currentId: string | null = null;
    if (threadId) {
      const thread = await bb.sdk.threads.get({ threadId });
      if (thread.projectId === projectId) currentId = thread.environmentId;
    }
    const worktrees: Target[] = environments.map((e) => ({
      id: `environment:${e.id}`, projectId, hostId: e.hostId, path: e.path!,
      label: `${e.id === currentId ? "Current thread" : e.name || e.branchName || "Environment"} · ${e.path}`,
      canAutoCommit: true,
    }));
    const ordered = [...worktrees.filter((t) => t.id === `environment:${currentId}`), ...sources, ...worktrees];
    return ordered.filter((t, i) => ordered.findIndex((other) => other.hostId === t.hostId && other.path === t.path) === i);
  }
  async function target(projectId: string, targetId: string) {
    // Resolve paths on the server, never execute a path supplied by the browser.
    if (targetId.startsWith("source:")) {
      const project = await bb.sdk.projects.get({ projectId });
      const source = project.sources.find((s) => s.id === targetId.slice(7));
      if (source) return { hostId: source.hostId, path: source.path };
    } else if (targetId.startsWith("environment:")) {
      const e = await bb.sdk.environments.get({ environmentId: targetId.slice(12) });
      if (e.projectId === projectId && e.path && e.status === "ready" && e.lifecycle.phase === "active" && e.isGitRepo) {
        return { hostId: e.hostId, path: e.path };
      }
    }
    throw new Error("Checkout is unavailable. Refresh the environment list.");
  }
  bb.rpc.register(rpcContract, {
    github: async ({ projectId, targetId, remote }) => {
      const t = await target(projectId, targetId);
      return host.call("github", { path: t.path, remote }, { hostId: t.hostId });
    },
    githubAccount: async ({ projectId, targetId, login }) => {
      const t = await target(projectId, targetId);
      return host.call("githubAccount", { path: t.path, login }, { hostId: t.hostId });
    },
    githubRun: async ({ projectId, targetId, remote, runId }) => {
      const t = await target(projectId, targetId);
      return host.call("githubRun", { path: t.path, remote, runId }, { hostId: t.hostId });
    },
    githubLogs: async ({ projectId, targetId, remote, runId, jobId, attempt }) => {
      const t = await target(projectId, targetId);
      return host.call("githubLogs", { path: t.path, remote, runId, jobId, attempt }, { hostId: t.hostId });
    },
    githubFix: async ({ projectId, targetId, remote, runId, jobId, attempt, head }) => {
      const t = await target(projectId, targetId);
      return host.call("githubFix", { path: t.path, remote, runId, jobId, attempt, head }, { hostId: t.hostId });
    },
    projects: async () => (await bb.sdk.projects.list()).map(({ id, name }) => ({ id, name })),
    targets: ({ projectId, threadId }) => targets(projectId, threadId),
    autoCommit: async ({ projectId, targetId }) => {
      const t = await target(projectId, targetId);
      return mutate(t, async () => {
        const state = await host.call("snapshot", { path: t.path }, { hostId: t.hostId });
        if (state.activeJob) throw new Error("A Git command is already running. Wait for it to finish.");
        if (state.merging) throw new Error("Complete or abort the merge before an automatic commit.");
        if (state.changes.some((c) => c.conflict)) throw new Error("Resolve conflicts before committing.");
        const environmentId = targetId.startsWith("environment:") ? targetId.slice(12)
          : (await bb.sdk.environments.list({ projectId, status: "ready", path: t.path, limit: 100 }))
            .find((e) => e.projectId === projectId && e.hostId === t.hostId && e.path === t.path && e.isGitRepo && e.lifecycle.phase === "active")?.id;
        if (!environmentId) throw new Error("Automatic commits require a checkout associated with a BB chat. Select that checkout or use a manual commit.");
        const e = await bb.sdk.environments.get({ environmentId });
        if (e.projectId !== projectId || e.hostId !== t.hostId || e.path !== t.path || e.status !== "ready" || e.lifecycle.phase !== "active" || !e.isGitRepo) {
          throw new Error("Checkout changed. Refresh before committing.");
        }
        const result = await bb.sdk.environments.commit({ environmentId });
        return { commitSha: result.commitSha, commitSubject: result.commitSubject };
      });
    },
    snapshot: async ({ projectId, targetId }) => {
      const t = await target(projectId, targetId);
      return host.call("snapshot", { path: t.path }, { hostId: t.hostId });
    },
    diff: async ({ projectId, targetId, pathspec, staged }) => {
      const t = await target(projectId, targetId);
      return host.call("diff", { path: t.path, pathspec, staged }, { hostId: t.hostId });
    },
    log: async ({ projectId, targetId, ref, limit }) => {
      const t = await target(projectId, targetId);
      return host.call("log", { path: t.path, ref, limit }, { hostId: t.hostId });
    },
    inspect: async ({ projectId, targetId, revision, compare }) => {
      const t = await target(projectId, targetId);
      return host.call("inspect", { path: t.path, revision, compare }, { hostId: t.hostId });
    },
    revisionDiff: async ({ projectId, targetId, tip, base, pathspec, original }) => {
      const t = await target(projectId, targetId);
      return host.call("revisionDiff", { path: t.path, tip, base, pathspec, original }, { hostId: t.hostId });
    },
    start: async ({ projectId, targetId, action }) => {
      const t = await target(projectId, targetId);
      return mutate(t, () => host.call("start", { path: t.path, action }, { hostId: t.hostId }));
    },
    job: async ({ projectId, targetId, jobId }) => {
      const t = await target(projectId, targetId);
      return host.call("job", { path: t.path, jobId }, { hostId: t.hostId });
    },
    answer: async ({ projectId, targetId, jobId, promptId, value }) => {
      const t = await target(projectId, targetId);
      return host.call("answer", { path: t.path, jobId, promptId, value }, { hostId: t.hostId });
    },
    cancel: async ({ projectId, targetId, jobId }) => {
      const t = await target(projectId, targetId);
      return host.call("cancel", { path: t.path, jobId }, { hostId: t.hostId });
    },
  });
}
