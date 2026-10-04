import { test } from "node:test";
import assert from "node:assert/strict";
import { backgroundEntries, timelineEntries, fileTarget, mergeEntries } from "../src/data.ts";

test("storage paths retain thread ownership and never match sibling roots", () => {
  assert.deepEqual(fileTarget("/storage/t/a.png", "t", "/storage/t", "env"), { kind: "thread-storage", threadId: "t", path: "a.png" });
  assert.deepEqual(fileTarget("/storage/two/a.png", "t", "/storage/t", "env"), { kind: "workspace", environmentId: "env", path: "/storage/two/a.png" });
  assert.equal(fileTarget("/work/a.png", "t", "", null), undefined);
});

test("background completion wins over older running events, regardless of response order", () => {
  const events = [
    { seq: 3, type: "item/backgroundTask/completed", data: { item: { id: "a", type: "backgroundTask", taskStatus: "completed", description: "pnpm dev" } } },
    { seq: 2, type: "item/backgroundTask/progress", data: { item: { id: "b", type: "backgroundTask", taskStatus: "running", description: "build" } } },
    { seq: 1, type: "item/started", data: { item: { id: "a", type: "backgroundTask", taskStatus: "running", description: "pnpm dev" } } },
  ] as Parameters<typeof backgroundEntries>[0];
  assert.deepEqual(backgroundEntries(events).map((x) => x.id), ["b"]);
});

test("timeline keeps parent results, deduplicates sources and excludes unsafe URLs and child output", () => {
  const rows = [{ kind: "turn", children: [
    { kind: "work", status: "completed", workKind: "image-generation", path: "/storage/t/a.png" },
    { kind: "work", status: "error", workKind: "image-generation", path: "/storage/t/failed.png" },
    { kind: "work", status: "completed", workKind: "web-fetch", url: "https://example.com/" },
    { kind: "work", status: "completed", workKind: "web-fetch", url: "https://example.com/" },
    { kind: "work", status: "completed", workKind: "web-fetch", url: "javascript:alert(1)" },
    { kind: "work", status: "completed", workKind: "delegation", callId: "child", toolName: "agent", childRows: [{ kind: "work", status: "completed", workKind: "image-generation", path: "/child.png" }] },
  ] }] as Parameters<typeof timelineEntries>[0];
  const result = timelineEntries(rows, "t", "/storage/t", "env");
  assert.equal(result.results.length, 1);
  assert.equal(result.sources.length, 1);
  assert.equal(result.agents.length, 1);
  const duplicate = { ...result.results[0], id: "a.png" };
  assert.equal(mergeEntries(result.results, [duplicate]).length, 1);
});

test("native agents retain transcript and explicit execution metadata and deduplicate by child reference", () => {
  const history = [{ id: "answer", kind: "conversation", role: "assistant", text: "Done" }];
  const rows = [
    { kind: "work", workKind: "tool", callId: "call", toolArgs: { model: "gpt-test", reasoning_effort: "high" } },
    { kind: "work", workKind: "delegation", callId: "call", childRef: "agent-1", description: "Review", status: "completed", childRows: history, output: "Done" },
  ] as Parameters<typeof timelineEntries>[0];
  const [agent] = timelineEntries(rows, "t", "", null).agents;
  assert.equal(agent.id, "agent-1");
  assert.equal(agent.model, "gpt-test");
  assert.equal(agent.reasoning, "high");
  assert.equal(agent.history, history);
  const unknown = timelineEntries(rows.slice(1), "t", "", null).agents[0];
  assert.equal(unknown.model, undefined);
  assert.equal(unknown.reasoning, undefined);
});

test("agent titles clean service paths while preserving supplied task names", async () => {
  const { agentName } = await import("../src/data.ts");
  assert.equal(agentName("/root/design_documenter"), "Документация дизайна");
  assert.equal(agentName("/root/impeccable_finish_reviewer"), "Проверка интерфейса");
  assert.equal(agentName("/root/review_docs"), "Review docs");
  assert.equal(agentName("Review docs"), "Review docs");
  assert.equal(agentName("Проверить API /users"), "Проверить API /users");
});

test("activity groups preserve messages and keep child tools in their own delegation", async () => {
  const { historyBlocks } = await import("../src/data.ts");
  const rows = [{ kind: "turn", children: [
    { id: "task", kind: "conversation", role: "user", text: "Review" },
    { id: "cmd", kind: "work", workKind: "command" },
    { id: "delegate", kind: "work", workKind: "delegation", childRows: [{ id: "nested", kind: "work" }] },
    { id: "answer", kind: "conversation", role: "assistant", text: "Result" },
  ] }] as Parameters<typeof historyBlocks>[0];
  assert.deepEqual(historyBlocks(rows).map((block) => block.map((row) => row.id)), [["task"], ["cmd", "delegate"], ["answer"]]);
});
