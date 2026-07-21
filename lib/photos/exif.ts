const EXIF_HEADER = "Exif";
const JPEG_START = 0xffd8;
const APP1_MARKER = 0xffe1;
const TIFF_LITTLE_ENDIAN = 0x4949;
const TIFF_BIG_ENDIAN = 0x4d4d;
const TIFF_MAGIC = 42;
const EXIF_IFD_POINTER_TAG = 0x8769;
const DATE_TIME_TAG = 0x0132;
const DATE_TIME_ORIGINAL_TAG = 0x9003;
const DATE_TIME_DIGITIZED_TAG = 0x9004;
const ASCII_TYPE = 2;

const DATE_TAG_PRIORITY = [
  DATE_TIME_ORIGINAL_TAG,
  DATE_TIME_DIGITIZED_TAG,
  DATE_TIME_TAG,
];

function readAscii(view: DataView, offset: number, length: number) {
  let value = "";

  for (let index = 0; index < length; index += 1) {
    const code = view.getUint8(offset + index);

    if (code === 0) {
      break;
    }

    value += String.fromCharCode(code);
  }

  return value;
}

function parseExifDate(value: string) {
  const match = value
    .trim()
    .match(
      /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:([+-]\d{2}):?(\d{2})|Z)?$/,
    );

  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute, second, offsetHour, offsetMinute] =
    match;

  if (offsetHour && offsetMinute) {
    const normalized = `${year}-${month}-${day}T${hour}:${minute}:${second}${offsetHour}:${offsetMinute}`;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  const date = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    ),
  );

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function readIfdEntries({
  isLittleEndian,
  tiffOffset,
  view,
  ifdOffset,
}: {
  ifdOffset: number;
  isLittleEndian: boolean;
  tiffOffset: number;
  view: DataView;
}) {
  if (ifdOffset <= 0 || tiffOffset + ifdOffset + 2 > view.byteLength) {
    return new Map<number, string | number>();
  }

  const entries = new Map<number, string | number>();
  const entryCount = view.getUint16(tiffOffset + ifdOffset, isLittleEndian);
  const entriesOffset = tiffOffset + ifdOffset + 2;

  for (let index = 0; index < entryCount; index += 1) {
    const entryOffset = entriesOffset + index * 12;

    if (entryOffset + 12 > view.byteLength) {
      break;
    }

    const tag = view.getUint16(entryOffset, isLittleEndian);
    const type = view.getUint16(entryOffset + 2, isLittleEndian);
    const count = view.getUint32(entryOffset + 4, isLittleEndian);
    const valueOrOffset = view.getUint32(entryOffset + 8, isLittleEndian);

    if (type === ASCII_TYPE) {
      const valueOffset =
        count <= 4 ? entryOffset + 8 : tiffOffset + valueOrOffset;

      if (valueOffset > 0 && valueOffset + count <= view.byteLength) {
        entries.set(tag, readAscii(view, valueOffset, count));
      }
    } else if (tag === EXIF_IFD_POINTER_TAG) {
      entries.set(tag, valueOrOffset);
    }
  }

  return entries;
}

export function parseExifTakenAtFromArrayBuffer(buffer: ArrayBuffer) {
  if (buffer.byteLength < 4) {
    return null;
  }

  const view = new DataView(buffer);

  if (view.getUint16(0) !== JPEG_START) {
    return null;
  }

  let offset = 2;

  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) {
      return null;
    }

    const marker = view.getUint16(offset);
    const segmentLength = view.getUint16(offset + 2);
    const segmentStart = offset + 4;
    const segmentEnd = segmentStart + segmentLength - 2;

    if (segmentLength < 2 || segmentEnd > view.byteLength) {
      return null;
    }

    if (
      marker === APP1_MARKER &&
      readAscii(view, segmentStart, 4) === EXIF_HEADER
    ) {
      const tiffOffset = segmentStart + 6;
      const byteOrder = view.getUint16(tiffOffset);
      const isLittleEndian =
        byteOrder === TIFF_LITTLE_ENDIAN
          ? true
          : byteOrder === TIFF_BIG_ENDIAN
            ? false
            : null;

      if (isLittleEndian === null) {
        return null;
      }

      if (view.getUint16(tiffOffset + 2, isLittleEndian) !== TIFF_MAGIC) {
        return null;
      }

      const firstIfdOffset = view.getUint32(tiffOffset + 4, isLittleEndian);
      const imageEntries = readIfdEntries({
        ifdOffset: firstIfdOffset,
        isLittleEndian,
        tiffOffset,
        view,
      });
      const exifIfdOffset = imageEntries.get(EXIF_IFD_POINTER_TAG);
      const exifEntries =
        typeof exifIfdOffset === "number"
          ? readIfdEntries({
              ifdOffset: exifIfdOffset,
              isLittleEndian,
              tiffOffset,
              view,
            })
          : new Map<number, string | number>();

      for (const tag of DATE_TAG_PRIORITY) {
        const value = exifEntries.get(tag) ?? imageEntries.get(tag);

        if (typeof value === "string") {
          const parsed = parseExifDate(value);

          if (parsed) {
            return parsed;
          }
        }
      }

      return null;
    }

    offset = segmentEnd;
  }

  return null;
}

export function resolveTakenAtWithFallback(
  exifTakenAt: string | null,
  uploadTimestamp: string,
) {
  return exifTakenAt ?? uploadTimestamp;
}
