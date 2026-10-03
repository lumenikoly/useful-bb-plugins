import { randomUUID } from "node:crypto";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Git and OpenSSH both invoke this helper with the prompt in argv and read
// the answer from stdout. The secret stays in pipes and memory, never files.
const helper = String.raw`const net = require('node:net');
const socket = net.connect(process.env.BB_GIT_ASKPASS_SOCKET);
socket.setEncoding('utf8');
socket.on('connect', () => socket.write(JSON.stringify({ token: process.env.BB_GIT_ASKPASS_TOKEN, text: process.argv[2] || 'Password:', confirm: process.env.SSH_ASKPASS_PROMPT === 'confirm' }) + '\n'));
let data = '', answered = false;
socket.on('data', s => { data += s; if (!answered && data.includes('\n')) { try { const answer = JSON.parse(data); answered = true; if (answer.value === null) process.exit(1); process.stdout.write(answer.value + '\n', () => process.exit(0)); } catch { process.exit(1); } } });
socket.on('error', () => process.exit(1));
socket.on('end', () => { if (!answered) process.exit(1); });
socket.setTimeout(600000, () => process.exit(1));
`;
const quote = (s: string) => "'" + s.replaceAll("'", "'\\''") + "'";

export async function createAskpass(ask: (text: string, confirm: boolean) => Promise<string | null>, signal: AbortSignal) {
  if (process.platform === "win32") throw new Error("Ввод пароля в панели пока поддерживается на Linux/macOS. Используйте SSH-agent или системный терминал.");
  const dir = await mkdtemp(join(tmpdir(), "bb-git-"));
  const socketPath = join(dir, "sock"), token = randomUUID();
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("error", () => {});
    socket.on("close", () => sockets.delete(socket));
    socket.setEncoding("utf8");
    let data = "", received = false;
    socket.on("data", (chunk: string) => {
      if (received) return;
      data += chunk;
      if (Buffer.byteLength(data) > 20000) { socket.destroy(); return; }
      if (!data.includes("\n")) return;
      received = true;
      let request: { token: string; text: string; confirm: boolean };
      try { request = JSON.parse(data); } catch { socket.destroy(); return; }
      if (request.token !== token || typeof request.text !== "string" || request.text.length > 16384 || typeof request.confirm !== "boolean") { socket.destroy(); return; }
      void ask(request.text, request.confirm).then((value) => {
        if (!socket.destroyed) socket.end(JSON.stringify({ value }) + "\n");
      }, () => socket.destroy());
    });
  });
  const abort = () => { for (const socket of sockets) socket.destroy(); };
  const dispose = async () => {
    signal.removeEventListener("abort", abort);
    abort();
    if (server.listening) await new Promise<void>((done) => server.close(() => done()));
    await rm(dir, { recursive: true, force: true });
  };
  try {
    await chmod(dir, 0o700);
    await writeFile(join(dir, "helper.cjs"), helper, { mode: 0o600 });
    await writeFile(join(dir, "askpass"), `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(join(dir, "helper.cjs"))} "$@"\n`, { mode: 0o700 });
    await new Promise<void>((done, reject) => { server.once("error", reject); server.listen(socketPath, done); });
    await chmod(socketPath, 0o600);
    signal.addEventListener("abort", abort, { once: true });
    signal.throwIfAborted();
    return { env: {
      GIT_ASKPASS: join(dir, "askpass"), SSH_ASKPASS: join(dir, "askpass"), SSH_ASKPASS_REQUIRE: "force",
      BB_GIT_ASKPASS_SOCKET: socketPath, BB_GIT_ASKPASS_TOKEN: token,
    }, dispose };
  } catch (error) { await dispose(); throw error; }
}
