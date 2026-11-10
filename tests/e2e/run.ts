import { spawnSync } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  symlinkSync,
  openSync,
  closeSync,
  rmSync,
  lstatSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { createServer } from "node:net";
import {
  API_ORIGIN,
  APP_ORIGIN,
  ROOT,
  RUNS,
  V4_HASH,
  cleanEnvironment,
  applicationEnvironment,
  assertOrigin,
  type Session,
} from "./safety.ts";

const mode = process.argv[2];
const diagnostic = process.argv[3] === "--diagnostics";
if (
  !["smoke", "local", "lifecycle", "all"].includes(mode) ||
  process.argv.length !== (diagnostic ? 4 : 3)
)
  throw new Error(
    "Choose smoke, local, lifecycle or all; external URLs and existing stacks are not supported",
  );
const id = randomBytes(12).toString("hex");
const directory = join(RUNS, `run-${id}`);
mkdirSync(directory, { recursive: true, mode: 0o700 });
const projectId = `pv-e2e-${id}`;
const env = {
  ...cleanEnvironment(),
  SUPABASE_HOME: join(directory, "cli-state"),
  SUPABASE_TELEMETRY_DISABLED: "1",
  SUPABASE_ACCESS_TOKEN: "",
};
const log = openSync(join(directory, "harness.log"), "a", 0o600);
let stackAttempted = false;
const cli = join(ROOT, "node_modules/.bin/supabase");
const backend = join(directory, "backend");
const sessionFile = join(directory, "session.json");

