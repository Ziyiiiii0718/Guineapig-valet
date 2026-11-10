import { deflateSync } from "node:zlib";
import type { Page, Request } from "@playwright/test";
import { expect, type Backend } from "./fixtures.ts";
import { APP_ORIGIN } from "./safety.ts";

// In-memory synthetic PNG; no personal media or checked-in image artifact.
export function syntheticPNG() {
  function chunk(type: string, data: Buffer) {
    const payload = Buffer.concat([Buffer.from(type), data]);
    let crc = 0xffffffff;
    for (const byte of payload) {
      crc ^= byte;
      for (let i = 0; i < 8; i++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    const result = Buffer.alloc(data.length + 12);
    result.writeUInt32BE(data.length);
    payload.copy(result, 4);
    result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
    return result;
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(32);
  header.writeUInt32BE(32, 4);
  header[8] = 8;
  header[9] = 2;
  const pixels = Buffer.alloc(32 * (1 + 32 * 3), 100);
  for (let row = 0; row < 32; row++) pixels[row * 97] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export async function createPet(page: Page, name: string) {
  await page.goto("/pets/new");
  await page.getByLabel(/^Name(?:\s*\*)?$/).fill(name);
  await page.getByLabel(/^Birth date(?:\s*\*)?$/).fill("2024-01-01");
  await page.getByRole("button", { name: "Create pet", exact: true }).click();
  await expect(page).toHaveURL(/\/pets\/[a-f0-9-]{36}(?:\?|$)/);
  return new URL(page.url()).pathname.split("/")[2];
}

export async function upload(
  page: Page,
  backend: Backend,
  owner: string,
  filename: string,
) {
  await page.goto("/photos/upload");
  // Opening the chooser through the UI also proves its client handler is ready.
  const chooserPromise = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: /Drag & drop your photos here/ })
    .click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: filename,
    mimeType: "image/png",
    buffer: syntheticPNG(),
  });
  await expect(page.getByText("Ready", { exact: true })).toBeVisible();
  const finalization = page.waitForRequest((request) => {
    if (
      request.method() !== "POST" ||
      !request.headers()["next-action"] ||
      new URL(request.url()).pathname !== "/photos/upload"
    )
      return false;
    try {
      const args = JSON.parse(request.postData() ?? "null");
      return (
        Array.isArray(args) &&
        args.length === 1 &&
        args[0]?.originalFileName === filename &&
        typeof args[0]?.path === "string" &&
        typeof args[0]?.clientId === "string"
      );
    } catch {
      return false;
    }
  });
  await page.getByRole("button", { name: "Start upload", exact: true }).click();
  const captured = await finalization;
  const response = await captured.response();
  expect(response?.ok(), "the captured finalization request succeeded").toBe(
    true,
  );
  const body = await response!.text();
  expect(
    body.includes('"status":"uploaded"'),
    "server action returned uploaded",
  ).toBe(true);
  await expect(
    page.getByRole("heading", { name: "Uploaded in this session" }),
  ).toBeVisible();
  const input = JSON.parse(captured.postData()!)[0];
  await expect
    .poll(
      () =>
        backend
          .snapshot(owner)
          .photos.filter((row) => row.storage_path === input.path).length,
    )
    .toBe(1);
  const photo = backend
    .snapshot(owner)
    .photos.find((row) => row.storage_path === input.path)!;
  // Automatic unavailable-AI processing must settle before replay baseline.
  await expect
    .poll(
      () =>
        backend
          .snapshot(owner)
          .predictions.find((row) => row.photo_id === photo.id)
          ?.processing_status,
    )
    .toBe("insufficient_references");
  return { photo, captured };
}

export async function replayFinalization(page: Page, request: Request) {
  if (
    new URL(request.url()).origin !== APP_ORIGIN ||
    new URL(request.url()).pathname !== "/photos/upload"
  )
    throw new Error("Replay target refused");
  const original = await request.allHeaders();
  const headers: Record<string, string> = { origin: APP_ORIGIN };
  // Cookies come from this browser context; never serialize them or log bodies.
  for (const name of [
    "next-action",
    "next-router-state-tree",
    "content-type",
    "accept",
  ]) {
    if (original[name]) headers[name] = original[name];
  }
  const response = await page.request.post(request.url(), {
    headers,
    data: request.postDataBuffer()!,
    maxRedirects: 0,
  });
  expect(response.ok(), "replay returned success").toBe(true);
  const body = await response.text();
  expect(body.includes('"status":"uploaded"'), "replay returned uploaded").toBe(
    true,
  );
  return body;
}

export async function expectGalleryPhoto(page: Page, id: string) {
  const link = page.locator(`a[href="/photos/${id}"][aria-label^="View "]`);
  await expect(link).toHaveCount(1);
  await expect(link).toBeVisible();
  await expect
    .poll(() =>
      link
        .locator("img")
        .evaluate(
          (image: HTMLImageElement) => image.complete && image.naturalWidth > 0,
        ),
    )
    .toBe(true);
}

export async function saveLabels(
  page: Page,
  backend: Backend,
  owner: string,
  photoId: string,
) {
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      Boolean(response.request().headers()["next-action"]) &&
      new URL(response.url()).pathname === `/photos/${photoId}`,
  );
  // Successful saves reload the document. Arm this before submitting; waiting
  // for the old Flight stream to finish can hang when navigation interrupts it.
  const loaded = page.waitForEvent("domcontentloaded");
  const [response] = await Promise.all([
    responsePromise,
    loaded,
    page.getByRole("button", { name: "Save labels", exact: true }).click(),
  ]);
  expect(response.ok(), "label action HTTP success").toBe(true);
  const button = page.getByRole("button", { name: "Save labels", exact: true });
  await expect(button).toBeEnabled();
  const revision = backend
    .snapshot(owner)
    .predictions.find((row) => row.photo_id === photoId)!.labels_revision;
  await expect(
    page
      .locator("form")
      .filter({ has: button })
      .locator('input[name="revision"]'),
  ).toHaveValue(String(revision));
}
