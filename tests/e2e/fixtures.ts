import { test as base, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  APP_ORIGIN,
  API_ORIGIN,
  readSession,
  cleanEnvironment,
} from "./safety.ts";

type Account = { id: string; email: string; password: string };
export type Snapshot = {
  photos: {
    id: string;
    storage_path: string;
    display_name: string | null;
    ai_status: string;
    updated_at: string;
  }[];
  pets: { id: string; name: string }[];
  predictions: {
    id: string;
    photo_id: string;
    confirmed_pet_ids: string[];
    processing_status: string;
    labels_revision: number;
  }[];
  albums: { id: string; title: string }[];
  memberships: { album_id: string; photo_id: string }[];
  references: { id: string; photo_id: string }[];
  objects: { id: string; bucket_id: string; name: string }[];
  tombstones: { photo_id: string; storage_deleted_at: string | null }[];
};
export type Backend = {
  admin: SupabaseClient;
  snapshot: (owner: string) => Snapshot;
};

export async function login(page: Page, account: Account) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(`${APP_ORIGIN}/dashboard`);
}

export const test = base.extend<{
  backend: Backend;
  accounts: { a: Account; b: Account };
  diagnostics: void;
}>({
  context: async ({ browser }, provide, info) => {
    const session = readSession();
    const context = await browser.newContext({
      baseURL: APP_ORIGIN,
      serviceWorkers: "block",
    });
    context.setDefaultTimeout(15_000);
    context.setDefaultNavigationTimeout(30_000);
    // Fail closed for browser requests, including redirects and signed media.
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      return [APP_ORIGIN, API_ORIGIN].includes(url.origin)
        ? route.continue()
        : route.abort("blockedbyclient");
    });
    await context.routeWebSocket("**/*", (socket) => socket.close());
    if (session.diagnostic)
      await context.tracing.start({
        snapshots: true,
        screenshots: false,
        sources: false,
      });
    try {
      await provide(context);
    } finally {
      if (session.diagnostic) {
        const stem = info.testId.replace(/[^a-zA-Z0-9-]/g, "_");
        await context.tracing.stop({
          path: join(session.directory, `${stem}.trace.zip`),
        });
        writeFileSync(
          join(session.directory, `${stem}.errors.json`),
          JSON.stringify(info.errors),
          { mode: 0o600 },
        );
      }
      await context.close();
    }
  },
  diagnostics: [
    async ({ page }, provide, info) => {
      const counts = { pageErrors: 0, failedRequests: 0 };
      const session = readSession();
      const consoleEvents: { type: string; text: string }[] = [];
      if (session.diagnostic) {
        page.on("console", (message) =>
          consoleEvents.push({ type: message.type(), text: message.text() }),
        );
        page.on("pageerror", (error) =>
          consoleEvents.push({ type: "pageerror", text: String(error) }),
        );
      }
      page.on("pageerror", () => counts.pageErrors++);
      page.on("requestfailed", () => counts.failedRequests++);
      try {
        await provide();
      } finally {
        if (session.diagnostic) {
          const state = await page.evaluate(() => {
            return {
              headings: [...document.querySelectorAll("h1")].map(
                (el) => el.textContent,
              ),
              forms: [...document.querySelectorAll("form")]
                .filter((el) =>
                  el.querySelector('[name="revision"], [name="displayName"]'),
                )
                .map((el) => ({
                  revision: (
                    el.querySelector(
                      '[name="revision"]',
                    ) as HTMLInputElement | null
                  )?.value,
                  buttons: [...el.querySelectorAll("button")].map((b) => ({
                    text: b.textContent,
                    disabled: b.disabled,
                  })),
                  inputs: [
                    ...el.querySelectorAll('input[type="checkbox"]'),
                  ].map((i) => ({
                    name: (i as HTMLInputElement).name,
                    checked: (i as HTMLInputElement).checked,
                  })),
                })),
              styles: [
                ...document.querySelectorAll('link[rel="stylesheet"]'),
              ].map((el) => ({
                href: (el as HTMLLinkElement).href,
                loaded: Boolean((el as HTMLLinkElement).sheet),
              })),
            };
          });
          writeFileSync(
            join(session.directory, "browser-diagnostic.json"),
            JSON.stringify({ consoleEvents, state }),
            { mode: 0o600 },
          );
        }
        if (info.status !== info.expectedStatus) {
          // No screenshot, DOM, URL query, cookies, body, error text or headers.
          await info.attach("safe-diagnostics", {
            body: JSON.stringify({
              ...counts,
              saveLabelButtons: await page
                .getByRole("button", { name: "Save labels", exact: true })
                .count(),
              savingLabelButtons: await page
                .getByRole("button", { name: "Saving…", exact: true })
                .count(),
              route: new URL(
                page.url() === "about:blank" ? APP_ORIGIN : page.url(),
              ).pathname.replace(/[a-f0-9-]{36}/g, "<id>"),
              status: info.status,
            }),
            contentType: "application/json",
          });
        }
      }
    },
    { auto: true },
  ],
  backend: async ({}, provide) => {
    const session = readSession();
    if (session.mode !== "local")
      throw new Error(
        "Full workflows require the disposable local Supabase harness",
      );
    const container = `supabase_db_${session.projectId}`;
    function sql(query: string) {
      const inspected = JSON.parse(
        execFileSync("docker", ["inspect", container], {
          encoding: "utf8",
          env: cleanEnvironment(),
        }),
      )[0];
      if (
        inspected.Config.Labels["com.supabase.cli.project"] !==
        session.projectId
      )
        throw new Error("Local database identity mismatch");
      return execFileSync(
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
        {
          encoding: "utf8",
          input: query,
          env: cleanEnvironment(),
          stdio: ["pipe", "pipe", "pipe"],
        },
      ).trim();
    }
    const admin = createClient(session.apiURL, session.serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const url = new URL(
            typeof input === "string"
              ? input
              : input instanceof URL
                ? input.href
                : input.url,
          );
          if (url.origin !== API_ORIGIN)
            throw new Error("Nonlocal API request refused");
          return fetch(input, {
            ...init,
            redirect: "error",
            signal: AbortSignal.timeout(15_000),
          });
        },
      },
    });
    function snapshot(owner: string): Snapshot {
      if (!/^[a-f0-9-]{36}$/.test(owner))
        throw new Error("Invalid synthetic owner");
      const fields = {
        pets: "pets",
        photos: "photos",
        predictions: "photo_pet_predictions",
        albums: "albums",
        memberships: "album_photos",
        references: "pet_reference_photos",
        tombstones: "photo_deletions",
      };
      const entries = Object.entries(fields).map(
        ([key, table]) =>
          `'${key}',(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from public.${table} t where user_id='${owner}')`,
      );
      entries.push(
        `'objects',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'bucket_id',bucket_id) order by name),'[]') from storage.objects where split_part(name,'/',1)='${owner}')`,
      );
      return JSON.parse(
        sql(
          `begin read only;select jsonb_build_object(${entries.join(",")});commit;`,
        ),
      );
    }
    const boundary = sql(
      "begin read only;select count(*) from pg_proc where pronamespace='public'::regnamespace and proowner='piggievault_rpc_writer'::regrole and prosecdef;commit;",
    );
    if (boundary !== "6")
      throw new Error("Final-v4 RPC boundary is unavailable");
    await provide({ admin, snapshot });
  },
  accounts: async ({ backend }, provide) => {
    const created: Account[] = [];
    try {
      for (const label of ["a", "b"]) {
        const email = `e2e-${randomBytes(12).toString("hex")}-${label}@example.invalid`;
        const password = randomBytes(24).toString("base64url");
        const { data, error } = await backend.admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });
        if (error || !data.user)
          throw new Error("Synthetic account creation failed");
        created.push({ id: data.user.id, email, password });
      }
      await provide({ a: created[0], b: created[1] });
    } finally {
      let failed = false;
      for (const account of created) {
        try {
          // Only IDs created by this fixture. The entire disposable stack is also destroyed.
          for (const bucket of ["user-photos", "pet-avatars"]) {
            const paths = backend
              .snapshot(account.id)
              .objects.filter((row) => row.bucket_id === bucket)
              .map((row) => row.name);
            if (paths.length) {
              const { error } = await backend.admin.storage
                .from(bucket)
                .remove(paths);
              if (error) throw new Error("Synthetic Storage cleanup failed");
            }
          }
          const { error } = await backend.admin.auth.admin.deleteUser(
            account.id,
          );
          if (error) throw new Error("Synthetic Auth cleanup failed");
          const after = backend.snapshot(account.id);
          if (
            after.photos.length ||
            after.pets.length ||
            after.objects.length ||
            after.albums.length
          )
            throw new Error("Synthetic cleanup preservation check failed");
          // Tombstones intentionally survive account deletion until stack disposal.
        } catch {
          failed = true;
        }
      }
      if (failed)
        throw new Error(
          "Synthetic cleanup incomplete; harness must remove its disposable stack",
        );
    }
  },
});
export { expect };
