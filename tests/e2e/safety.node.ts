import { test } from "node:test";
import assert from "node:assert/strict";
import {
  APP_ORIGIN,
  API_ORIGIN,
  assertOrigin,
  cleanEnvironment,
  applicationEnvironment,
  readSession,
} from "./safety.ts";

test("only exact loopback origins are accepted; remote projects and redirects are not configurable", () => {
  for (const origin of [APP_ORIGIN, API_ORIGIN])
    assert.doesNotThrow(() => assertOrigin(origin, origin));
  for (const value of [
    "https://example.supabase.co",
    "https://example.vercel.app",
    "http://localhost:4317",
    "http://127.0.0.1:4318",
    "http://user:pass@127.0.0.1:4317",
    `${APP_ORIGIN}/?target=remote`,
    `${APP_ORIGIN}/redirect`,
  ]) {
    assert.throws(() => assertOrigin(value, APP_ORIGIN));
  }
});
test("application process receives no inherited remote targets or admin credentials", () => {
  const original = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  try {
    assert.equal(cleanEnvironment().NEXT_PUBLIC_SUPABASE_URL, undefined);
    const env = applicationEnvironment({
      directory: "",
      projectId: "",
      mode: "smoke",
      apiURL: "http://127.0.0.1:9",
      anonKey: "synthetic",
      serviceKey: "never-to-app",
    });
    assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, "http://127.0.0.1:9");
    assert.equal(env.AI_SERVICE_URL, "");
    assert.equal(Object.values(env).includes("never-to-app"), false);
  } finally {
    if (original === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = original;
  }
});
test("direct invocation without a generated private session fails closed", () => {
  const previous = process.env.PIGGIE_E2E_SESSION;
  delete process.env.PIGGIE_E2E_SESSION;
  try {
    assert.throws(() => readSession(), /Run through/);
  } finally {
    if (previous) process.env.PIGGIE_E2E_SESSION = previous;
  }
});
