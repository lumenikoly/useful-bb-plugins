import { spawn } from "node:child_process";
import type { Action, Change, Snapshot, Branch, Commit, Inspection } from "./contracts.ts";

export async function git(path: string, args: string[], options: {
  signal?: AbortSignal; env?: NodeJS.ProcessEnv; allowed?: number[]; onOutput?: (s: string) => void;
} = {}) {
  options.signal?.throwIfAborted();
  return await new Promise<{ stdout: string; stderr: string; code: number }>((done, reject) => {
    const child = spawn("git", ["--no-pager", "--literal-pathspecs", "-c", "color.ui=false", "-C", path, ...args], {
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...options.env },
      stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32",
    });
    let stdout = "", stderr = "", bytes = 0, failure: Error | undefined;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const kill = (signal: NodeJS.Signals) => {
      if (!child.pid) return;
      try { if (process.platform === "win32") child.kill(signal); else process.kill(-child.pid, signal); } catch { /* already exited */ }
    };
    const stop = (error: Error) => {
      if (failure) return;
      failure = error;
      kill("SIGTERM");
      killTimer = setTimeout(() => kill("SIGKILL"), 1500);
      killTimer.unref();
    };
    const abort = () => stop(new Error("Операция отменена."));
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    const timeout = setTimeout(() => stop(new Error("Git не завершился за 10 минут.")), 600_000);
    const receive = (stream: "stdout" | "stderr", s: string) => {
      bytes += Buffer.byteLength(s);
      if (bytes > 4 * 1024 * 1024) { stop(new Error("Вывод Git превышает 4 MiB. Сузьте выбор файлов.")); return; }
      if (stream === "stdout") stdout += s; else stderr += s;
      options.onOutput?.(s);
    };
    child.stdout.setEncoding("utf8").on("data", (s: string) => receive("stdout", s));
    child.stderr.setEncoding("utf8").on("data", (s: string) => receive("stderr", s));
    const cleanup = () => { clearTimeout(timeout); if (killTimer) clearTimeout(killTimer); options.signal?.removeEventListener("abort", abort); };
    child.on("error", (error) => { cleanup(); reject(error); });
    child.on("close", (code) => {
      // A hook/SSH child may outlive its Git parent after cancellation.
      if (failure) kill("SIGKILL");
      cleanup();
      if (failure) reject(failure);
      else if (!(options.allowed ?? [0]).includes(code ?? -1)) reject(new Error(stderr.trim() || stdout.trim() || `Git завершился с кодом ${code}.`));
      else done({ stdout, stderr, code: code ?? -1 });
    });
  });
}

export async function repository(path: string, signal?: AbortSignal) {
  const { stdout } = await git(path, ["rev-parse", "--show-toplevel"], { signal });
  return stdout.replace(/\r?\n$/, "");
}

export function parseStatus(raw: string): Change[] {
  const fields = raw.split("\0"), result: Change[] = [];
  for (let i = 0; i < fields.length && fields[i]; i++) {
    const field = fields[i];
    const index = field[0], worktree = field[1];
    const original = /[RC]/.test(index + worktree) ? fields[++i] : null;
    result.push({ path: field.slice(3), original, index, worktree,
      conflict: index === "U" || worktree === "U" || index + worktree === "AA" || index + worktree === "DD" });
  }
  return result;
}

