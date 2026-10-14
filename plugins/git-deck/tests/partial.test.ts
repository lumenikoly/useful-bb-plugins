import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { diff, git, perform, snapshot } from "../src/git.ts";
import { patchHunks } from "../src/partial.ts";

async function fixture() {
  const path = await mkdtemp(join(tmpdir(), "git-deck-partial-"));
  await git(path, ["init", "--initial-branch=main"]);
  await git(path, ["config", "user.name", "Test"]);
  await git(path, ["config", "user.email", "test@example.test"]);
  await git(path, ["config", "commit.gpgSign", "false"]);
  return path;
}
const ids = (patch: string, predicate = (text: string) => /^[+-]/.test(text)) => patchHunks(patch).hunks.flatMap((h) => h.lines.filter((l) => predicate(l.text)).map((l) => l.index));
async function apply(path: string, name: string, staged: boolean, expectedPatch: string, lines: number[]) {
  await perform(path, { kind: "stage-part", pathspec: name, staged, expectedPatch, lines }, {});
}

test("partial staging and unstaging preserve working files, other hunks and existing index entries", async () => {
  const path = await fixture();
  try {
    const base = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join("\n") + "\n";
    await writeFile(join(path, "file"), base);
    await git(path, ["add", "file"]); await git(path, ["commit", "-m", "base"]);
    await writeFile(join(path, "other"), "already staged\n"); await git(path, ["add", "other"]);
    const changed = base.replace("line 2\n", "updated 2\n").replace("line 25\n", "updated 25\n");
    await writeFile(join(path, "file"), changed);
    let patch = (await diff(path, "file", false)).patch;
    assert.equal(patchHunks(patch).hunks.length, 2);
    await apply(path, "file", false, patch, patchHunks(patch).hunks[0].lines.filter((l) => /^[+-]/.test(l.text)).map((l) => l.index));
    assert.equal((await git(path, ["show", ":file"])).stdout, base.replace("line 2\n", "updated 2\n"));
    assert.equal((await snapshot(path)).changes.find((c) => c.path === "file")?.index, "M");
    assert.equal((await snapshot(path)).changes.find((c) => c.path === "file")?.worktree, "M");
    patch = (await diff(path, "file", true)).patch;
    await apply(path, "file", true, patch, ids(patch));
    assert.equal((await git(path, ["show", ":file"])).stdout, base);
    patch = (await diff(path, "file", false)).patch;
    await apply(path, "file", false, patch, ids(patch, (line) => line === "+updated 2"));
    assert.equal((await git(path, ["show", ":file"])).stdout, base.replace("line 2\n", "line 2\nupdated 2\n"));
    patch = (await diff(path, "file", true)).patch;
    await apply(path, "file", true, patch, ids(patch));
    assert.equal((await git(path, ["show", ":file"])).stdout, base);
    assert.equal(await readFile(join(path, "file"), "utf8"), changed);
    assert.equal((await git(path, ["show", ":other"])).stdout, "already staged\n");
    patch = (await diff(path, "file", false)).patch;
    await writeFile(join(path, "file"), changed + "new edit\n");
    await assert.rejects(apply(path, "file", false, patch, ids(patch)), /diff has changed/);
    assert.equal((await git(path, ["show", ":file"])).stdout, base);
    const shifted = base.replace("line 2\n", "inserted\nline 2\n").replace("line 25\n", "");
    await writeFile(join(path, "file"), shifted);
    patch = (await diff(path, "file", false)).patch;
    await apply(path, "file", false, patch, ids(patch));
    assert.equal((await git(path, ["show", ":file"])).stdout, shifted);
    patch = (await diff(path, "file", true)).patch;
    await apply(path, "file", true, patch, ids(patch));
    assert.equal((await git(path, ["show", ":file"])).stdout, base);
  } finally { await rm(path, { recursive: true, force: true }); }
});

test("partial new-file staging works before HEAD, with literal paths and missing final newline", async () => {
  const path = await fixture(), name = "new [file] ü.txt";
  try {
    await writeFile(join(path, name), "a\nb\nc");
    let patch = (await diff(path, name, false)).patch;
    await apply(path, name, false, patch, ids(patch, (line) => line === "+a"));
    assert.equal((await git(path, ["show", `:${name}`])).stdout, "a\n");
    patch = (await diff(path, name, false)).patch;
    await apply(path, name, false, patch, ids(patch));
    assert.equal((await git(path, ["show", `:${name}`])).stdout, "a\nb\nc");
    patch = (await diff(path, name, true)).patch;
    await apply(path, name, true, patch, ids(patch, (line) => line === "+b"));
    assert.equal((await git(path, ["show", `:${name}`])).stdout, "a\nc");
    patch = (await diff(path, name, true)).patch;
    await apply(path, name, true, patch, ids(patch));
    assert.equal((await git(path, ["ls-files", "--", name])).stdout, "");
    assert.equal(await readFile(join(path, name), "utf8"), "a\nb\nc");
  } finally { await rm(path, { recursive: true, force: true }); }
});

test("partial deletion retains the file in index, and rejects invalid selections", async () => {
  const path = await fixture();
  try {
    await writeFile(join(path, "file"), "a\nb\nc\n");
    await git(path, ["add", "file"]); await git(path, ["commit", "-m", "base"]);
    await rm(join(path, "file"));
    let patch = (await diff(path, "file", false)).patch;
    await assert.rejects(apply(path, "file", false, patch, [9999]), /Select changed lines/);
    await apply(path, "file", false, patch, ids(patch, (line) => line === "-b"));
    assert.equal((await git(path, ["show", ":file"])).stdout, "a\nc\n");
    patch = (await diff(path, "file", false)).patch;
    await apply(path, "file", false, patch, ids(patch));
    assert.equal((await git(path, ["ls-files", "--", "file"])).stdout, "");
    patch = (await diff(path, "file", true)).patch;
    await apply(path, "file", true, patch, ids(patch, (line) => line === "-b"));
    assert.equal((await git(path, ["show", ":file"])).stdout, "b\n");
    await assert.rejects(readFile(join(path, "file")), /ENOENT/);
  } finally { await rm(path, { recursive: true, force: true }); }
});
