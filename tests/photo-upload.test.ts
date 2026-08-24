import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseExifTakenAtFromArrayBuffer,
  resolveTakenAtWithFallback,
} from "@/lib/photos/exif";
import {
  buildUserPhotoPath,
  categorizeStoragePreparationError,
  getUserPhotoBatchValidationError,
  getUserPhotoValidationError,
  isUserPhotoPathForUser,
  normalizePhotoTakenAt,
  sanitizeOriginalPhotoFileName,
  USER_PHOTO_MAX_BATCH_SIZE,
  USER_PHOTO_MAX_SIZE_BYTES,
  validatePhotoMetadataInput,
} from "@/lib/photos/upload";

describe("photo upload validation and metadata", () => {
  it("accepts supported image MIME types within the size limit", () => {
    expect(
      getUserPhotoValidationError({ size: 1200, type: "image/jpeg" }),
    ).toBeNull();
    expect(
      getUserPhotoValidationError({ size: 1200, type: "image/png" }),
    ).toBeNull();
    expect(
      getUserPhotoValidationError({ size: 1200, type: "image/webp" }),
    ).toBeNull();
  });

  it("rejects unsupported, empty, and oversized photo files", () => {
    expect(getUserPhotoValidationError({ size: 1200, type: "image/gif" })).toBe(
      "Photos must be JPEG, PNG, or WEBP images.",
    );
    expect(getUserPhotoValidationError({ size: 0, type: "image/png" })).toBe(
      "Choose a JPEG, PNG, or WEBP image.",
    );
    expect(
      getUserPhotoValidationError({
        size: USER_PHOTO_MAX_SIZE_BYTES + 1,
        type: "image/png",
      }),
    ).toBe("Each photo must be 10 MB or smaller.");
  });

  it("enforces the upload batch size limit", () => {
    expect(getUserPhotoBatchValidationError(1)).toBeNull();
    expect(
      getUserPhotoBatchValidationError(USER_PHOTO_MAX_BATCH_SIZE),
    ).toBeNull();
    expect(
      getUserPhotoBatchValidationError(USER_PHOTO_MAX_BATCH_SIZE + 1),
    ).toBe("Upload 10 photos or fewer at a time.");
  });

  it("builds unique ownership-scoped storage paths without original filenames", () => {
    const path = buildUserPhotoPath({
      mimeType: "image/webp",
      now: new Date("2026-07-21T12:30:00.000Z"),
      uniqueId: "photo-id",
      userId: "user-1",
    });

    expect(path).toBe("user-1/2026/07/photo-id.webp");
    expect(path).not.toContain("my-piggie");
    expect(isUserPhotoPathForUser(path, "user-1")).toBe(true);
    expect(isUserPhotoPathForUser(path, "user-2")).toBe(false);
  });

  it("builds converted HEIC storage paths as UUID JPEG objects", () => {
    const path = buildUserPhotoPath({
      mimeType: "image/jpeg",
      now: new Date("2026-07-21T12:30:00.000Z"),
      uniqueId: "550e8400-e29b-41d4-a716-446655440000",
      userId: "user-1",
    });

    expect(path).toBe(
      "user-1/2026/07/550e8400-e29b-41d4-a716-446655440000.jpg",
    );
    expect(path).not.toContain("IMG_1000.HEIC");
  });

  it("validates metadata shape and ownership path before database insertion", () => {
    const uploadTimestamp = "2026-07-21T15:00:00.000Z";

    expect(
      validatePhotoMetadataInput({
        height: 600,
        mimeType: "image/jpeg",
        originalFileName: "photo.jpg",
        size: 2048,
        storagePath: "user-1/2026/07/photo-id.jpg",
        takenAt: null,
        uploadTimestamp,
        userId: "user-1",
        width: 800,
      }),
    ).toBeNull();

    expect(
      validatePhotoMetadataInput({
        height: 600,
        mimeType: "image/jpeg",
        originalFileName: "photo.jpg",
        size: 2048,
        storagePath: "user-2/2026/07/photo-id.jpg",
        takenAt: null,
        uploadTimestamp,
        userId: "user-1",
        width: 800,
      }),
    ).toBe("That upload path does not belong to the current account.");
  });

  it("sanitizes original filenames for metadata storage", () => {
    expect(sanitizeOriginalPhotoFileName("../nested/pig\u0000photo.jpg")).toBe(
      "pigphoto.jpg",
    );
    expect(sanitizeOriginalPhotoFileName("")).toBe("uploaded-photo");
  });

  it("falls back to upload time when EXIF taken date is missing", () => {
    const uploadTimestamp = "2026-07-21T15:00:00.000Z";

    expect(parseExifTakenAtFromArrayBuffer(new ArrayBuffer(0))).toBeNull();
    expect(resolveTakenAtWithFallback(null, uploadTimestamp)).toBe(
      uploadTimestamp,
    );
    expect(normalizePhotoTakenAt(null, uploadTimestamp)).toBe(uploadTimestamp);
  });
});

