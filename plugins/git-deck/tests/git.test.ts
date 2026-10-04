import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { experimental_createHostEntryHarness } from "@get-bb/plugin-sdk/testing/host";
import host from "../src/host.ts";
import { createAskpass } from "../src/askpass.ts";
import { git } from "../src/git.ts";
import type { Action, Job } from "../src/contracts.ts";

const exec = promisify(execFile);
const wait = () => new Promise((done) => setTimeout(done, 30));
async function init(path: string) {
  await exec("git", ["init", "--initial-branch=main", path]);
  await git(path, ["config", "--local", "commit.gpgSign", "false"]);
  await git(path, ["config", "--local", "user.name", "Fixture"]);
  await git(path, ["config", "--local", "user.email", "fixture@example.test"]);
}
async function until(harness: ReturnType<typeof experimental_createHostEntryHarness<typeof host.contract, {}>>, path: string, job: Job, predicate: (job: Job) => boolean) {
  for (let i = 0; i < 400; i++) {
    const current = await harness.experimental_call("job", { path, jobId: job.id });
    if (predicate(current)) return current;
    await wait();
  }
  throw new Error("Git operation did not finish in time");
}

test("real repositories: literal staging, unborn unstage, rename, accounts and push/pull", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bb-git-deck-test-"));
  const repo = join(dir, "repo"), other = join(dir, "other"), bare = join(dir, "bare.git");
  const harness = experimental_createHostEntryHarness(host);
  const run = async (path: string, action: Action) => {
    const job = await harness.experimental_call("start", { path, action });
    const result = await until(harness, path, job, (j) => j.state !== "running");
    assert.equal(result.state, "done", result.output);
    return result;
  };
  try {
    await init(repo); await init(other);
    await run(repo, { kind: "account", name: "Work", email: "work@example.test", sshCommand: "ssh -i ~/.ssh/id_work -o IdentitiesOnly=yes" });
    await run(other, { kind: "account", name: "Personal", email: "personal@example.test", sshCommand: "" });
    assert.equal((await harness.experimental_call("snapshot", { path: repo })).config.name, "Work");
    assert.equal((await harness.experimental_call("snapshot", { path: other })).config.name, "Personal");
    await run(repo, { kind: "account", name: "Work", email: "work@example.test", sshCommand: "" });
    const literal = ":(glob)*.txt", newline = "line\n'quote.txt";
    await writeFile(join(repo, literal), "selected\n");
    await writeFile(join(repo, newline), "newline\n");
    await writeFile(join(repo, "unrelated.txt"), "leave this alone\n");
    assert.equal((await harness.experimental_call("snapshot", { path: repo })).unborn, true);
    const patch = await harness.experimental_call("diff", { path: repo, pathspec: literal, staged: false });
    assert.match(patch.patch, /\+selected/);
    await run(repo, { kind: "stage", paths: [literal, newline] });
    let state = await harness.experimental_call("snapshot", { path: repo });
    assert.equal(state.changes.find((c) => c.path === "unrelated.txt")?.index, "?");
    assert.equal(state.changes.find((c) => c.path === newline)?.index, "A");
    await run(repo, { kind: "unstage", paths: [literal] });
    assert.equal(await readFile(join(repo, literal), "utf8"), "selected\n");
    await run(repo, { kind: "stage", paths: [literal] });
    await run(repo, { kind: "commit", message: "First commit\n\nBody" });
    state = await harness.experimental_call("snapshot", { path: repo });
    const firstLog = await harness.experimental_call("log", { path: repo, ref: "HEAD", limit: 100 });
    assert.equal(firstLog.commits[0].subject, "First commit");
    assert.equal(firstLog.commits[0].author, "Work");
    // A pre-reload app bundle still renders these original snapshot fields.
    assert.ok(state.branches.includes(state.branch));
    assert.equal(state.history[0].subject, firstLog.commits[0].subject);
    assert.equal(state.changes.length, 1);
    const renamed = "renamed file.txt";
    await git(repo, ["mv", "--", literal, renamed]);
    state = await harness.experimental_call("snapshot", { path: repo });
    assert.equal(state.changes.find((c) => c.path === renamed)?.original, literal);
    await run(repo, { kind: "unstage", paths: [renamed] });
    assert.equal(await readFile(join(repo, renamed), "utf8"), "selected\n");
    await run(repo, { kind: "stage", paths: [literal, renamed] });
    await run(repo, { kind: "commit", message: "Rename" });
    await exec("git", ["init", "--bare", "--initial-branch=main", bare]);
    await git(repo, ["remote", "add", "origin", bare]);
    await run(repo, { kind: "remote", remote: "origin", url: bare });
    await run(repo, { kind: "push", remote: "origin" });
    state = await harness.experimental_call("snapshot", { path: repo });
    assert.equal(state.upstream, "origin/main");
    await git(other, ["remote", "add", "origin", bare]);
    await run(other, { kind: "fetch", remote: "origin" });
    await git(other, ["branch", "--set-upstream-to=origin/main", "main"], { allowed: [0, 128] });
    await git(other, ["pull", "origin", "main"]);
    await git(other, ["branch", "--set-upstream-to=origin/main", "main"]);
    await writeFile(join(other, "remote.txt"), "remote change\n");
    await run(other, { kind: "stage", paths: ["remote.txt"] });
    await run(other, { kind: "commit", message: "Remote change" });
    await run(other, { kind: "push", remote: "origin" });
    await run(repo, { kind: "pull" });
    assert.equal(await readFile(join(repo, "remote.txt"), "utf8"), "remote change\n");
    assert.equal((await harness.experimental_call("log", { path: repo, ref: "HEAD", limit: 100 })).commits[0].author, "Personal");
    await run(repo, { kind: "switch", branch: "feature/basic", create: true });
    assert.equal((await harness.experimental_call("snapshot", { path: repo })).branch, "feature/basic");
  } finally { await harness.experimental_dispose(); await rm(dir, { recursive: true, force: true }); }
});

