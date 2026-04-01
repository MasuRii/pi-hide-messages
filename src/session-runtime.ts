import type { ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";

import type { SessionFileEntry, SessionTreeEntry } from "./types.js";

export function getSessionLeafId(
  ctx: Pick<ExtensionContext | ExtensionCommandContext, "sessionManager">,
): string | null | undefined {
  const manager = ctx.sessionManager as {
    getLeafId?: () => string | null | undefined;
  };

  return typeof manager.getLeafId === "function" ? manager.getLeafId() : undefined;
}

export function getLiveSessionEntries(
  ctx: Pick<ExtensionContext | ExtensionCommandContext, "sessionManager">,
): SessionTreeEntry[] {
  return ctx.sessionManager.getEntries() as SessionTreeEntry[];
}

export function synchronizeHiddenFlags(
  liveEntries: readonly SessionTreeEntry[],
  nextEntries: readonly SessionFileEntry[],
): boolean {
  const hiddenById = new Map<string, boolean>();

  for (const entry of nextEntries) {
    if (entry.type === "session" || typeof entry.id !== "string") {
      continue;
    }

    hiddenById.set(entry.id, entry.hidden === true);
  }

  let changed = false;
  for (const entry of liveEntries) {
    const nextHidden = hiddenById.get(entry.id) === true;
    if (entry.hidden === nextHidden) {
      continue;
    }

    changed = true;
    if (nextHidden) {
      entry.hidden = true;
      continue;
    }

    delete entry.hidden;
  }

  return changed;
}
