// Line IDs refer to the exact diff shown to the user, including its header.
export function patchHunks(patch: string) {
  const lines = patch.split("\n");
  const starts = lines.flatMap((line, i) => /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/.test(line) ? [i] : []);
  const header = lines.slice(0, starts[0] ?? lines.length).join("\n") + "\n";
  const supported = starts.length > 0 && lines.filter((line) => line.startsWith("diff --git ")).length === 1
    && !/^(?:rename |copy |old mode|new mode|.*file mode 120000|index .* (?:120000|160000))/m.test(header);
  return { header, supported, hunks: starts.map((start, i) => ({
    heading: lines[start], patch: header + lines.slice(start, starts[i + 1] ?? lines.length).join("\n").replace(/\n?$/, "\n"),
    lines: lines.slice(start + 1, starts[i + 1] ?? lines.length).flatMap((text, offset) => text ? [{ text, index: start + offset + 1 }] : []),
  })) };
}

export function selectedPatch(patch: string, selected: number[], reverse: boolean) {
  const parsed = patchHunks(patch), chosen = new Set(selected);
  const changes = parsed.hunks.flatMap((h) => h.lines.filter((l) => /^[+-]/.test(l.text)));
  const changeIds = new Set(changes.map((line) => line.index));
  if (!parsed.supported || !chosen.size || selected.some((id) => !changeIds.has(id))) throw new Error("Select changed lines in a regular text file.");
  const oldMarker = parsed.header.match(/^--- (.+)$/m)?.[1], newMarker = parsed.header.match(/^\+\+\+ (.+)$/m)?.[1];
  if (!oldMarker || !newMarker) throw new Error("This diff cannot be staged partially.");
  const prefix = (value: string, side: string) => value.replace(/^("?)[ab]\//, `$1${side}/`);
  const source = reverse ? newMarker : oldMarker, destination = reverse ? oldMarker : newMarker;
  const sourceMissing = source === "/dev/null", destinationMissing = destination === "/dev/null" && changes.every((l) => chosen.has(l.index));
  const mode = parsed.header.match(/^(?:new|deleted) file mode (\d+)$/m)?.[1];
  let result = parsed.header.split("\n")[0] + "\n";
  if (mode && (sourceMissing || destinationMissing)) result += `${sourceMissing ? "new" : "deleted"} file mode ${mode}\n`;
  result += `--- ${sourceMissing ? "/dev/null" : prefix(source, "a")}\n+++ ${destinationMissing ? "/dev/null" : prefix(destination === "/dev/null" ? source : destination, "b")}\n`;
  let shift = 0;
  for (const hunk of parsed.hunks) {
    if (!hunk.lines.some((l) => chosen.has(l.index))) continue;
    const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(hunk.heading)!;
    const sourceStart = Number(match[reverse ? 2 : 1]);
    const body: string[] = [];
    let kept = false;
    for (const line of hunk.lines) {
      const sign = line.text[0];
      if (sign === "\\") { if (kept) body.push(line.text); continue; }
      kept = sign === " " || chosen.has(line.index) || sign === (reverse ? "+" : "-");
      if (!kept) continue;
      const nextSign = sign === " " || !chosen.has(line.index) ? " " : reverse ? sign === "+" ? "-" : "+" : sign;
      body.push(nextSign + line.text.slice(1));
    }
    const oldCount = body.filter((l) => /^[ -]/.test(l)).length, newCount = body.filter((l) => /^[ +]/.test(l)).length;
    const newStart = sourceStart + shift + (oldCount === 0 ? 1 : 0) - (newCount === 0 ? 1 : 0);
    result += `@@ -${sourceStart},${oldCount} +${newStart},${newCount} @@\n${body.join("\n")}\n`;
    shift += newCount - oldCount;
  }
  return result;
}
