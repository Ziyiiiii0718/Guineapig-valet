import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getPhotoImportKind,
  getUserPhotoImportValidationError,
  hasHeicImportExtension,
  hasValidHeifSignature,
  isHeicImportMimeType,
  prepareUserPhotoForUpload,
} from "@/lib/photos/heic";

const heicToMock = vi.fn();
const exifrParseMock = vi.fn();

vi.mock("heic-to", () => ({
  heicTo: heicToMock,
}));

vi.mock("exifr", () => ({
  parse: exifrParseMock,
}));

function makeHeifBytes(majorBrand = "heic"): Uint8Array<ArrayBuffer> {
  const brands = [majorBrand, "mif1", "heic"];
  const bytes = new Uint8Array(new ArrayBuffer(8 + brands.length * 4));
  const view = new DataView(bytes.buffer);

  view.setUint32(0, bytes.byteLength);
  bytes.set(
    [..."ftyp"].map((char) => char.charCodeAt(0)),
    4,
  );

  brands.forEach((brand, index) => {
    bytes.set(
      [...brand].map((char) => char.charCodeAt(0)),
      8 + index * 4,
    );
  });

  return bytes;
}

function makeFile({
  bytes = makeHeifBytes(),
  name,
  type,
}: {
  bytes?: Uint8Array<ArrayBuffer>;
  name: string;
  type: string;
}) {
  return new File([bytes.buffer], name, { type });
}

describe("HEIC and HEIF import detection", () => {
  it("detects HEIC and HEIF MIME types", () => {
    expect(isHeicImportMimeType("image/heic")).toBe(true);
    expect(isHeicImportMimeType("image/heif")).toBe(true);
    expect(isHeicImportMimeType("image/jpeg")).toBe(false);
  });

  it("detects uppercase HEIC and HEIF extensions", () => {
    expect(hasHeicImportExtension("IMG_1000.HEIC")).toBe(true);
    expect(hasHeicImportExtension("nested/photo.HeIf")).toBe(true);
    expect(hasHeicImportExtension("photo.jpg")).toBe(false);
  });

  it("accepts empty MIME when the extension is HEIC or HEIF", () => {
    expect(
      getUserPhotoImportValidationError({
        name: "IMG_1000.HEIC",
        size: 1200,
        type: "",
      }),
    ).toBeNull();
    expect(getPhotoImportKind({ name: "IMG_1000.HEIC", type: "" })).toBe(
      "heic",
    );
  });

  it("validates HEIC and HEIF ISO-BMFF brands instead of trusting names only", async () => {
    await expect(
      hasValidHeifSignature(makeFile({ name: "photo.heic", type: "" })),
    ).resolves.toBe(true);
    await expect(
      hasValidHeifSignature(
        makeFile({
          bytes: makeHeifBytes("heif"),
          name: "photo.heif",
          type: "image/heif",
        }),
      ),
    ).resolves.toBe(true);
    await expect(
      hasValidHeifSignature(
        makeFile({
          bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
          name: "renamed.HEIC",
          type: "",
        }),
      ),
    ).resolves.toBe(false);
  });
});

describe("HEIC browser conversion boundary", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    exifrParseMock.mockResolvedValue({
      DateTimeOriginal: new Date("2026-07-20T12:30:00.000Z"),
    });
    heicToMock.mockResolvedValue(
      new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }),
    );

    vi.stubGlobal(
      "Image",
      class {
        naturalHeight = 900;
        naturalWidth = 1200;
        onerror: (() => void) | null = null;
        onload: (() => void) | null = null;

        set src(_value: string) {
          this.onload?.();
        }
      },
    );
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:converted-jpeg"),
      revokeObjectURL: vi.fn(),
    });
  });

  it("converts valid HEIC to JPEG metadata while preserving the original taken date", async () => {
    const result = await prepareUserPhotoForUpload(
      makeFile({ name: "IMG_1000.HEIC", type: "" }),
    );

    expect(heicToMock).toHaveBeenCalledWith({
      blob: expect.any(File),
      quality: 0.9,
      type: "image/jpeg",
    });
    expect(result.mimeType).toBe("image/jpeg");
    expect(result.file.name).toMatch(/\.jpg$/);
    expect(result.file.type).toBe("image/jpeg");
    expect(result.size).toBe(3);
    expect(result.width).toBe(1200);
    expect(result.height).toBe(900);
    expect(result.takenAt).toBe("2026-07-20T12:30:00.000Z");
  });

  it("rejects falsely renamed non-HEIC files before conversion", async () => {
    await expect(
      prepareUserPhotoForUpload(
        makeFile({
          bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
          name: "fake.HEIC",
          type: "",
        }),
      ),
    ).rejects.toThrow("valid HEIC/HEIF");
    expect(heicToMock).not.toHaveBeenCalled();
  });

  it("returns a friendly failure when conversion fails", async () => {
    heicToMock.mockRejectedValue(new Error("decoder internals"));

    await expect(
      prepareUserPhotoForUpload(
        makeFile({ name: "corrupt.heic", type: "image/heic" }),
      ),
    ).rejects.toThrow(
      "We could not convert this HEIC/HEIF image. Try exporting it as a JPEG and uploading again.",
    );
  });

  it("continues preparing JPEG, PNG, and WEBP files without HEIC conversion", async () => {
    const files = [
      makeFile({
        bytes: new Uint8Array([1]),
        name: "photo.jpg",
        type: "image/jpeg",
      }),
      makeFile({
        bytes: new Uint8Array([1]),
        name: "photo.png",
        type: "image/png",
      }),
      makeFile({
        bytes: new Uint8Array([1]),
        name: "photo.webp",
        type: "image/webp",
      }),
    ];

    for (const file of files) {
      await expect(prepareUserPhotoForUpload(file)).resolves.toMatchObject({
        file,
        height: 900,
        size: 1,
        width: 1200,
      });
    }

    expect(heicToMock).not.toHaveBeenCalled();
  });

  it("supports mixed HEIC and JPEG batches at the helper boundary", async () => {
    const files = [
      makeFile({ name: "IMG_1000.HEIC", type: "" }),
      makeFile({
        bytes: new Uint8Array([1]),
        name: "photo.jpg",
        type: "image/jpeg",
      }),
    ];
    const prepared = [];

    for (const file of files) {
      prepared.push(await prepareUserPhotoForUpload(file));
    }

    expect(prepared.map((photo) => photo.mimeType)).toEqual([
      "image/jpeg",
      "image/jpeg",
    ]);
    expect(heicToMock).toHaveBeenCalledTimes(1);
  });
});
