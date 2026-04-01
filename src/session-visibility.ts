import type {
  AgentMessageLike,
  HideMessagesPlan,
  RestoreMessagesPlan,
  SessionBranchSummaryEntry,
  SessionCompactionEntry,
  SessionCustomMessageEntry,
  SessionFileEntry,
  SessionHeaderEntry,
  SessionMessageEntry,
  SessionTreeEntry,
  VisibleSessionContext,
} from "./types.js";
import { buildActivePath } from "./session-path.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSessionHeaderEntry(entry: SessionFileEntry): entry is SessionHeaderEntry {
  return entry.type === "session";
}

function isSessionTreeEntry(entry: SessionFileEntry): entry is SessionTreeEntry {
  return !isSessionHeaderEntry(entry);
}

function parseEntry(line: string, lineNumber: number): SessionFileEntry {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON on line ${lineNumber}: ${message}`);
  }

  if (!isRecord(parsed) || typeof parsed.type !== "string") {
    throw new Error(`Invalid session entry on line ${lineNumber}: missing string type field.`);
  }

  return parsed as SessionFileEntry;
}

export function parseJsonlSession(content: string): SessionFileEntry[] {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    throw new Error("Session file is empty.");
  }

  const entries = lines.map((line, index) => parseEntry(line, index + 1));
  if (entries[0]?.type !== "session") {
    throw new Error("Session file does not start with a valid session header.");
  }

  return entries;
}

export function serializeJsonlSession(entries: readonly SessionFileEntry[]): string {
  return `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
}

function isSessionMessageEntry(entry: SessionTreeEntry): entry is SessionMessageEntry {
  return entry.type === "message" && isRecord(entry.message);
}

function isSessionCustomMessageEntry(entry: SessionTreeEntry): entry is SessionCustomMessageEntry {
  return entry.type === "custom_message";
}

function isSessionBranchSummaryEntry(entry: SessionTreeEntry): entry is SessionBranchSummaryEntry {
  return entry.type === "branch_summary";
}

function isSessionCompactionEntry(entry: SessionTreeEntry): entry is SessionCompactionEntry {
  return entry.type === "compaction";
}

function getMessageRole(entry: SessionTreeEntry): string | undefined {
  if (!isSessionMessageEntry(entry)) {
    return undefined;
  }

  return typeof entry.message.role === "string" ? entry.message.role : undefined;
}

function countsTowardVisibleRetainTarget(entry: SessionTreeEntry): boolean {
  if (entry.type === "message") {
    return getMessageRole(entry) !== "toolResult";
  }

  if (entry.type === "custom_message") {
    return entry.display === true;
  }

  return entry.type === "branch_summary" || entry.type === "compaction";
}

function determineCutoffIndex(path: readonly SessionTreeEntry[], keepVisibleCount: number): number {
  if (path.length === 0) {
    return 0;
  }

  let retained = 0;
  for (let index = path.length - 1; index >= 0; index -= 1) {
    if (!countsTowardVisibleRetainTarget(path[index])) {
      continue;
    }

    retained += 1;
    if (retained >= keepVisibleCount) {
      return index;
    }
  }

  return 0;
}

function setHiddenState(entry: SessionTreeEntry, hidden: boolean): SessionTreeEntry {
  const currentlyHidden = entry.hidden === true;
  if (currentlyHidden === hidden) {
    return entry;
  }

  if (hidden) {
    return { ...entry, hidden: true };
  }

  const { hidden: _hidden, ...rest } = entry;
  return rest;
}

function updateEntriesForHiddenPrefix(
  entries: readonly SessionFileEntry[],
  path: readonly SessionTreeEntry[],
  cutoffIndex: number,
): HideMessagesPlan {
  const hiddenIds = new Set(path.slice(0, cutoffIndex).map((entry) => entry.id));
  const visibleIds = new Set(path.slice(cutoffIndex).map((entry) => entry.id));
  const primaryVisibleCount = path.filter(countsTowardVisibleRetainTarget).length;
  const retainedVisibleItemCount = path.slice(cutoffIndex).filter(countsTowardVisibleRetainTarget).length;

  let changed = false;
  const nextEntries = entries.map((entry) => {
    if (!isSessionTreeEntry(entry)) {
      return entry;
    }

    if (hiddenIds.has(entry.id)) {
      const nextEntry = setHiddenState(entry, true);
      changed ||= nextEntry !== entry;
      return nextEntry;
    }

    if (visibleIds.has(entry.id)) {
      const nextEntry = setHiddenState(entry, false);
      changed ||= nextEntry !== entry;
      return nextEntry;
    }

    return entry;
  });

  return {
    entries: nextEntries,
    changed,
    hiddenEntryCount: hiddenIds.size,
    visibleItemCount: primaryVisibleCount,
    retainedVisibleItemCount,
  };
}

export function applyHiddenPrefix(
  entries: readonly SessionFileEntry[],
  keepVisibleCount: number,
  leafId?: string | null,
): HideMessagesPlan {
  if (!Number.isInteger(keepVisibleCount) || keepVisibleCount < 1) {
    throw new Error("Visible count must be a positive integer.");
  }

  const treeEntries = entries.filter(isSessionTreeEntry);
  const path = buildActivePath(treeEntries, leafId);
  if (path.length === 0) {
    return {
      entries: [...entries],
      changed: false,
      hiddenEntryCount: 0,
      visibleItemCount: 0,
      retainedVisibleItemCount: 0,
    };
  }

  const cutoffIndex = determineCutoffIndex(path, keepVisibleCount);
  return updateEntriesForHiddenPrefix(entries, path, cutoffIndex);
}

