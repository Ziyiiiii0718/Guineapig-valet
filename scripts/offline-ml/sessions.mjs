// Read capture metadata only. Suggested groups require human review.
import { readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import exifr from "exifr";

const raw = process.env.PIGGIE_DATASET_DIR;
if (!raw || !path.isAbsolute(raw)) {
  throw new Error(
    "Set PIGGIE_DATASET_DIR to your absolute external dataset path.",
  );
}
const root = await realpath(raw);
const repo = await realpath(fileURLToPath(new URL("../../", import.meta.url)));
if (root === repo || root.startsWith(repo + path.sep)) {
  throw new Error("Keep personal photos outside GuineaAI.");
}
const rows = [];
async function visit(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    if (entry.isSymbolicLink()) throw new Error("Symlinks are not allowed.");
    const filename = path.join(folder, entry.name);
    if (entry.isDirectory()) {
      await visit(filename);
    } else {
      let captured = "Missing — review manually";
      let group = "UNASSIGNED";
      try {
        const tags = await exifr.parse(await readFile(filename), {
          pick: ["DateTimeOriginal"],
          reviveValues: false,
        });
        const value = tags?.DateTimeOriginal;
        if (
          typeof value === "string" &&
          /^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
        ) {
          captured = value;
          group = value.slice(0, 10).replaceAll(":", "-") + "-review";
        }
      } catch {
        captured = "Unreadable metadata — review manually";
      }
      rows.push({ file: path.relative(root, filename), captured, group });
    }
  }
}
for (const label of ["potato", "annie", "both", "neither"]) {
  const folder = path.join(root, label);
  if ((await realpath(folder)) !== folder)
    throw new Error("Symlinked label folder.");
  await visit(folder);
}
rows.sort(
  (a, b) =>
    a.group.localeCompare(b.group) || a.captured.localeCompare(b.captured),
);
const escapeCell = (value) =>
  value.replaceAll("|", "&#124;").replace(/[\r\n]/g, " ");
console.log("# Capture-session review worksheet\n");
console.log(
  "These are unconfirmed day groups, NOT approved session labels or splits. " +
    "EXIF clock values may lack timezone information or be wrong. No file modification times are used. " +
    "Keep same-day photos together conservatively; merge related shoots across days. " +
    "Review UNASSIGNED photos manually. No photos were moved or uploaded.\n",
);
console.log(
  "| Photo | Original capture clock | Suggested day group |\n| --- | --- | --- |",
);
for (const row of rows)
  console.log(
    `| ${escapeCell(row.file)} | ${escapeCell(row.captured)} | ${row.group} |`,
  );