function command(
  bin: string,
  args: string[],
  options: {
    cwd?: string;
    input?: string;
    capture?: boolean;
    env?: NodeJS.ProcessEnv;
  } = {},
) {
  const result = spawnSync(bin, args, {
    cwd: options.cwd ?? ROOT,
    env: options.env ?? env,
    input: options.input,
    encoding: "utf8",
    timeout: 900_000,
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["pipe", options.capture ? "pipe" : log, log],
  });
  if (result.status !== 0)
    throw new Error(
      `Local E2E command failed (${bin.split("/").pop()}); details remain in private harness.log`,
    );
  return result.stdout ?? "";
}
async function vacant(port: number) {
  await new Promise<void>((resolve, reject) => {
    const server = createServer();
    server.once("error", (error: NodeJS.ErrnoException) =>
      reject(
        new Error(
          error.code === "EADDRINUSE"
            ? `E2E port ${port} is occupied; refusing to reuse a server`
            : `E2E cannot bind local port ${port} (${error.code})`,
        ),
      ),
    );
    server.listen(port, "127.0.0.1", () =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
}
function setSection(
  config: string,
  section: string,
  values: Record<string, string>,
) {
  const escaped = section.replaceAll(".", "\\.");
  const pattern = new RegExp(`(\\[${escaped}\\]\\n)([\\s\\S]*?)(?=\\n\\[|$)`);
  if (!pattern.test(config))
    throw new Error("Pinned CLI configuration shape changed");
  return config.replace(pattern, (_, heading: string, body: string) => {
    for (const [key, value] of Object.entries(values)) {
      const line = new RegExp(`^${key} = .*`, "m");
      if (!line.test(body))
        throw new Error("Pinned CLI configuration field changed");
      body = body.replace(line, `${key} = ${value}`);
    }
    return heading + body;
  });
}
try {
  await vacant(4317);
  let session: Session = {
    directory,
    projectId,
    mode: mode === "smoke" ? "smoke" : "local",
    diagnostic,
    apiURL: "http://127.0.0.1:9",
    anonKey: "synthetic-smoke-only",
  };
  if (mode !== "smoke") {
    for (const port of [54380, 54381, 54382, 54383, 54384, 54389])
      await vacant(port);
    if (process.env.DOCKER_HOST)
      throw new Error(
        "Unset DOCKER_HOST; only local Unix-socket Docker is permitted",
      );
    const context = JSON.parse(
      command("docker", ["context", "inspect"], { capture: true }),
    );
    if (!context[0].Endpoints.docker.Host.startsWith("unix://"))
      throw new Error("Remote Docker is forbidden");
    mkdirSync(backend);
    command(cli, ["init", "--workdir", backend]);
    const configPath = join(backend, "supabase/config.toml");
    let config = readFileSync(configPath, "utf8").replace(
      /^project_id = .*/m,
      `project_id = "${projectId}"`,
    );
    config = setSection(config, "api", { port: "54381" });
    config = setSection(config, "db", {
      port: "54382",
      shadow_port: "54380",
      major_version: "17",
    });
    config = setSection(config, "db.seed", { enabled: "false" });
    config = setSection(config, "auth", {
      site_url: `"${APP_ORIGIN}"`,
      additional_redirect_urls: "[]",
    });
    config = setSection(config, "auth.email", {
      enable_confirmations: "false",
    });
    writeFileSync(configPath, config, { mode: 0o600 });
    stackAttempted = true;
    console.log(
      "Starting a fresh local Supabase stack (no linked project, private fixtures or remote credentials).",
    );
    command(cli, [
      "start",
      "--workdir",
      backend,
      "--exclude",
      "studio,realtime,imgproxy,mailpit,postgres-meta,edge-runtime,logflare,vector,supavisor",
    ]);
    const status = JSON.parse(
      command(cli, ["status", "--workdir", backend, "--output", "json"], {
        capture: true,
      }),
    );
    assertOrigin(status.API_URL, API_ORIGIN);
    const container = `supabase_db_${projectId}`;
    const inspect = JSON.parse(
      command("docker", ["inspect", container], { capture: true }),
    )[0];
    if (inspect.Config.Labels["com.supabase.cli.project"] !== projectId)
      throw new Error("Disposable database identity mismatch");
    const sql = (input: string) =>
      command(
        "docker",
        [
          "exec",
          "-i",
          container,
          "psql",
          "-X",
          "-qAt",
          "-v",
          "ON_ERROR_STOP=1",
          "-U",
          "postgres",
          "-d",
          "postgres",
        ],
        { input, capture: true },
      ).trim();
    if (
      sql(
        "select current_user='postgres' and session_user='postgres' and not rolsuper and rolcreaterole from pg_roles where rolname=current_user;",
      ) !== "t"
    ) {
      throw new Error(
        "Local Supabase postgres role does not match the reviewed non-superuser migration prerequisite; refusing to change role security or migration SQL",
      );
    }
    const files = command(
      "git",
      [
        "ls-files",
        "--cached",
        "--others",
        "--exclude-standard",
        "supabase/migrations",
      ],
      { capture: true },
    )
      .trim()
      .split("\n")
      .sort();
    if (files.length !== 15)
      throw new Error("Expected exactly migrations 0001–0015");
    for (const file of files) {
      const bytes = readFileSync(join(ROOT, file));
      if (
        file.includes("/0015_") &&
        createHash("sha256").update(bytes).digest("hex") !== V4_HASH
      )
        throw new Error("V4 checksum mismatch");
      sql(bytes.toString());
    }
    // Notifications are local; reload PostgREST's schema cache after DDL.
    sql("notify pgrst, 'reload schema';");
    session = {
      ...session,
      apiURL: API_ORIGIN,
      anonKey: status.ANON_KEY,
      serviceKey: status.SERVICE_ROLE_KEY,
    };
    if (!session.anonKey || !session.serviceKey)
      throw new Error("Local CLI did not provide expected credentials");
  }
  writeFileSync(sessionFile, JSON.stringify(session), { mode: 0o600 });
  const app = join(directory, "app");
  mkdirSync(app);
  // Explicit source allowlist: no .env, .git, .local, datasets or generated build.
  const paths = [
    "app",
    "components",
    "lib",
    "public",
    "proxy.ts",
    "next.config.ts",
    "next-env.d.ts",
    "tsconfig.json",
    "postcss.config.mjs",
    "package.json",
    "pnpm-lock.yaml",
  ];
  for (const path of paths) {
    if (path === "public" && !existsSync(join(ROOT, path))) continue;
    cpSync(join(ROOT, path), join(app, path), {
      recursive: true,
      filter: (source) => {
        if (lstatSync(source).isSymbolicLink())
          throw new Error("Application source symlinks are not accepted");
        return true;
      },
    });
  }
  symlinkSync(join(ROOT, "node_modules"), join(app, "node_modules"), "dir");
  console.log(
    "Building isolated application snapshot with local-only Supabase and no AI credentials.",
  );
  command(
    process.execPath,
    [join(ROOT, "node_modules/next/dist/bin/next"), "build", "--webpack"],
    { cwd: app, env: applicationEnvironment(session) },
  );
  const result = spawnSync(
    process.execPath,
    [
      join(ROOT, "node_modules/@playwright/test/cli.js"),
      "test",
      ...(mode === "all"
        ? []
        : [`--project=${mode === "smoke" ? "smoke" : "local"}`]),
      ...(mode === "lifecycle"
        ? [
            "--grep=private library lifecycle preserves other photos and the other owner",
          ]
        : []),
    ],
    {
      cwd: ROOT,
      env: { ...cleanEnvironment(), PIGGIE_E2E_SESSION: sessionFile },
      stdio: "inherit",
    },
  );
  process.exitCode = result.status ?? 1;
} catch (error) {
  writeFileSync(join(directory, "failure.log"), String(error), { mode: 0o600 });
  console.error(
    "Local E2E failed; details are in the private run directory's failure.log and harness.log.",
  );
  process.exitCode = 1;
} finally {
  if (stackAttempted) {
    try {
      command(cli, [
        "stop",
        "--workdir",
        backend,
        "--project-id",
        projectId,
        "--no-backup",
      ]);
    } catch {
      console.error(
        `Cleanup failed for disposable project ${projectId}; run the documented targeted cleanup before retrying`,
      );
      process.exitCode = 1;
    }
  }
  // Runtime credentials are short-lived; logs remain private and are never CI artifacts.
  rmSync(sessionFile, { force: true });
  closeSync(log);
  console.log(`Private run directory: .local/piggievault-e2e/run-${id}`);
}
