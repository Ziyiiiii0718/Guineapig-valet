import { parseExifTakenAtFromArrayBuffer } from "@/lib/photos/exif";
import {
  USER_PHOTO_MAX_SIZE_BYTES,
  isAllowedUserPhotoMimeType,
} from "@/lib/photos/upload";

export const USER_PHOTO_HEIC_IMPORT_TYPES = [
  "image/heic",
  "image/heif",
] as const;

export const USER_PHOTO_IMPORT_ACCEPT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  ...USER_PHOTO_HEIC_IMPORT_TYPES,
  ".heic",
  ".heif",
] as const;

const HEIF_COMPATIBLE_BRANDS = new Set([
  "heic",
  "heix",
  "hevc",
  "hevx",
  "heim",
  "heis",
  "hevm",
  "hevs",
  "mif1",
  "msf1",
]);

const HEIC_CONVERSION_ERROR =
  "We could not convert this HEIC/HEIF image. Try exporting it as a JPEG and uploading again.";

export type PhotoImportKind = "displayable" | "heic";

export type PhotoImportTarget = {
  name: string;
  size: number;
  slice: Blob["slice"];
  type: string;
};

export type PreparedPhotoUpload = {
  file: File;
  height: number;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  previewUrl: string;
  size: number;
  takenAt: string | null;
  width: number;
};

function getFileExtension(fileName: string) {
  const lastSegment = fileName.replaceAll("\\", "/").split("/").pop() ?? "";
  const extension = lastSegment.split(".").pop();

  return extension ? extension.toLowerCase() : "";
}

export function isHeicImportMimeType(mimeType: string) {
  return USER_PHOTO_HEIC_IMPORT_TYPES.includes(
    mimeType.toLowerCase() as (typeof USER_PHOTO_HEIC_IMPORT_TYPES)[number],
  );
}

export function hasHeicImportExtension(fileName: string) {
  const extension = getFileExtension(fileName);
  return extension === "heic" || extension === "heif";
}

export function getUserPhotoImportValidationError(
  file: Pick<PhotoImportTarget, "name" | "size" | "type"> | null | undefined,
) {
  if (!file || file.size === 0) {
    return "Choose a JPEG, PNG, WEBP, HEIC, or HEIF image.";
  }

  if (file.size > USER_PHOTO_MAX_SIZE_BYTES) {
    return "Each photo must be 10 MB or smaller.";
  }

  if (
    !isAllowedUserPhotoMimeType(file.type) &&
    !isHeicImportMimeType(file.type) &&
    !(file.type === "" && hasHeicImportExtension(file.name))
  ) {
    return "Photos must be JPEG, PNG, WEBP, HEIC, or HEIF images.";
  }

  return null;
}

export function getPhotoImportKind(
  file: Pick<PhotoImportTarget, "name" | "type">,
): PhotoImportKind | null {
  if (isAllowedUserPhotoMimeType(file.type)) {
    return "displayable";
  }

  if (isHeicImportMimeType(file.type) || hasHeicImportExtension(file.name)) {
    return "heic";
  }

  return null;
}

function readAscii(view: DataView, offset: number, length: number) {
  let value = "";

  for (let index = 0; index < length; index += 1) {
    value += String.fromCharCode(view.getUint8(offset + index));
  }

  return value;
}

export async function hasValidHeifSignature(file: PhotoImportTarget) {
  const buffer = await file.slice(0, 4096).arrayBuffer();

  if (buffer.byteLength < 16) {
    return false;
  }

  const view = new DataView(buffer);
  const boxSize = view.getUint32(0);

  if (readAscii(view, 4, 4) !== "ftyp") {
    return false;
  }

  const searchEnd = Math.min(
    buffer.byteLength,
    boxSize >= 16 ? boxSize : buffer.byteLength,
  );

  for (let offset = 8; offset + 4 <= searchEnd; offset += 4) {
    if (HEIF_COMPATIBLE_BRANDS.has(readAscii(view, offset, 4))) {
      return true;
    }
  }

  return false;
}

function readImageDimensions(url: string) {
  return new Promise<{ height: number; width: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      resolve({ height: image.naturalHeight, width: image.naturalWidth });
    };
    image.onerror = () => reject(new Error("Could not read image dimensions."));
    image.src = url;
  });
}

function normalizeExifDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  return null;
}

async function parseHeicTakenAt(file: File) {
  try {
    const exifr = await import("exifr");
    const metadata = await exifr.parse(file, {
      pick: [
        "DateTimeOriginal",
        "DateTimeDigitized",
        "CreateDate",
        "ModifyDate",
        "DateTime",
      ],
    });

    return (
      normalizeExifDate(metadata?.DateTimeOriginal) ??
      normalizeExifDate(metadata?.DateTimeDigitized) ??
      normalizeExifDate(metadata?.CreateDate) ??
      normalizeExifDate(metadata?.ModifyDate) ??
      normalizeExifDate(metadata?.DateTime)
    );
  } catch {
    return null;
  }
}

async function convertHeicToJpeg(file: File) {
  try {
    const { heicTo } = await import("heic-to");
    const blob = await heicTo({
      blob: file,
      quality: 0.9,
      type: "image/jpeg",
    });

    if (!blob || blob.size === 0) {
      throw new Error("Empty converted image.");
    }

    const jpegBlob =
      blob.type === "image/jpeg"
        ? blob
        : blob.slice(0, blob.size, "image/jpeg");

    return new File([jpegBlob], `${crypto.randomUUID()}.jpg`, {
      lastModified: file.lastModified,
      type: "image/jpeg",
    });
  } catch {
    throw new Error(HEIC_CONVERSION_ERROR);
  }
}

export async function prepareUserPhotoForUpload(file: File) {
  const validationError = getUserPhotoImportValidationError(file);

  if (validationError) {
    throw new Error(validationError);
  }

  const kind = getPhotoImportKind(file);

  if (kind === "heic") {
    if (!(await hasValidHeifSignature(file))) {
      throw new Error("That file does not look like a valid HEIC/HEIF image.");
    }

    const takenAt = await parseHeicTakenAt(file);
    const convertedFile = await convertHeicToJpeg(file);
    const previewUrl = URL.createObjectURL(convertedFile);

    try {
      const { height, width } = await readImageDimensions(previewUrl);

      return {
        file: convertedFile,
        height,
        mimeType: "image/jpeg",
        previewUrl,
        size: convertedFile.size,
        takenAt,
        width,
      } satisfies PreparedPhotoUpload;
    } catch {
      URL.revokeObjectURL(previewUrl);
      throw new Error("We could not read this converted image safely.");
    }
  }

  if (kind === "displayable") {
    const mimeType = file.type as PreparedPhotoUpload["mimeType"];
    const previewUrl = URL.createObjectURL(file);

    try {
      const [{ height, width }, buffer] = await Promise.all([
        readImageDimensions(previewUrl),
        file.type === "image/jpeg"
          ? file.arrayBuffer()
          : Promise.resolve(new ArrayBuffer(0)),
      ]);

      return {
        file,
        height,
        mimeType,
        previewUrl,
        size: file.size,
        takenAt:
          file.type === "image/jpeg"
            ? parseExifTakenAtFromArrayBuffer(buffer)
            : null,
        width,
      } satisfies PreparedPhotoUpload;
    } catch {
      URL.revokeObjectURL(previewUrl);
      throw new Error("We could not read this image safely.");
    }
  }

  throw new Error("Photos must be JPEG, PNG, WEBP, HEIC, or HEIF images.");
}
