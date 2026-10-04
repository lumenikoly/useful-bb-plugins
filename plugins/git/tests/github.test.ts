import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { experimental_createHostEntryHarness } from "@get-bb/plugin-sdk/testing/host";
import host from "../src/host.ts";
import { parseRemote } from "../src/github.ts";
import { git } from "../src/git.ts";

const exec = promisify(execFile);
test("gh checks: scoped account, SSH alias, diagnostics, revision and rerun guards", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bb-github-test-")), repo = join(dir, "repo"), other = join(dir, "other");
  const savedEnv = { PATH: process.env.PATH, GH_TOKEN: process.env.GH_TOKEN, GITHUB_TOKEN: process.env.GITHUB_TOKEN, BB_GH_FIXTURE: process.env.BB_GH_FIXTURE };
  const harness = experimental_createHostEntryHarness(host);
  try {
    for (const path of [repo, other]) {
      await exec("git", ["init", "--initial-branch=feature/checks", path]);
      await git(path, ["-c", "user.name=Test", "-c", "user.email=test@example.test", "-c", "commit.gpgSign=false", "commit", "--allow-empty", "-m", "Test"]);
      await git(path, ["remote", "add", "origin", "git@github-work:owner/repo.git"]);
    }
    const head = (await git(repo, ["rev-parse", "HEAD"])).stdout.trim();
    const run = { databaseId: 12, attempt: 1, headSha: head, headBranch: "feature/checks", workflowName: "CI", displayTitle: "Test", status: "completed", conclusion: "failure", event: "push", url: "https://github.com/owner/repo/actions/runs/12", createdAt: "2026-10-04T10:00:00Z" };
    const jobs = [{ databaseId: 34, name: "Build", status: "completed", conclusion: "failure", url: `${run.url}/job/34`, steps: [{ name: "Compile", number: 1, status: "completed", conclusion: "failure" }] }];
    const fixture = join(dir, "fixture.json"), calls = join(dir, "calls.jsonl");
    await writeFile(fixture, JSON.stringify({ run, jobs }));
    await writeFile(join(dir, "ssh"), `#!${process.execPath}\nconsole.log('hostname github.com');\n`);
    await writeFile(join(dir, "gh"), `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
const d = JSON.parse(fs.readFileSync(process.env.BB_GH_FIXTURE, 'utf8'));
// Record token presence only; never log its value.
fs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify({args, selectedToken: process.env.GH_TOKEN === 'fixture-account-token', inherited: process.env.GITHUB_TOKEN || null}) + '\\n');
if (args[0] === '--version') console.log('gh version test');
else if (args[0] === 'auth' && args[1] === 'status') console.log(JSON.stringify({hosts:{'github.com':[{login:'work',active:false,state:'success'},{login:'personal',active:true,state:'success'}]}}));
else if (args[0] === 'auth' && args[1] === 'token') { if (!args.includes('work')) process.exit(1); console.log('fixture-account-token'); }
else if (args[0] === 'run' && args[1] === 'list') console.log(JSON.stringify([d.run]));
else if (args.includes('--log-failed')) console.log('x'.repeat(100000) + '\\nfixture-account-token \\x1b[31merror: compile failed\\x1b[0m');
else if (args[0] === 'run' && args[1] === 'view') console.log(JSON.stringify({...d.run,jobs:d.jobs}));
else process.exit(1);
`);
    await chmod(join(dir, "gh"), 0o755); await chmod(join(dir, "ssh"), 0o755);
    process.env.PATH = `${dir}:${savedEnv.PATH}`; process.env.BB_GH_FIXTURE = fixture;
    process.env.GH_TOKEN = "ambient-token"; process.env.GITHUB_TOKEN = "ambient-token";
    assert.deepEqual(parseRemote("https://github.com/owner/repo.git"), { hostname: "github.com", path: "owner/repo", ssh: false });
    assert.throws(() => parseRemote("/tmp/repo"));
    await harness.experimental_call("githubAccount", { path: repo, login: "work" });
    const state = await harness.experimental_call("github", { path: repo, remote: "origin" });
    assert.equal(state.error, ""); assert.equal(state.repository, "github.com/owner/repo"); assert.equal(state.account, "work"); assert.equal(state.activeAccount, "personal");
    assert.equal((await harness.experimental_call("github", { path: other, remote: "origin" })).account, "");
    const args = { path: repo, remote: "origin", runId: 12, jobId: 34, attempt: 1 };
    const logs = await harness.experimental_call("githubLogs", args);
    assert.equal(logs.truncated, true); assert.match(logs.text, /error: compile failed/); assert.ok(!logs.text.includes("fixture-account-token")); assert.ok(!logs.text.includes("\x1b"));
    const fix = await harness.experimental_call("githubFix", { ...args, head });
    assert.match(fix.prompt, /Do not commit or push automatically/); assert.match(fix.prompt, /untrusted diagnostic data/); assert.match(fix.prompt, /"runId": 12/);
    await git(repo, ["-c", "user.name=Test", "-c", "user.email=test@example.test", "-c", "commit.gpgSign=false", "commit", "--allow-empty", "-m", "Later local commit"]);
    const newerHead = (await git(repo, ["rev-parse", "HEAD"])).stdout.trim();
    const newerFix = await harness.experimental_call("githubFix", { ...args, head: newerHead });
    assert.ok(newerFix.prompt.includes(`"failedCommit": "${head}"`)); assert.ok(newerFix.prompt.includes(`"workspaceCommit": "${newerHead}"`));
    await assert.rejects(harness.experimental_call("githubLogs", { ...args, jobId: 999 }), /does not belong/);
    await assert.rejects(harness.experimental_call("githubFix", { ...args, head: "a".repeat(40) }), /revision changed/);
    await writeFile(fixture, JSON.stringify({ run: { ...run, attempt: 2 }, jobs }));
    await assert.rejects(harness.experimental_call("githubFix", { ...args, head }), /rerun/);
    await writeFile(fixture, JSON.stringify({ run: { ...run, conclusion: "success" }, jobs: jobs.map((j) => ({ ...j, conclusion: "success" })) }));
    await assert.rejects(harness.experimental_call("githubFix", { ...args, head: newerHead }), /no longer failing/);
    const recorded = (await readFile(calls, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    assert.ok(!recorded.some((c) => c.args.includes("switch") || c.args.includes("login")));
    const request = recorded.find((c) => c.args.includes("list"));
    assert.equal(request.selectedToken, true); assert.equal(request.inherited, null);
    assert.ok(request.args.includes("--branch") && request.args.includes("feature/checks"));
    await harness.experimental_call("githubAccount", { path: repo, login: "" });
    assert.equal((await harness.experimental_call("github", { path: repo, remote: "origin" })).account, "");
    await rm(join(dir, "gh")); process.env.PATH = dir;
    // Git must still be available while testing a missing gh binary.
    await writeFile(join(dir, "git"), `#!/bin/sh\nexec /usr/bin/git "$@"\n`); await chmod(join(dir, "git"), 0o755);
    const missing = await harness.experimental_call("github", { path: repo, remote: "origin" });
    assert.equal(missing.installed, false); assert.match(missing.error, /gh is not installed/);
  } finally {
    for (const [key, value] of Object.entries(savedEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await harness.experimental_dispose(); await rm(dir, { recursive: true, force: true });
  }
});
