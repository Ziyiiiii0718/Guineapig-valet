import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { PetAvatarForm } from "@/components/pets/pet-avatar-form";
const mocks = vi.hoisted(() => ({
  initialize: vi.fn(),
  finalize: vi.fn(),
  remove: vi.fn(),
  upload: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/app/actions/pets", () => ({
  initializePetAvatarUploadAction: mocks.initialize,
  finalizePetAvatarUploadAction: mocks.finalize,
  removePetAvatarAction: mocks.remove,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({
    storage: { from: () => ({ uploadToSignedUrl: mocks.upload }) },
  }),
}));
beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  mocks.initialize.mockResolvedValue({
    status: "success",
    path: "path",
    token: "token",
  });
  mocks.finalize.mockResolvedValue({ status: "success" });
  mocks.upload.mockResolvedValue({ error: null });
});
function show() {
  return render(
    <PetAvatarForm petId="pet" petName="Piggie" avatarRevision={4} hasAvatar />,
  );
}
function select(size: number, type = "image/jpeg") {
  const file = new File([new Uint8Array(size)], "avatar.jpg", { type });
  fireEvent.change(screen.getByLabelText("Choose replacement image"), {
    target: { files: [file] },
  });
  // jsdom FormData does not consume the simulated FileList; use the form's real API contract.
  const original = FormData.prototype.get;
  vi.spyOn(FormData.prototype, "get").mockImplementation(function (
    this: FormData,
    key,
  ) {
    return key === "avatar" ? file : original.call(this, key);
  });
  return file;
}
it("uploads a 2 MB file directly and finalizes only metadata", async () => {
  show();
  const file = select(2 * 1024 * 1024);
  fireEvent.submit(screen.getByText("Replace photo").closest("form")!);
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  expect(mocks.upload).toHaveBeenCalledWith("path", "token", file, {
    contentType: "image/jpeg",
  });
  expect(mocks.finalize).toHaveBeenCalledWith({
    petId: "pet",
    expectedRevision: 4,
    size: file.size,
    mimeType: file.type,
    path: "path",
  });
  vi.restoreAllMocks();
});
it.each([
  [5 * 1024 * 1024 + 1, "image/jpeg"],
  [20, "image/gif"],
])("rejects invalid selection %s %s", async (size, type) => {
  show();
  select(size as number, type as string);
  fireEvent.submit(screen.getByText("Replace photo").closest("form")!);
  await screen.findByRole("alert");
  expect(mocks.initialize).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});
it("reuses the prepared upload after an interrupted or lost response", async () => {
  show();
  select(20);
  mocks.upload.mockRejectedValue(new Error("lost"));
  mocks.finalize.mockResolvedValueOnce({ status: "error", message: "Retry" });
  fireEvent.submit(screen.getByText("Replace photo").closest("form")!);
  await screen.findByText("Retry");
  fireEvent.submit(screen.getByText("Replace photo").closest("form")!);
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  expect(mocks.initialize).toHaveBeenCalledTimes(1);
  expect(mocks.finalize).toHaveBeenCalledTimes(2);
  vi.restoreAllMocks();
});
it("offers removal even if the signed display URL is unavailable", async () => {
  show();
  mocks.remove.mockResolvedValue({ status: "success" });
  fireEvent.click(screen.getByText("Remove photo"));
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  const form = mocks.remove.mock.calls[0][1] as FormData;
  expect(form.get("revision")).toBe("4");
  expect(form.get("petId")).toBe("pet");
});
