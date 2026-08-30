import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const generatedApi = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "api-zod",
  "src",
  "generated",
  "api.ts",
);

const source = await readFile(generatedApi, "utf8");
const normalized = source
  // Orval emits these top-level helpers for Zod 4, while this workspace uses Zod 3.
  .replaceAll("zod.int()", "zod.number().int()")
  .replaceAll("zod.url()", "zod.string().url()")
  // Keep the schema private because the types barrel exports the same name.
  .replace(
    "export const UpdateCorrectiveActionBody = zod.object({",
    "const UpdateCorrectiveActionBody = zod.object({",
  );

if (normalized !== source) {
  await writeFile(generatedApi, normalized);
}