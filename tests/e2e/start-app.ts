import { spawn } from "node:child_process";
import { openSync } from "node:fs";
import { join } from "node:path";
import { applicationEnvironment, readSession, ROOT } from "./safety.ts";

const session = readSession();
const log = openSync(join(session.directory, "server.log"), "a", 0o600);
const server = spawn(
  process.execPath,
  [
    join(ROOT, "node_modules/next/dist/bin/next"),
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "4317",
  ],
  {
    cwd: join(session.directory, "app"),
    env: applicationEnvironment(session),
    stdio: ["ignore", log, log],
  },
);
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () => server.kill(signal));
server.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