test("askpass: real OpenSSH encrypted key, UI job prompt, wrong reply ID and cancellation", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bb-git-deck-auth-"));
  const fixture = "fixture-only-passphrase";
  const harness = experimental_createHostEntryHarness(host);
  const abort = new AbortController();
  let bridge: Awaited<ReturnType<typeof createAskpass>> | undefined;
  try {
    const key = join(dir, "key");
    await exec("ssh-keygen", ["-q", "-t", "ed25519", "-N", fixture, "-f", key]);
    let prompt = "";
    bridge = await createAskpass(async (text) => { prompt = text; return fixture; }, abort.signal);
    const publicKey = await exec("ssh-keygen", ["-y", "-f", key], { env: { ...process.env, ...bridge.env } });
    assert.match(publicKey.stdout, /^ssh-ed25519 /);
    assert.match(prompt, /passphrase/i);
    await bridge.dispose(); bridge = undefined;
    const repo = join(dir, "repo"), bare = join(dir, "bare.git");
    await init(repo);
    await exec("git", ["init", "--bare", bare]);
    await git(repo, ["commit", "--allow-empty", "-m", "Fixture"]);
    await git(repo, ["remote", "add", "origin", bare]);
    await writeFile(join(repo, ".git/hooks/pre-push"), '#!/bin/sh\n"$GIT_ASKPASS" "Password:" >/dev/null\n', { mode: 0o700 });
    const job = await harness.experimental_call("start", { path: repo, action: { kind: "push", remote: "origin" } });
    const waiting = await until(harness, repo, job, (j) => j.prompt !== null);
    assert.equal(waiting.prompt?.secret, true);
    await assert.rejects(harness.experimental_call("start", { path: repo, action: { kind: "fetch", remote: "origin" } }), /already running/);
    await assert.rejects(harness.experimental_call("answer", { path: repo, jobId: job.id, promptId: "00000000-0000-4000-8000-000000000000", value: fixture }), /already ended/);
    await harness.experimental_call("answer", { path: repo, jobId: job.id, promptId: waiting.prompt!.id, value: fixture });
    const finished = await until(harness, repo, job, (j) => j.state !== "running");
    assert.equal(finished.state, "done", finished.output);
    assert.ok(!finished.output.includes(fixture));
    const next = await harness.experimental_call("start", { path: repo, action: { kind: "push", remote: "origin" } });
    await until(harness, repo, next, (j) => j.prompt !== null);
    await harness.experimental_call("cancel", { path: repo, jobId: next.id });
    assert.equal((await until(harness, repo, next, (j) => j.state !== "running")).state, "cancelled");
    assert.equal((await harness.experimental_call("snapshot", { path: repo })).activeJob, null);
  } finally { await bridge?.dispose(); await harness.experimental_dispose(); await rm(dir, { recursive: true, force: true }); }
});

