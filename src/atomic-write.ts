import { mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

function buildTempPath(targetPath: string): string {
  const nonce = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return join(dirname(targetPath), `.${basename(targetPath)}.${nonce}.tmp`);
}

export function writeFileAtomic(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });

  const tempPath = buildTempPath(path);
  let renamed = false;

  try {
    writeFileSync(tempPath, content, "utf-8");
    renameSync(tempPath, path);
    renamed = true;
  } finally {
    if (renamed) {
      return;
    }

    try {
      unlinkSync(tempPath);
    } catch {
      // Ignore temp cleanup failures after write or rename errors.
    }
  }
}
