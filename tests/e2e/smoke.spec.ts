import { test, expect } from "./fixtures.ts";

test("anonymous users cannot enter protected routes", async ({ page }) => {
  for (const path of ["/dashboard", "/pets", "/photos", "/albums", "/review"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login(?:\?|$)/);
    await expect(
      page.getByRole("heading", { name: "Log in", exact: true }),
    ).toBeVisible();
  }
});

test("login form enforces required fields without a backend request", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(page.getByLabel("Email", { exact: true })).toHaveAttribute(
    "required",
    "",
  );
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "minlength",
    "8",
  );
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel("Email", { exact: true })).toBeFocused();
});
