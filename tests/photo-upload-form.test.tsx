import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PhotoUploadForm } from "@/components/photos/photo-upload-form";
import type { PreparedPhotoUpload } from "@/lib/photos/heic";

const prepareUserPhotoForUploadMock = vi.hoisted(() => vi.fn());
const photoUploadActionMocks = vi.hoisted(() => ({
  finalize: vi.fn(),
  initialize: vi.fn(),
}));
const uploadToSignedUrlMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/actions/photos", () => ({
  finalizePhotoUploadAction: photoUploadActionMocks.finalize,
  initializePhotoUploadsAction: photoUploadActionMocks.initialize,
}));

vi.mock("@/lib/photos/heic", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/photos/heic")>()),
  prepareUserPhotoForUpload: prepareUserPhotoForUploadMock,
}));

vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({
    storage: {
      from: () => ({ uploadToSignedUrl: uploadToSignedUrlMock }),
    },
  }),
}));

describe("photo upload form preparation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("crypto", {
      randomUUID: () => "550e8400-e29b-41d4-a716-446655440000",
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    photoUploadActionMocks.initialize.mockResolvedValue([
      {
        clientId: "550e8400-e29b-41d4-a716-446655440000",
        path: "user-1/2026/08/photo-id.jpg",
        status: "ready",
        token: "signed-token",
      },
    ]);
    uploadToSignedUrlMock.mockResolvedValue({ error: null });
    photoUploadActionMocks.finalize.mockResolvedValue({
      clientId: "550e8400-e29b-41d4-a716-446655440000",
      message: "Uploaded.",
      photoId: "photo-id",
      status: "uploaded",
    });
  });

  it("moves a newly selected HEIC file from converting to ready", async () => {
    let finishPreparation: ((photo: PreparedPhotoUpload) => void) | undefined;
    prepareUserPhotoForUploadMock.mockReturnValue(
      new Promise<PreparedPhotoUpload>((resolve) => {
        finishPreparation = resolve;
      }),
    );
    const originalFile = new File(
      [new Uint8Array([1, 2, 3])],
      "IMG_1693.HEIC",
      {
        type: "image/heic",
      },
    );
    const convertedFile = new File(
      [new Uint8Array([4, 5, 6])],
      "550e8400-e29b-41d4-a716-446655440000.jpg",
      { type: "image/jpeg" },
    );

    render(<PhotoUploadForm />);
    const input =
      document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();

    fireEvent.change(input!, { target: { files: [originalFile] } });

    expect(await screen.findByText("Converting HEIC")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start upload" })).toBeDisabled();
    expect(prepareUserPhotoForUploadMock).toHaveBeenCalledWith(originalFile);

    await act(async () => {
      finishPreparation?.({
        file: convertedFile,
        height: 900,
        mimeType: "image/jpeg",
        previewUrl: "blob:converted-jpeg",
        size: convertedFile.size,
        takenAt: "2026-07-20T12:30:00.000Z",
        width: 1200,
      });
    });

    expect(await screen.findByText("Ready")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start upload" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Start upload" }));

    expect(await screen.findByText("Uploaded")).toBeInTheDocument();
    expect(photoUploadActionMocks.initialize).toHaveBeenCalledWith([
      expect.objectContaining({
        mimeType: "image/jpeg",
        originalFileName: "IMG_1693.HEIC",
      }),
    ]);
    expect(uploadToSignedUrlMock).toHaveBeenCalledWith(
      "user-1/2026/08/photo-id.jpg",
      "signed-token",
      convertedFile,
      { contentType: "image/jpeg" },
    );
    await waitFor(() => {
      expect(photoUploadActionMocks.finalize).toHaveBeenCalledWith(
        expect.objectContaining({
          mimeType: "image/jpeg",
          originalFileName: "IMG_1693.HEIC",
          path: "user-1/2026/08/photo-id.jpg",
        }),
      );
    });
  });
});
