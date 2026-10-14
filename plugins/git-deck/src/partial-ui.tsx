import { useState } from "react";
import { experimental_Diff as Diff } from "@get-bb/plugin-sdk/app";
import type { Action } from "./contracts.ts";
import { patchHunks } from "./partial.ts";

type Hunk = ReturnType<typeof patchHunks>["hunks"][number];
export function PartialDiff({ patch, path, staged, view, busy, canPartial, start }: { patch: string; path: string; staged: boolean; view: "split" | "unified"; busy: boolean; canPartial: boolean; start: (action: Action) => Promise<void> }) {
  const parsed = patchHunks(patch);
  if (!parsed.supported || !canPartial) return <Diff patch={patch} path={path} view={view} />;
  return <div className="git-partial-diff">{parsed.hunks.map((hunk, i) => <HunkDiff key={`${path}:${staged}:${hunk.patch}`} hunk={hunk} number={i + 1} patch={patch} path={path} staged={staged} view={view} busy={busy} start={start} />)}</div>;
}
function HunkDiff({ hunk, number, patch, path, staged, view, busy, start }: { hunk: Hunk; number: number; patch: string; path: string; staged: boolean; view: "split" | "unified"; busy: boolean; start: (action: Action) => Promise<void> }) {
  const [selecting, setSelecting] = useState(false), [selected, setSelected] = useState<Set<number>>(new Set());
  const changed = hunk.lines.filter((l) => /^[+-]/.test(l.text));
  const apply = (lines: number[]) => void start({ kind: "stage-part", pathspec: path, staged, expectedPatch: patch, lines });
  return <section className="git-hunk" aria-label={`Change block ${number}`}><div className="git-hunk-heading"><code>{hunk.heading}</code><div><button disabled={busy} onClick={() => apply(changed.map((l) => l.index))}>{staged ? "Unstage hunk" : "Stage hunk"}</button><button aria-pressed={selecting} onClick={() => setSelecting(!selecting)}>{selecting ? "Show diff" : "Select lines"}</button></div></div>
    {selecting ? <><div className="git-line-selection" role="group" aria-label={`Select lines in change block ${number}`}>{hunk.lines.map((line) => <label key={line.index} data-change={line.text[0]}>
      {/^[+-]/.test(line.text) ? <input type="checkbox" aria-label={`Select changed line ${line.text}`} checked={selected.has(line.index)} disabled={busy} onChange={() => setSelected((previous) => { const next = new Set(previous); if (next.has(line.index)) next.delete(line.index); else next.add(line.index); return next; })} /> : <span className="git-line-checkbox-space" />}
      <span>{line.text[0]}</span><code>{line.text.slice(1)}</code>
    </label>)}</div><div className="git-line-actions"><button disabled={busy || !selected.size} onClick={() => apply([...selected])}>{staged ? "Unstage selected lines" : "Stage selected lines"}{selected.size ? ` · ${selected.size}` : ""}</button></div></> : <Diff patch={hunk.patch} path={path} view={view} />}
  </section>;
}