describe("photo upload server actions", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    vi.doMock("next/cache", () => ({
      revalidatePath: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects upload initialization when Supabase is not configured", async () => {
    vi.doMock("@/lib/env", () => ({
      getPublicEnvStatus: () => ({ isConfigured: false }),
    }));
    vi.doMock("@/lib/supabase/server", () => ({
      createSupabaseServerClient: vi.fn(),
    }));

    const { initializePhotoUploadsAction } =
      await import("@/app/actions/photos");
    const [result] = await initializePhotoUploadsAction([
      {
        clientId: "client-1",
        height: 600,
        mimeType: "image/png",
        originalFileName: "photo.png",
        size: 1200,
        takenAt: null,
        width: 800,
      },
    ]);

    expect(result).toEqual({
      clientId: "client-1",
      message: "Supabase is not configured yet.",
      status: "error",
    });
  });

  it("categorizes safe Storage preparation failures", () => {
    expect(
      categorizeStoragePreparationError({ message: "Bucket not found" }),
    ).toBe("BUCKET_NOT_FOUND");
    expect(
      categorizeStoragePreparationError({
        message: "new row violates row-level security policy",
      }),
    ).toBe("STORAGE_POLICY_DENIED");
    expect(
      categorizeStoragePreparationError({ message: "Network failed" }),
    ).toBe("SIGNED_UPLOAD_CREATION_FAILED");
  });

  it("cleans up the uploaded object if metadata insertion fails", async () => {
    const remove = vi.fn().mockResolvedValue({ error: null });
    const single = vi
      .fn()
      .mockResolvedValue({ data: null, error: { code: "boom" } });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    const fromTable = vi.fn(() => ({ insert }));
    const fromStorage = vi.fn(() => ({ remove }));

    vi.doMock("@/lib/env", () => ({
      getPublicEnvStatus: () => ({ isConfigured: true }),
    }));
    vi.doMock("@/lib/supabase/server", () => ({
      createSupabaseServerClient: vi.fn(async () => ({
        auth: {
          getUser: vi.fn(async () => ({
            data: { user: { id: "user-1" } },
          })),
        },
        from: fromTable,
        storage: {
          from: fromStorage,
        },
      })),
    }));

    const { finalizePhotoUploadAction } = await import("@/app/actions/photos");
    const result = await finalizePhotoUploadAction({
      clientId: "client-1",
      height: 600,
      mimeType: "image/png",
      originalFileName: "photo.png",
      path: "user-1/2026/07/photo-id.png",
      size: 1200,
      takenAt: null,
      width: 800,
    });

    expect(result.status).toBe("failed");
    expect(fromStorage).toHaveBeenCalledWith("user-photos");
    expect(remove).toHaveBeenCalledWith(["user-1/2026/07/photo-id.png"]);
  });

  it("initializes converted HEIC uploads with JPEG storage paths", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T12:30:00.000Z"));

    const createSignedUploadUrl = vi.fn(async (path: string) => ({
      data: { path, token: "signed-token" },
      error: null,
    }));
    const fromStorage = vi.fn(() => ({ createSignedUploadUrl }));

    vi.stubGlobal("crypto", {
      randomUUID: () => "550e8400-e29b-41d4-a716-446655440000",
    });
    vi.doMock("@/lib/env", () => ({
      getPublicEnvStatus: () => ({ isConfigured: true }),
    }));
    vi.doMock("@/lib/supabase/server", () => ({
      createSupabaseServerClient: vi.fn(async () => ({
        auth: {
          getUser: vi.fn(async () => ({
            data: { user: { id: "user-1" } },
          })),
        },
        storage: {
          from: fromStorage,
        },
      })),
    }));

    const { initializePhotoUploadsAction } =
      await import("@/app/actions/photos");
    const [result] = await initializePhotoUploadsAction([
      {
        clientId: "client-1",
        height: 900,
        mimeType: "image/jpeg",
        originalFileName: "IMG_1000.HEIC",
        size: 2048,
        takenAt: "2026-07-20T12:30:00.000Z",
        width: 1200,
      },
    ]);

    expect(result.path).toBe(
      "user-1/2026/07/550e8400-e29b-41d4-a716-446655440000.jpg",
    );
    expect(createSignedUploadUrl).toHaveBeenCalledWith(
      "user-1/2026/07/550e8400-e29b-41d4-a716-446655440000.jpg",
      { upsert: false },
    );
  });

  it("returns a safe failure when converted JPEG upload preparation fails", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T12:30:00.000Z"));

    const createSignedUploadUrl = vi.fn(async () => ({
      data: null,
      error: { message: "Storage unavailable" },
    }));
    const fromStorage = vi.fn(() => ({ createSignedUploadUrl }));

    vi.stubGlobal("crypto", {
      randomUUID: () => "550e8400-e29b-41d4-a716-446655440000",
    });
    vi.doMock("@/lib/env", () => ({
      getPublicEnvStatus: () => ({ isConfigured: true }),
    }));
    vi.doMock("@/lib/supabase/server", () => ({
      createSupabaseServerClient: vi.fn(async () => ({
        auth: {
          getUser: vi.fn(async () => ({
            data: { user: { id: "user-1" } },
          })),
        },
        storage: {
          from: fromStorage,
        },
      })),
    }));

    const { initializePhotoUploadsAction } =
      await import("@/app/actions/photos");
    const [result] = await initializePhotoUploadsAction([
      {
        clientId: "client-1",
        height: 900,
        mimeType: "image/jpeg",
        originalFileName: "IMG_1000.HEIC",
        size: 2048,
        takenAt: null,
        width: 1200,
      },
    ]);

    expect(result).toEqual({
      clientId: "client-1",
      message: "We could not prepare that upload. Please try again.",
      status: "error",
    });
    expect(createSignedUploadUrl).toHaveBeenCalledWith(
      "user-1/2026/07/550e8400-e29b-41d4-a716-446655440000.jpg",
      { upsert: false },
    );
  });

  it("stores converted JPEG metadata while preserving the original HEIC filename and taken date", async () => {
    const single = vi.fn().mockResolvedValue({
      data: { id: "photo-id" },
      error: null,
    });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    const fromTable = vi.fn(() => ({ insert }));

    vi.doMock("@/lib/env", () => ({
      getPublicEnvStatus: () => ({ isConfigured: true }),
    }));
    vi.doMock("@/lib/supabase/server", () => ({
      createSupabaseServerClient: vi.fn(async () => ({
        auth: {
          getUser: vi.fn(async () => ({
            data: { user: { id: "user-1" } },
          })),
        },
        from: fromTable,
      })),
    }));

    const { finalizePhotoUploadAction } = await import("@/app/actions/photos");
    const result = await finalizePhotoUploadAction({
      clientId: "client-1",
      height: 900,
      mimeType: "image/jpeg",
      originalFileName: "../IMG_1000.HEIC",
      path: "user-1/2026/07/550e8400-e29b-41d4-a716-446655440000.jpg",
      size: 2048,
      takenAt: "2026-07-20T12:30:00.000Z",
      width: 1200,
    });

    expect(result.status).toBe("uploaded");
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        file_name: "IMG_1000.HEIC",
        file_size: 2048,
        height: 900,
        mime_type: "image/jpeg",
        storage_path: "user-1/2026/07/550e8400-e29b-41d4-a716-446655440000.jpg",
        taken_at: "2026-07-20T12:30:00.000Z",
        width: 1200,
      }),
    );
  });
});
