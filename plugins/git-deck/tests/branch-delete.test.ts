import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { experimental_createHostEntryHarness } from "@get-bb/plugin-sdk/testing/host";
import host from "../src/host.ts";
import { git } from "../src/git.ts";
import type { Action } from "../src/contracts.ts";

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "git-deck-delete-")), repo = join(dir, "repo");
  await git(dir, ["init", "--initial-branch=main", repo]);
  await git(repo, ["config", "user.name", "Test"]);
  await git(repo, ["config", "user.email", "test@example.test"]);
  await git(repo, ["config", "commit.gpgSign", "false"]);
  const commit = async (path: string, contents: string) => {
    await writeFile(join(repo, path), contents);
    await git(repo, ["add", "--", path]); await git(repo, ["commit", "-m", path]);
  };
  await commit("file", "base\n");
  const harness = experimental_createHostEntryHarness(host);
  const run = async (action: Action, expected = "done") => {
    let job = await harness.experimental_call("start", { path: repo, action });
    for (let i = 0; job.state === "running" && i < 400; i++) {
      await new Promise((done) => setTimeout(done, 10));
      job = await harness.experimental_call("job", { path: repo, jobId: job.id });
    }
    assert.equal(job.state, expected, job.output);
    return job;
  };
  const exists = async (name: string) => (await git(repo, ["show-ref", "--verify", "--quiet", `refs/heads/${name}`], { allowed: [0, 1] })).code === 0;
  const cleanup = async () => { await harness.experimental_dispose(); await rm(dir, { recursive: true, force: true }); };
  return { dir, repo, commit, run, exists, cleanup };
}

test("safe and force deletion: one error, preserved edits/remotes, protected worktrees", async () => {
  const f = await fixture();
  try {
    await git(f.repo, ["branch", "merged"]);
    await f.run({ kind: "branch-delete", branch: "merged" });
    assert.equal(await f.exists("merged"), false);
    await git(f.repo, ["switch", "-c", "unmerged"]);
    await f.commit("feature", "unmerged commit\n");
    const tip = (await git(f.repo, ["rev-parse", "HEAD"])).stdout.trim();
    await git(f.repo, ["update-ref", "refs/remotes/origin/unmerged", tip]);
    await git(f.repo, ["switch", "main"]);
    await writeFile(join(f.repo, "file"), "working edit\n");
    await writeFile(join(f.repo, "staged"), "staged edit\n"); await git(f.repo, ["add", "staged"]);
    await writeFile(join(f.repo, "untracked"), "new file\n");
    const before = (await git(f.repo, ["status", "--porcelain=v1", "-z"])).stdout;
    const blocked = await f.run({ kind: "branch-delete", branch: "unmerged" }, "failed");
    assert.equal((blocked.output.match(/not fully merged/g) || []).length, 1);
    assert.equal(await f.exists("unmerged"), true);
    await f.run({ kind: "branch-delete", branch: "unmerged", force: true });
    assert.equal(await f.exists("unmerged"), false);
    assert.equal((await git(f.repo, ["rev-parse", "refs/remotes/origin/unmerged"])).stdout.trim(), tip);
    assert.equal((await git(f.repo, ["status", "--porcelain=v1", "-z"])).stdout, before);
    assert.equal(await readFile(join(f.repo, "file"), "utf8"), "working edit\n");
    assert.equal((await git(f.repo, ["show", ":staged"])).stdout, "staged edit\n");
    assert.equal(await readFile(join(f.repo, "untracked"), "utf8"), "new file\n");
    const invalid = await f.run({ kind: "branch-create", name: "bad name", from: "HEAD", track: false }, "failed");
    assert.equal((invalid.output.match(/not a valid branch name/g) || []).length, 1);
    const preflight = await f.run({ kind: "merge", branch: "main" }, "failed");
    assert.match(preflight.output, /working directory must be clean/);
    for (const force of [false, true]) {
      await f.run({ kind: "branch-delete", branch: "main", force }, "failed");
      assert.equal(await f.exists("main"), true);
    }
    await git(f.repo, ["branch", "busy"]);
    await git(f.repo, ["worktree", "add", join(f.dir, "linked"), "busy"]);
    for (const force of [false, true]) {
      await f.run({ kind: "branch-delete", branch: "busy", force }, "failed");
      assert.equal(await f.exists("busy"), true);
    }
  } finally { await f.cleanup(); }
});

test("merge checks use available upstream, fall back to HEAD, and detect squash history", async () => {
  const f = await fixture();
  try {
    await git(f.repo, ["remote", "add", "origin", f.repo]);
    await git(f.repo, ["update-ref", "refs/remotes/origin/feature", "HEAD"]);
    await git(f.repo, ["switch", "-c", "feature"]); await f.commit("feature", "feature\n");
    const feature = (await git(f.repo, ["rev-parse", "HEAD"])).stdout.trim();
    await git(f.repo, ["branch", "--set-upstream-to=origin/feature", "feature"]);
    await git(f.repo, ["switch", "main"]); await git(f.repo, ["merge", "--ff-only", "feature"]);
    await f.run({ kind: "branch-delete", branch: "feature" }, "failed");
    await git(f.repo, ["update-ref", "refs/remotes/origin/feature", feature]);
    await f.run({ kind: "branch-delete", branch: "feature" });
    await git(f.repo, ["switch", "-c", "published"]); await f.commit("published", "published\n");
    const published = (await git(f.repo, ["rev-parse", "HEAD"])).stdout.trim();
    await git(f.repo, ["update-ref", "refs/remotes/origin/published", published]);
    await git(f.repo, ["branch", "--set-upstream-to=origin/published", "published"]);
    await git(f.repo, ["switch", "main"]);
    await f.run({ kind: "branch-delete", branch: "published" });
    await git(f.repo, ["branch", "gone", published]);
    await git(f.repo, ["branch", "--set-upstream-to=origin/published", "gone"]);
    await git(f.repo, ["update-ref", "-d", "refs/remotes/origin/published"]);
    await f.run({ kind: "branch-delete", branch: "gone" }, "failed");
    await git(f.repo, ["merge", "--ff-only", "gone"]);
    await f.run({ kind: "branch-delete", branch: "gone" });
    await git(f.repo, ["switch", "-c", "squashed"]);
    await f.commit("squash-one", "one\n"); await f.commit("squash-two", "two\n");
    await git(f.repo, ["switch", "main"]);
    await git(f.repo, ["merge", "--squash", "squashed"]);
    await git(f.repo, ["commit", "-m", "Squash"]);
    assert.equal((await git(f.repo, ["diff", "--quiet", "HEAD", "squashed"], { allowed: [0, 1] })).code, 0);
    await f.run({ kind: "branch-delete", branch: "squashed" }, "failed");
    assert.equal(await f.exists("squashed"), true);
    await f.run({ kind: "branch-delete", branch: "squashed", force: true });
    assert.equal(await f.exists("squashed"), false);
  } finally { await f.cleanup(); }
});