function toTimestampMillis(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isHidden(entry: SessionTreeEntry): boolean {
  return entry.hidden === true;
}

function pushVisiblePathMessage(messages: AgentMessageLike[], entry: SessionTreeEntry): void {
  if (isHidden(entry)) {
    return;
  }

  if (isSessionMessageEntry(entry)) {
    messages.push(entry.message);
    return;
  }

  if (isSessionCustomMessageEntry(entry)) {
    messages.push(createCustomMessage(entry));
    return;
  }

  if (isSessionBranchSummaryEntry(entry)) {
    messages.push(createBranchSummaryMessage(entry));
  }
}

function createCustomMessage(entry: SessionCustomMessageEntry): AgentMessageLike {
  return {
    role: "custom",
    customType: entry.customType,
    content: entry.content,
    display: entry.display,
    details: entry.details,
    timestamp: toTimestampMillis(entry.timestamp),
  };
}

function createBranchSummaryMessage(entry: SessionBranchSummaryEntry): AgentMessageLike {
  return {
    role: "branchSummary",
    summary: entry.summary,
    fromId: entry.fromId,
    timestamp: toTimestampMillis(entry.timestamp),
  };
}

function createCompactionSummaryMessage(entry: SessionCompactionEntry): AgentMessageLike {
  return {
    role: "compactionSummary",
    summary: entry.summary,
    tokensBefore: entry.tokensBefore,
    timestamp: toTimestampMillis(entry.timestamp),
  };
}

function resolveVisibleSessionModel(path: readonly SessionTreeEntry[]): { provider: string; modelId: string } | null {
  let model: { provider: string; modelId: string } | null = null;

  for (const entry of path) {
    if (entry.type === "model_change") {
      const provider = typeof entry.provider === "string" ? entry.provider : "";
      const modelId = typeof entry.modelId === "string" ? entry.modelId : "";
      if (provider && modelId) {
        model = { provider, modelId };
      }
      continue;
    }

    if (!isSessionMessageEntry(entry) || getMessageRole(entry) !== "assistant") {
      continue;
    }

    const provider = typeof entry.message.provider === "string" ? entry.message.provider : "";
    const modelId = typeof entry.message.model === "string" ? entry.message.model : "";
    if (provider && modelId) {
      model = { provider, modelId };
    }
  }

  return model;
}

function resolveVisibleThinkingLevel(path: readonly SessionTreeEntry[]): string {
  let thinkingLevel = "off";

  for (const entry of path) {
    if (entry.type === "thinking_level_change" && typeof entry.thinkingLevel === "string") {
      thinkingLevel = entry.thinkingLevel;
    }
  }

  return thinkingLevel;
}

function findCompactionEntry(path: readonly SessionTreeEntry[]): SessionCompactionEntry | null {
  for (const entry of path) {
    if (isSessionCompactionEntry(entry)) {
      return entry;
    }
  }

  return null;
}

function appendMessagesWithoutCompaction(messages: AgentMessageLike[], path: readonly SessionTreeEntry[]): void {
  for (const entry of path) {
    pushVisiblePathMessage(messages, entry);
  }
}

function appendMessagesWithCompaction(messages: AgentMessageLike[], path: readonly SessionTreeEntry[]): void {
  const compaction = findCompactionEntry(path);
  if (!compaction) {
    appendMessagesWithoutCompaction(messages, path);
    return;
  }

  if (!isHidden(compaction)) {
    messages.push(createCompactionSummaryMessage(compaction));
  }

  const compactionIndex = path.findIndex((entry) => entry.id === compaction.id);
  let foundFirstKeptEntry = false;

  for (let index = 0; index < compactionIndex; index += 1) {
    const entry = path[index];
    if (entry.id === compaction.firstKeptEntryId) {
      foundFirstKeptEntry = true;
    }
    if (foundFirstKeptEntry) {
      pushVisiblePathMessage(messages, entry);
    }
  }

  for (let index = compactionIndex + 1; index < path.length; index += 1) {
    pushVisiblePathMessage(messages, path[index]);
  }
}

export function buildVisibleSessionContext(
  entries: readonly SessionTreeEntry[],
  leafId?: string | null,
): VisibleSessionContext {
  const path = buildActivePath(entries, leafId);
  if (path.length === 0) {
    return { messages: [], thinkingLevel: "off", model: null };
  }

  const messages: AgentMessageLike[] = [];
  appendMessagesWithCompaction(messages, path);

  return {
    messages,
    thinkingLevel: resolveVisibleThinkingLevel(path),
    model: resolveVisibleSessionModel(path),
  };
}

export function restoreHiddenEntries(entries: readonly SessionFileEntry[]): RestoreMessagesPlan {
  let restoredEntryCount = 0;
  let changed = false;

  const nextEntries = entries.map((entry) => {
    if (!isSessionTreeEntry(entry) || entry.hidden !== true) {
      return entry;
    }

    restoredEntryCount += 1;
    changed = true;
    const { hidden: _hidden, ...rest } = entry;
    return rest;
  });

  return {
    entries: nextEntries,
    changed,
    restoredEntryCount,
  };
}

export function hasHiddenEntries(entries: readonly SessionTreeEntry[]): boolean {
  return entries.some((entry) => isHidden(entry));
}
