import { test, expect, login } from "./fixtures.ts";
import {
  createPet,
  upload,
  replayFinalization,
  syntheticPNG,
  expectGalleryPhoto,
  saveLabels,
} from "./helpers.ts";

test("synthetic login, session persistence and logout", async ({
  page,
  accounts,
}) => {
  await login(page, accounts.a);
  await page.reload();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/photos");
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
});

test("private library lifecycle preserves other photos and the other owner", async ({
  page,
  accounts,
  backend,
}) => {
  test.setTimeout(180_000);
  await login(page, accounts.b);
  await createPet(page, "Synthetic B");
  await upload(page, backend, accounts.b.id, "synthetic-b.png");
  const otherBefore = backend.snapshot(accounts.b.id);

  await login(page, accounts.a);
  const petId = await createPet(page, "Synthetic A");
  await page.goto(`/pets/${petId}/edit`);
  await page.getByLabel(/^Name(?:\s*\*)?$/).fill("Synthetic A edited");
  await page.getByRole("button", { name: "Save pet", exact: true }).click();
  await expect
    .poll(
      () =>
        backend.snapshot(accounts.a.id).pets.find((row) => row.id === petId)
          ?.name,
    )
    .toBe("Synthetic A edited");
  const { photo: first } = await upload(
    page,
    backend,
    accounts.a.id,
    "synthetic-first.png",
  );
  const { photo: shared } = await upload(
    page,
    backend,
    accounts.a.id,
    "synthetic-shared.png",
  );
  await page.goto("/photos");
  await expectGalleryPhoto(page, first.id);
  await expectGalleryPhoto(page, shared.id);

  await page.goto(`/photos/${first.id}`);
  await page.getByRole("button", { name: /^Edit photo name / }).click();
  await page
    .getByLabel("Photo name", { exact: true })
    .fill("Synthetic renamed");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Synthetic renamed", exact: true }),
  ).toBeVisible();
  for (const id of [first.id, shared.id]) {
    await page.goto(`/photos/${id}`);
    await page
      .getByRole("checkbox", { name: "Synthetic A edited", exact: true })
      .check();
    await saveLabels(page, backend, accounts.a.id, id);
    await expect
      .poll(
        () =>
          backend
            .snapshot(accounts.a.id)
            .predictions.find((row) => row.photo_id === id)?.confirmed_pet_ids,
      )
      .toEqual([petId]);
  }
  // Change and restore human labels with unavailable AI.
  await page
    .getByRole("checkbox", { name: "Unknown / none of these", exact: true })
    .check();
  await saveLabels(page, backend, accounts.a.id, shared.id);
  await expect
    .poll(
      () =>
        backend
          .snapshot(accounts.a.id)
          .predictions.find((row) => row.photo_id === shared.id)
          ?.confirmed_pet_ids,
    )
    .toEqual([]);
  await page
    .getByRole("checkbox", { name: "Synthetic A edited", exact: true })
    .check();
  await saveLabels(page, backend, accounts.a.id, shared.id);
  await expect
    .poll(
      () =>
        backend
          .snapshot(accounts.a.id)
          .predictions.find((row) => row.photo_id === shared.id)
          ?.confirmed_pet_ids,
    )
    .toEqual([petId]);

  await page.goto("/albums/new");
  await page.getByLabel(/^Name(?:\s*\*)?$/).fill("Synthetic album");
  await page.getByRole("button", { name: "Create album", exact: true }).click();
  await expect(page).toHaveURL(/\/albums\/[a-f0-9-]{36}(?:\?|$)/);
  const albumId = new URL(page.url()).pathname.split("/")[2];
  await page.goto(`/albums/${albumId}/photos`);
  await page.getByRole("checkbox", { name: /Synthetic renamed/ }).check();
  await page.getByRole("checkbox", { name: /synthetic-shared/ }).check();
  await page
    .getByRole("button", { name: "Add selected photos", exact: true })
    .click();
  await expect
    .poll(() => backend.snapshot(accounts.a.id).memberships.length)
    .toBe(2);
  await page.goto(`/albums/${albumId}`);
  const membership = page
    .locator("form")
    .filter({ has: page.locator(`input[name=photoId][value="${first.id}"]`) });
  await membership
    .getByRole("button", { name: "Remove from album", exact: true })
    .click();
  await expect
    .poll(() => backend.snapshot(accounts.a.id).memberships.length)
    .toBe(1);
  await page.goto(`/albums/${albumId}/photos`);
  await page.getByRole("checkbox", { name: /Synthetic renamed/ }).check();
  await page
    .getByRole("button", { name: "Add selected photos", exact: true })
    .click();
  await expect
    .poll(() => backend.snapshot(accounts.a.id).memberships.length)
    .toBe(2);

  const ownerBefore = backend.snapshot(accounts.a.id);
  await login(page, accounts.b);
  for (const [path, heading] of [
    [`/photos/${first.id}`, "Photo not found"],
    [`/pets/${petId}`, "Pet profile not found"],
    [`/pets/${petId}/edit`, "Pet profile not found"],
    [`/albums/${albumId}`, "Album not found"],
  ]) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
  }
  expect(
    backend.snapshot(accounts.a.id),
    "cross-user browsing cannot mutate owner data",
  ).toEqual(ownerBefore);
  expect(
    backend.snapshot(accounts.b.id),
    "other owner fixture preserved",
  ).toEqual(otherBefore);

  await login(page, accounts.a);
  await page.goto(`/photos/${first.id}`);
  await page.getByRole("button", { name: "Delete photo", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete photo", exact: true })
    .click();
  await expect(page).toHaveURL(/\/photos\?message=deleted/);
  await expect
    .poll(() => backend.snapshot(accounts.a.id).photos.length)
    .toBe(1);
  const afterPhoto = backend.snapshot(accounts.a.id);
  expect(afterPhoto.photos[0].id).toBe(shared.id);
  expect(afterPhoto.objects.map((row) => row.name)).toEqual([
    shared.storage_path,
  ]);
  expect(afterPhoto.predictions.map((row) => row.photo_id)).toEqual([
    shared.id,
  ]);
  expect(afterPhoto.memberships.map((row) => row.photo_id)).toEqual([
    shared.id,
  ]);
  expect(
    afterPhoto.tombstones.find((row) => row.photo_id === first.id)
      ?.storage_deleted_at,
  ).toBeTruthy();

  await page.goto(`/pets/${petId}`);
  await page.getByRole("button", { name: "Delete pet", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Type Synthetic A edited to confirm")
    .fill("Synthetic A edited");
  await dialog
    .getByRole("button", { name: "Confirm delete", exact: true })
    .click();
  await expect.poll(() => backend.snapshot(accounts.a.id).pets.length).toBe(0);
  const afterPet = backend.snapshot(accounts.a.id);
  // 0011 deliberately invalidates the sole human identity, without deleting
  // or changing the surviving photo's other metadata or Storage object.
  expect(afterPet.photos).toEqual([
    {
      ...afterPhoto.photos[0],
      ai_status: "needs_review",
      updated_at: afterPet.photos[0].updated_at,
    },
  ]);
  expect(Date.parse(afterPet.photos[0].updated_at)).toBeGreaterThanOrEqual(
    Date.parse(afterPhoto.photos[0].updated_at),
  );
  expect(afterPet.predictions[0].labels_revision).toBe(
    afterPhoto.predictions[0].labels_revision + 1,
  );
  expect(afterPet.objects).toEqual(afterPhoto.objects);
  expect(afterPet.albums).toEqual(afterPhoto.albums);
  expect(afterPet.memberships).toEqual(afterPhoto.memberships);
  expect(afterPet.predictions[0].confirmed_pet_ids).toEqual([]);
  expect(backend.snapshot(accounts.b.id)).toEqual(otherBefore);
});

test("successful upload finalization replay creates no duplicate records or Storage references", async ({
  page,
  accounts,
  backend,
}) => {
  await login(page, accounts.a);
  const { photo, captured } = await upload(
    page,
    backend,
    accounts.a.id,
    "synthetic-replay.png",
  );
  const before = backend.snapshot(accounts.a.id);
  expect(before.photos).toHaveLength(1);
  expect(before.predictions).toHaveLength(1);
  expect(before.objects).toHaveLength(1);
  expect(before.objects[0].name).toBe(photo.storage_path);
  expect(before.references).toHaveLength(0);
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await replayFinalization(page, captured);
    expect(
      response.includes(photo.id),
      "replay returned the same photo ID",
    ).toBe(true);
    expect(
      backend.snapshot(accounts.a.id),
      "entire owned snapshot unchanged after successful replay",
    ).toEqual(before);
  }
  await page.goto("/photos");
  await expectGalleryPhoto(page, photo.id);
  // Ensure the retained object bytes remain readable, not merely metadata.
  const { data, error } = await backend.admin.storage
    .from("user-photos")
    .download(photo.storage_path);
  expect(
    error === null && data !== null,
    "object still downloadable after replay",
  ).toBe(true);
  expect(
    Buffer.from(await data!.arrayBuffer()).equals(syntheticPNG()),
    "synthetic bytes unchanged after replay",
  ).toBe(true);
});
