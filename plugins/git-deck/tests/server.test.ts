import assert from "node:assert/strict";
import { test } from "node:test";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin from "../src/server.ts";
import type { Snapshot } from "../src/contracts.ts";

test("automatic commits use BB for the selected checkout and reject mismatches and concurrent mutations", async () => {
  const source = { id: "main", hostId: "host_work", path: "/repos/work", isDefault: true };
  const environment = { id: "env_work", projectId: "proj_work", hostId: source.hostId, path: source.path,
    status: "ready", isGitRepo: true, lifecycle: { phase: "active" } };
  let environments = [environment], current = environment;
  const state: Snapshot = { root: source.path, branch: "main", unborn: false, upstream: "", ahead: 0, behind: 0,
    changes: [{ path: "file.txt", original: null, index: " ", worktree: "M", conflict: false }], refs: [], merging: false,
    remotes: [], config: { name: "Fixture", email: "fixture@example.test", sshCommand: "", localName: "", localEmail: "", localSshCommand: "" },
    branches: ["main"], history: [], activeJob: null };
  const commits: string[] = [], entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  let hold = false;
  const { bb, harness } = createFakePluginHost({
    pluginId: "git-deck",
    sdk: {
      projects: { get: async () => ({ sources: [source] }) },
      environments: {
        list: async () => environments,
        get: async () => current,
        commit: async ({ environmentId }) => {
          commits.push(environmentId);
          if (hold) { entered.resolve(); await release.promise; }
          return { ok: true, action: "commit", commitSha: "ab".repeat(20), commitSubject: "fix: update fixture", message: "Created commit" };
        },
      },
    },
    experimental_callHostRpc: async ({ method, hostId, input }) => {
      assert.equal(method, "snapshot"); assert.equal(hostId, source.hostId); assert.deepEqual(input, { path: source.path });
      return state;
    },
  });
  try {
    plugin(bb);
    const input = { projectId: "proj_work", targetId: "source:main" };
    const call = () => harness.behavior.callRpc("autoCommit", input);
    const targets = await harness.behavior.callRpc("targets", { projectId: "proj_work" });
    assert.equal(targets[0].canAutoCommit, true);
    const result = await call();
    assert.equal(result.commitSubject, "fix: update fixture"); assert.deepEqual(commits, [environment.id]);
    environments = [];
    await assert.rejects(call(), /associated with a BB chat/);
    environments = [environment]; current = { ...environment, path: "/repos/other" };
    await assert.rejects(call(), /Checkout changed/);
    current = environment; state.activeJob = "existing-job";
    await assert.rejects(call(), /already running/);
    state.activeJob = null; state.merging = true;
    await assert.rejects(call(), /Complete or abort/);
    state.merging = false;
    assert.equal(commits.length, 1);
    hold = true;
    const pending = call(); await entered.promise;
    await assert.rejects(call(), /already starting or running/);
    await assert.rejects(harness.behavior.callRpc("start", { ...input, action: { kind: "stage", paths: ["file.txt"] } }), /already starting or running/);
    release.resolve(); await pending;
    assert.deepEqual(commits, [environment.id, environment.id]);
  } finally { release.resolve(); await harness.lifecycle.dispose(); }
});
