import type { SessionTreeEntry } from "./types.js";

function buildEntryMap(entries: readonly SessionTreeEntry[]): Map<string, SessionTreeEntry> {
  const byId = new Map<string, SessionTreeEntry>();
  for (const entry of entries) {
    byId.set(entry.id, entry);
  }
  return byId;
}

function getLeafEntry(
  entries: readonly SessionTreeEntry[],
  byId: ReadonlyMap<string, SessionTreeEntry>,
  leafId?: string | null,
): SessionTreeEntry | undefined {
  if (leafId === null) {
    return undefined;
  }

  if (leafId) {
    const requestedLeaf = byId.get(leafId);
    if (requestedLeaf) {
      return requestedLeaf;
    }
  }

  return entries[entries.length - 1];
}

export function buildActivePath(
  entries: readonly SessionTreeEntry[],
  leafId?: string | null,
): SessionTreeEntry[] {
  if (entries.length === 0) {
    return [];
  }

  const byId = buildEntryMap(entries);
  const leaf = getLeafEntry(entries, byId, leafId);
  if (!leaf) {
    return [];
  }

  const path: SessionTreeEntry[] = [];
  let current: SessionTreeEntry | undefined = leaf;
  while (current) {
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }

  return path;
}