export async function snapshot(path: string, signal?: AbortSignal): Promise<Snapshot> {
  const root = await repository(path, signal);
  const read = async (args: string[], allowed = [0]) => (await git(root, args, { signal, allowed })).stdout.replace(/\r?\n$/, "");
  const config = async (key: string, local = false) => read(["config", ...(local ? ["--local"] : []), "--get", key], [0, 1]);
  const [status, branch, head, upstream, remoteNames, name, email, sshCommand, localName, localEmail, localSshCommand] = await Promise.all([
    read(["status", "--porcelain=v1", "-z", "--untracked-files=all"]),
    read(["symbolic-ref", "--quiet", "--short", "HEAD"], [0, 1]),
    read(["rev-parse", "--verify", "--quiet", "HEAD"], [0, 1]),
    read(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], [0, 128]),
    read(["remote"]),
    config("user.name"), config("user.email"), config("core.sshCommand"),
    config("user.name", true), config("user.email", true), config("core.sshCommand", true),
  ]);
  const remotes = await Promise.all(remoteNames.split("\n").filter(Boolean).map(async (remote) => ({
    name: remote, url: await read(["remote", "get-url", "--", remote]), pushUrl: await read(["remote", "get-url", "--push", "--", remote]),
  })));
  let ahead = 0, behind = 0;
  if (upstream && head) [ahead, behind] = (await read(["rev-list", "--left-right", "--count", "HEAD...@{upstream}"])).split(/\s+/).map(Number);
  const refsRaw = await read(["for-each-ref", "--sort=refname", "--format=%(refname)%00%(objectname)%00%(HEAD)%00%(upstream:short)%00%(worktreepath)%00%(symref)", "refs/heads/", "refs/remotes/"]);
  const refs: Branch[] = refsRaw.split("\n").filter(Boolean).flatMap((line) => {
    const [ref, hash, current, upstream, worktree, symref] = line.split("\0");
    if (symref) return [];
    const remote = ref.startsWith("refs/remotes/") ? remoteNames.split("\n").sort((a, b) => b.length - a.length).find((name) => ref.startsWith(`refs/remotes/${name}/`)) ?? "" : "";
    return [{ ref, hash, current: current === "*", upstream, worktree, remote, name: ref.replace(/^refs\/(heads|remotes)\//, "") }];
  });
  const merging = (await git(root, ["rev-parse", "--verify", "--quiet", "MERGE_HEAD"], { signal, allowed: [0, 1] })).code === 0;
  const history = head ? (await log(root, "HEAD", 30, signal)).commits.map(({ hash, subject, author, date }) => ({ hash, subject, author, date })) : [];
  return { root, branch: branch || `detached ${head.slice(0, 8)}`, unborn: !head, upstream, ahead, behind,
    changes: parseStatus(status), refs, merging, branches: refs.filter((ref) => !ref.remote).map((ref) => ref.name), history, remotes,
    config: { name, email, sshCommand, localName, localEmail, localSshCommand }, activeJob: null };
}

export async function diff(path: string, pathspec: string, staged: boolean, signal?: AbortSignal) {
  const root = await repository(path, signal);
  const changes = parseStatus((await git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"], { signal })).stdout);
  const change = changes.find((c) => c.path === pathspec);
  if (!change) throw new Error("Файл больше не изменён. Обновите список.");
  const paths = [pathspec, ...(change.original ? [change.original] : [])];
  const args = change.index === "?"
    ? ["diff", "--no-index", "--no-ext-diff", "--no-textconv", "--", process.platform === "win32" ? "NUL" : "/dev/null", pathspec]
    : ["diff", ...(staged ? ["--cached"] : []), "--no-ext-diff", "--no-textconv", "--", ...paths];
  const result = await git(root, args, { signal, allowed: [0, 1] });
  return { path: pathspec, patch: result.stdout };
}

export async function perform(path: string, action: Action, options: Parameters<typeof git>[2]) {
  const run = (args: string[], allowed?: number[]) => git(path, args, { ...options, allowed });
  if (action.kind === "stage" || action.kind === "unstage") {
    const status = parseStatus((await git(path, ["status", "--porcelain=v1", "-z", "--untracked-files=all"], { signal: options?.signal })).stdout);
    const paths = action.paths.flatMap((p) => {
      const change = status.find((c) => c.path === p);
      if (!change) throw new Error(`Файл больше не изменён: ${p}`);
      return [p, ...(change.original ? [change.original] : [])];
    });
    if (action.kind === "stage") await run(["add", "--all", "--", ...paths]);
    else {
      const head = await git(path, ["rev-parse", "--verify", "--quiet", "HEAD"], { signal: options?.signal, allowed: [0, 1] });
      await run(head.code === 0 ? ["reset", "--quiet", "HEAD", "--", ...paths] : ["rm", "--cached", "--quiet", "--", ...paths]);
    }
  } else if (action.kind === "commit") await run(["commit", "-m", action.message]);
  else if (action.kind === "pull") await run(["pull", "--ff-only"]);
  else if (action.kind === "fetch" || action.kind === "push" || action.kind === "remote") {
    const names = (await git(path, ["remote"], { signal: options?.signal })).stdout.split(/\r?\n/);
    if (!names.includes(action.remote)) throw new Error("Remote не найден. Обновите список.");
    if (action.kind === "remote") await run(["remote", "set-url", "--", action.remote, action.url]);
    else if (action.kind === "fetch") await run(["fetch", "--", action.remote]);
    else {
      const branch = await git(path, ["symbolic-ref", "--quiet", "--short", "HEAD"], { signal: options?.signal, allowed: [0, 1] });
      if (!branch.stdout.trim()) throw new Error("Для Push сначала переключитесь на ветку.");
      const upstream = await git(path, ["for-each-ref", "--format=%(upstream:remotename)%00%(upstream:remoteref)", `refs/heads/${branch.stdout.trim()}`], { signal: options?.signal });
      const [remote, ref] = upstream.stdout.trim().split("\0");
      await run(remote === action.remote && ref ? ["push", "--", action.remote, `HEAD:${ref}`] : ["push", "--set-upstream", "--", action.remote, "HEAD"]);
    }
  } else if (action.kind === "switch") {
    await run(action.create ? ["switch", "-c", action.branch] : ["switch", "--", action.branch]);
  } else if (action.kind === "branch-create") {
    await run(["check-ref-format", "--branch", action.name]);
    await run(["switch", "-c", action.name, ...(action.track ? ["--track"] : ["--no-track"]), action.from]);
  } else if (action.kind === "branch-rename") {
    await run(["branch", "-m", "--", action.branch, action.name]);
  } else if (action.kind === "branch-delete") {
    await run(["branch", "-d", "--", action.branch]);
  } else if (action.kind === "merge") {
    const status = await git(path, ["status", "--porcelain=v1"], { signal: options?.signal });
    if (status.stdout) throw new Error("Перед merge закоммитьте изменения. Рабочая директория должна быть чистой.");
    await run(["merge", "--no-edit", "--", action.branch]);
  } else if (action.kind === "merge-abort") await run(["merge", "--abort"]);
  else if (action.kind === "merge-continue") {
    await git(path, ["rev-parse", "--verify", "MERGE_HEAD"], { signal: options?.signal });
    await run(["commit", "--no-edit"]);
  }
  else if (action.kind === "account") {
    for (const [key, value] of [["user.name", action.name], ["user.email", action.email], ["core.sshCommand", action.sshCommand]]) {
      await run(value ? ["config", "--local", "--replace-all", key, value] : ["config", "--local", "--unset-all", key], value ? [0] : [0, 5]);
    }
  }
}


async function resolveCommit(path: string, ref: string, signal?: AbortSignal) {
  return (await git(path, ["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`], { signal })).stdout.trim();
}

export async function log(path: string, ref: string, limit: number, signal?: AbortSignal) {
  const revision = ref ? [await resolveCommit(path, ref, signal)] : ["--all"];
  const raw = (await git(path, ["log", "--topo-order", `-${limit + 1}`, "--format=%H%x00%P%x00%s%x00%an%x00%aI", "-z", ...revision, "--"], { signal })).stdout;
  const fields = raw.split("\0"), commits: Commit[] = [];
  for (let i = 0; i + 4 < fields.length; i += 5) {
    commits.push({ hash: fields[i], parents: fields[i + 1].split(" ").filter(Boolean), subject: fields[i + 2], author: fields[i + 3], date: fields[i + 4] });
  }
  return { commits: commits.slice(0, limit), more: commits.length > limit };
}

export async function inspect(path: string, revision: string, compare: boolean, signal?: AbortSignal): Promise<Inspection> {
  const tip = await resolveCommit(path, revision, signal);
  const raw = (await git(path, ["show", "-s", "--format=%P%x00%B%x00%an%x00%ae%x00%aI", tip, "--"], { signal })).stdout;
  const [parents, message, author, email, date] = raw.split("\0");
  const base = compare ? await resolveCommit(path, "HEAD", signal) : parents.split(" ")[0] || null;
  const args = base ? ["diff", "--name-status", "-z", "-M", base, tip, "--"] : ["diff-tree", "--root", "--no-commit-id", "--name-status", "-r", "-z", "-M", tip, "--"];
  const names = (await git(path, args, { signal })).stdout.split("\0");
  const files: Inspection["files"] = [];
  for (let i = 0; i < names.length && names[i];) {
    const status = names[i++], first = names[i++];
    const renamed = /^[RC]/.test(status);
    files.push({ status, original: renamed ? first : null, path: renamed ? names[i++] : first });
  }
  return { tip, base, message: message.trimEnd(), author, email, date: date.trim(), files };
}

export async function revisionDiff(path: string, tip: string, base: string | null, pathspec: string, original: string | null, signal?: AbortSignal) {
  const args = base ? ["diff", base, tip] : ["show", "--format=", "--root", tip];
  const result = await git(path, [...args, "--no-ext-diff", "--no-textconv", "--", pathspec, ...(original ? [original] : [])], { signal });
  return { patch: result.stdout, path: pathspec };
}
