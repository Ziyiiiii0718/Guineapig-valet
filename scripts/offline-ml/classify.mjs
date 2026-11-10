// Run the actual production pure classifier without loading Next.js or services.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const root = fileURLToPath(new URL("../../", import.meta.url));
const nativeRequire = createRequire(import.meta.url);
const cache = new Map();
function load(name) {
  if (!name.startsWith("@/")) return nativeRequire(name);
  const path = root + name.slice(2);
  if (path.endsWith(".json")) return JSON.parse(readFileSync(path, "utf8"));
  if (cache.has(path)) return cache.get(path);
  const compiled = { exports: {} };
  const code = ts.transpileModule(readFileSync(path + ".ts", "utf8"), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
  }).outputText;
  vm.runInNewContext("(function(require,module,exports){" + code + "\n})")(
    load,
    compiled,
    compiled.exports,
  );
  cache.set(path, compiled.exports);
  return compiled.exports;
}
const input = JSON.parse(readFileSync(0, "utf8"));
const { classifyPhotoEmbedding } = load("@/lib/ai/classifier");
const results = input.queries.map((query) =>
  classifyPhotoEmbedding({
    queryEmbedding: query,
    references: input.references,
  }),
);
process.stdout.write(JSON.stringify(results));
