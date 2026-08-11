import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const tesseractRoot = dirname(require.resolve("tesseract.js/package.json"));
const tesseractRequire = createRequire(join(tesseractRoot, "package.json"));
const coreRoot = dirname(tesseractRequire.resolve("tesseract.js-core/package.json"));
const languageRoot = dirname(require.resolve("@tesseract.js-data/eng/package.json"));
const publicRoot = join(root, "public", "ocr");

await mkdir(join(publicRoot, "core"), { recursive: true });
await mkdir(join(publicRoot, "lang"), { recursive: true });

await copyFile(join(tesseractRoot, "dist", "worker.min.js"), join(publicRoot, "worker.min.js"));
await copyFile(
  join(languageRoot, "4.0.0_best_int", "eng.traineddata.gz"),
  join(publicRoot, "lang", "eng.traineddata.gz"),
);

for (const filename of [
  "tesseract-core-lstm.wasm.js",
  "tesseract-core-simd-lstm.wasm.js",
  "tesseract-core-relaxedsimd-lstm.wasm.js",
]) {
  await copyFile(join(coreRoot, filename), join(publicRoot, "core", filename));
}