test("branches: tracking and pruning, log topology, revision diffs, safe deletion and merge recovery", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bb-git-deck-branches-"));
  const repo = join(dir, "repo"), bare = join(dir, "bare.git");
  const harness = experimental_createHostEntryHarness(host);
  const run = async (action: Action, expected = "done") => {
    const job = await harness.experimental_call("start", { path: repo, action });
    const result = await until(harness, repo, job, (j) => j.state !== "running");
    assert.equal(result.state, expected, result.output);
    return result;
  };
  const commit = async (text: string, message: string) => {
    await writeFile(join(repo, "file.txt"), text);
    await run({ kind: "stage", paths: ["file.txt"] });
    await run({ kind: "commit", message });
  };
  try {
    await init(repo);
    await commit("base\n", "Root");
    const root = (await harness.experimental_call("log", { path: repo, ref: "", limit: 100 })).commits[0];
    assert.deepEqual(root.parents, []);
    const rootDetail = await harness.experimental_call("inspect", { path: repo, revision: root.hash, compare: false });
    assert.equal(rootDetail.base, null);
    assert.equal(rootDetail.files[0].status, "A");
    assert.match((await harness.experimental_call("revisionDiff", { path: repo, tip: rootDetail.tip, base: null, pathspec: "file.txt", original: null })).patch, /\+base/);
    await exec("git", ["init", "--bare", "--initial-branch=main", bare]);
    await git(repo, ["remote", "add", "origin", bare]);
    await run({ kind: "push", remote: "origin" });
    await git(repo, ["branch", "stale", root.hash]);
    await git(repo, ["push", "origin", "stale"]);
    assert.ok((await harness.experimental_call("snapshot", { path: repo })).refs.some((b) => b.name === "origin/stale"));
    await git(bare, ["update-ref", "-d", "refs/heads/stale"]);
    await run({ kind: "fetch", remote: "origin" });
    const pruned = await harness.experimental_call("snapshot", { path: repo });
    assert.equal(pruned.refs.some((b) => b.name === "origin/stale"), false);
    assert.ok(pruned.refs.some((b) => b.name === "stale" && !b.remote));
    await run({ kind: "branch-create", name: "feature/track", from: "refs/remotes/origin/main", track: true });
    let state = await harness.experimental_call("snapshot", { path: repo });
    assert.equal(state.upstream, "origin/main");
    assert.ok(state.refs.some((b) => b.remote === "origin" && b.name === "origin/main"));
    await run({ kind: "branch-rename", branch: "feature/track", name: "feature/work" });
    await commit("feature\n", "Feature");
    await run({ kind: "switch", branch: "main", create: false });
    await run({ kind: "branch-delete", branch: "feature/work" }, "failed");
    const comparison = await harness.experimental_call("inspect", { path: repo, revision: "refs/heads/feature/work", compare: true });
    assert.equal(comparison.base, root.hash);
    assert.equal(comparison.files[0].path, "file.txt");
    await commit("main\n", "Main");
    await run({ kind: "branch-create", name: "feature/from-other", from: "refs/heads/feature/work", track: false });
    state = await harness.experimental_call("snapshot", { path: repo });
    assert.equal(state.refs.find((b) => b.current)?.hash, comparison.tip);
    assert.equal(state.upstream, "");
    await run({ kind: "switch", branch: "main", create: false });
    await run({ kind: "merge", branch: "refs/heads/feature/work" }, "failed");
    state = await harness.experimental_call("snapshot", { path: repo });
    assert.equal(state.merging, true);
    assert.equal(state.changes[0].conflict, true);
    await run({ kind: "merge-abort" });
    assert.equal((await harness.experimental_call("snapshot", { path: repo })).merging, false);
    await run({ kind: "merge", branch: "refs/heads/feature/work" }, "failed");
    await writeFile(join(repo, "file.txt"), "resolved\n");
    await run({ kind: "stage", paths: ["file.txt"] });
    await run({ kind: "merge-continue" });
    const history = await harness.experimental_call("log", { path: repo, ref: "HEAD", limit: 100 });
    assert.equal(history.commits[0].parents.length, 2);
    assert.equal(history.commits.length, 4);
    const merge = await harness.experimental_call("inspect", { path: repo, revision: history.commits[0].hash, compare: false });
    assert.equal(merge.base, history.commits[0].parents[0]);
    assert.equal(merge.files[0].path, "file.txt");
    await git(repo, ["branch", "--unset-upstream", "feature/work"]);
    await run({ kind: "branch-delete", branch: "feature/work" });
    await run({ kind: "branch-delete", branch: "feature/from-other" });
    assert.equal((await harness.experimental_call("snapshot", { path: repo })).refs.some((b) => b.name === "feature/work"), false);
  } finally { await harness.experimental_dispose(); await rm(dir, { recursive: true, force: true }); }
});
