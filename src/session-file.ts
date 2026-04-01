import { readFileSync } from "node:fs";

import { writeFileAtomic } from "./atomic-write.js";
import {
  applyHiddenPrefix,
  parseJsonlSession,
  restoreHiddenEntries,
  serializeJsonlSession,
} from "./session-visibility.js";
import type { HideMessagesPlan, RestoreMessagesPlan } from "./types.js";

export function updateSessionFileVisibility(
  sessionFilePath: string,
  keepVisibleCount: number,
  leafId?: string | null,
): HideMessagesPlan {
  const content = readFileSync(sessionFilePath, "utf-8");
  const entries = parseJsonlSession(content);
  const plan = applyHiddenPrefix(entries, keepVisibleCount, leafId);
  if (!plan.changed) {
    return plan;
  }

  writeFileAtomic(sessionFilePath, serializeJsonlSession(plan.entries));
  return plan;
}

export function restoreSessionFileVisibility(sessionFilePath: string): RestoreMessagesPlan {
  const content = readFileSync(sessionFilePath, "utf-8");
  const entries = parseJsonlSession(content);
  const plan = restoreHiddenEntries(entries);
  if (!plan.changed) {
    return plan;
  }

  writeFileAtomic(sessionFilePath, serializeJsonlSession(plan.entries));
  return plan;
}
