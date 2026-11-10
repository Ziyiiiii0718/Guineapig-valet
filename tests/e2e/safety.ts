import { readFileSync, realpathSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const RUNS = resolve(ROOT, ".local/piggievault-e2e");
export const APP_ORIGIN = "http://127.0.0.1:4317";
export const API_ORIGIN = "http://127.0.0.1:54381";
export const V4_HASH =
  "301d60547667959a045c86b315ad16fd3fbc11bf1e1f8a685b00c110d9a67f71";
export type Session = {
  directory: string;
  mode: "smoke" | "local";
  projectId: string;
  apiURL: string;
  anonKey: string;
  serviceKey?: string;
  diagnostic?: boolean;
};

export function assertOrigin(value: string, expected: string) {
  const url = new URL(value);
  if (
    url.origin !== expected ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.hostname !== "127.0.0.1"
  ) {
    throw new Error("E2E refuses a noncanonical or non-loopback target");
  }
}

export function readSession(): Session {
  const filename = process.env.PIGGIE_E2E_SESSION;
  if (!filename)
    throw new Error(
      "Run through test:e2e:smoke or test:e2e:local; no external target is accepted",
    );
  const real = realpathSync(filename);
  const directory = dirname(real);
  if (
    dirname(directory) !== realpathSync(RUNS) ||
    basename(real) !== "session.json" ||
    !/^run-[a-f0-9]{24}$/.test(basename(directory))
  ) {
    throw new Error(
      "E2E session must belong to its private generated run directory",
    );
  }
  const data = JSON.parse(readFileSync(real, "utf8")) as Session;
  if (
    data.directory !== directory ||
    data.projectId !== `pv-e2e-${basename(directory).slice(4)}` ||
    !["smoke", "local"].includes(data.mode) ||
    typeof data.anonKey !== "string" ||
    !data.anonKey
  ) {
    throw new Error("Invalid E2E session identity");
  }
  assertOrigin(
    data.apiURL,
    data.mode === "local" ? API_ORIGIN : "http://127.0.0.1:9",
  );
  if (data.mode === "local" && !data.serviceKey)
    throw new Error("Local stack credentials unavailable");
  return data;
}

export function cleanEnvironment(): NodeJS.ProcessEnv {
  // Do not inherit .env, Supabase/AI/Vercel targets, Node preload hooks or proxies.
  return {
    NODE_ENV: "test",
    ...Object.fromEntries(
      ["PATH", "HOME", "TMPDIR", "SystemRoot", "DOCKER_CONTEXT"].flatMap(
        (key) => (process.env[key] ? [[key, process.env[key]!]] : []),
      ),
    ),
  };
}

export function applicationEnvironment(session: Session): NodeJS.ProcessEnv {
  return {
    ...cleanEnvironment(),
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    NEXT_PUBLIC_SUPABASE_URL: session.apiURL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: session.anonKey,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
    AI_SERVICE_URL: "",
    AI_SERVICE_TOKEN: "",
  };
}
