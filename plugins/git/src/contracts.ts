import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

const text = z.string().max(4096).refine((s) => !s.includes("\0"), "NUL is not allowed");
const ref = text.min(1).refine((s) => !s.startsWith("-"), "Options are not allowed");
const file = text.min(1).refine((s) => !s.startsWith("/") && !s.split("/").includes(".."), "Use repository-relative paths");
export const actionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.enum(["stage", "unstage"]), paths: z.array(file).min(1).max(1000) }).strict(),
  z.object({ kind: z.literal("commit"), message: z.string().trim().min(1).max(65536).refine((s) => !s.includes("\0")) }).strict(),
  z.object({ kind: z.enum(["fetch", "push"]), remote: ref }).strict(),
  z.object({ kind: z.literal("pull") }).strict(),
  z.object({ kind: z.literal("switch"), branch: ref, create: z.boolean() }).strict(),
  z.object({ kind: z.literal("branch-create"), name: ref, from: ref, track: z.boolean() }).strict(),
  z.object({ kind: z.literal("branch-rename"), branch: ref, name: ref }).strict(),
  z.object({ kind: z.enum(["branch-delete", "merge"]), branch: ref }).strict(),
  z.object({ kind: z.enum(["merge-abort", "merge-continue"]) }).strict(),
  z.object({ kind: z.literal("account"), name: text, email: text, sshCommand: text }).strict(),
  z.object({ kind: z.literal("remote"), remote: ref, url: ref }).strict(),
]);
export type Action = z.infer<typeof actionSchema>;
const configSchema = z.object({ name: text, email: text, sshCommand: text, localName: text, localEmail: text, localSshCommand: text });
const changeSchema = z.object({ path: text, original: text.nullable(), index: z.string(), worktree: z.string(), conflict: z.boolean() });
export type Change = z.infer<typeof changeSchema>;
export const branchSchema = z.object({ ref: text, name: text, remote: text, hash: text, current: z.boolean(), upstream: text, worktree: text });
export type Branch = z.infer<typeof branchSchema>;
const commitSchema = z.object({ hash: text, parents: z.array(text), subject: text, author: text, date: text });
export type Commit = z.infer<typeof commitSchema>;
const hash = z.string().regex(/^[a-f0-9]{40,64}$/);
const logFields = { ref: text, limit: z.number().int().min(1).max(1000) };
const logSchema = z.object({ commits: z.array(commitSchema), more: z.boolean() });
const inspectFields = { revision: ref, compare: z.boolean() };
const inspectSchema = z.object({ tip: hash, base: hash.nullable(), message: z.string(), author: text, email: text, date: text,
  files: z.array(z.object({ path: text, original: text.nullable(), status: text })) });
export type Inspection = z.infer<typeof inspectSchema>;
const revisionDiffFields = { tip: hash, base: hash.nullable(), pathspec: file, original: file.nullable() };
export const snapshotSchema = z.object({
  root: text, branch: text, unborn: z.boolean(), upstream: text,
  ahead: z.number(), behind: z.number(), changes: z.array(changeSchema),
  refs: z.array(branchSchema), merging: z.boolean(), remotes: z.array(z.object({ name: text, url: text, pushUrl: text })),
  config: configSchema,
  // Keep the original response fields for panels still open during a plugin reload.
  branches: z.array(text),
  history: z.array(z.object({ hash: text, subject: text, author: text, date: text })),
  activeJob: z.string().nullable(),
});
export type Snapshot = z.infer<typeof snapshotSchema>;
export const promptSchema = z.object({ id: z.string(), text: z.string().max(16384), secret: z.boolean(), confirm: z.boolean() });
export const jobSchema = z.object({
  id: z.string(), kind: z.string(),
  state: z.enum(["running", "done", "failed", "cancelled"]),
  output: z.string().max(270000), prompt: promptSchema.nullable(),
});
export type Job = z.infer<typeof jobSchema>;
const pathInput = z.object({ path: text.min(1) });
const jobInput = pathInput.extend({ jobId: z.string().uuid() });
const diffInput = pathInput.extend({ pathspec: file, staged: z.boolean() });
const answerInput = jobInput.extend({ promptId: z.string().uuid(), value: z.string().max(8192).refine((s) => !/[\r\n\0]/.test(s)) });
export const hostContract = defineRpcContract({
  snapshot: { input: pathInput, output: snapshotSchema },
  log: { input: pathInput.extend(logFields), output: logSchema },
  inspect: { input: pathInput.extend(inspectFields), output: inspectSchema },
  revisionDiff: { input: pathInput.extend(revisionDiffFields), output: z.object({ patch: z.string(), path: text }) },
  diff: { input: diffInput, output: z.object({ patch: z.string(), path: text }) },
  start: { input: pathInput.extend({ action: actionSchema }), output: jobSchema },
  job: { input: jobInput, output: jobSchema },
  answer: { input: answerInput, output: z.null() },
  cancel: { input: jobInput, output: z.null() },
});
export const targetSchema = z.object({ id: z.string(), projectId: z.string(), hostId: z.string(), path: text, label: z.string() });
export type Target = z.infer<typeof targetSchema>;
const targetInput = z.object({ projectId: z.string(), targetId: z.string() });
export const rpcContract = defineRpcContract({
  projects: { input: z.null(), output: z.array(z.object({ id: z.string(), name: z.string() })) },
  targets: { input: z.object({ projectId: z.string(), threadId: z.string().optional() }), output: z.array(targetSchema) },
  snapshot: { input: targetInput, output: snapshotSchema },
  log: { input: targetInput.extend(logFields), output: logSchema },
  inspect: { input: targetInput.extend(inspectFields), output: inspectSchema },
  revisionDiff: { input: targetInput.extend(revisionDiffFields), output: hostContract.revisionDiff.output },
  diff: { input: targetInput.extend({ pathspec: file, staged: z.boolean() }), output: hostContract.diff.output },
  start: { input: targetInput.extend({ action: actionSchema }), output: jobSchema },
  job: { input: targetInput.extend({ jobId: z.string().uuid() }), output: jobSchema },
  answer: { input: targetInput.extend({ jobId: z.string().uuid(), promptId: z.string().uuid(), value: answerInput.shape.value }), output: z.null() },
  cancel: { input: targetInput.extend({ jobId: z.string().uuid() }), output: z.null() },
});
