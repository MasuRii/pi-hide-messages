import assert from "node:assert/strict";
import test from "node:test";

import {
  applyHiddenPrefix,
  buildVisibleSessionContext,
  restoreHiddenEntries,
} from "../src/session-visibility.js";
import type { SessionFileEntry, SessionTreeEntry } from "../src/types.js";

function buildSession(entries: readonly Omit<SessionFileEntry, "timestamp">[]): SessionFileEntry[] {
  return entries.map((entry, index) => ({
    ...entry,
    timestamp: new Date(1_700_000_000_000 + index * 1_000).toISOString(),
  })) as SessionFileEntry[];
}

function isSessionTreeEntry(entry: SessionFileEntry): entry is SessionTreeEntry {
  return entry.type !== "session";
}

test("applyHiddenPrefix hides a contiguous active-branch prefix", () => {
  const entries = buildSession([
    { type: "session", id: "session-1" },
    { type: "message", id: "user-1", parentId: null, message: { role: "user", content: [] } },
    {
      type: "message",
      id: "assistant-1",
      parentId: "user-1",
      message: { role: "assistant", content: [] },
    },
    { type: "message", id: "user-2", parentId: "assistant-1", message: { role: "user", content: [] } },
    {
      type: "message",
      id: "assistant-2",
      parentId: "user-2",
      message: { role: "assistant", content: [] },
    },
  ]);

  const plan = applyHiddenPrefix(entries, 2);
  assert.equal(plan.hiddenEntryCount, 2);
  assert.equal(plan.retainedVisibleItemCount, 2);

  const hiddenIds = plan.entries
    .filter((entry): entry is SessionFileEntry & { id: string; hidden?: boolean } => "id" in entry)
    .filter((entry) => entry.hidden === true)
    .map((entry) => entry.id);
  assert.deepEqual(hiddenIds, ["user-1", "assistant-1"]);
});

test("applyHiddenPrefix keeps assistant tool results when the assistant stays visible", () => {
  const entries = buildSession([
    { type: "session", id: "session-1" },
    {
      type: "message",
      id: "assistant-1",
      parentId: null,
      message: {
        role: "assistant",
        content: [{ type: "toolCall", id: "call-1", name: "read", arguments: { path: "a" } }],
      },
    },
    {
      type: "message",
      id: "tool-result-1",
      parentId: "assistant-1",
      message: { role: "toolResult", toolCallId: "call-1", content: [] },
    },
    { type: "message", id: "user-1", parentId: "tool-result-1", message: { role: "user", content: [] } },
  ]);

  const plan = applyHiddenPrefix(entries, 2);
  const hiddenIds = plan.entries
    .filter((entry): entry is SessionFileEntry & { id: string; hidden?: boolean } => "id" in entry)
    .filter((entry) => entry.hidden === true)
    .map((entry) => entry.id);
  assert.deepEqual(hiddenIds, []);

  const visibleContext = buildVisibleSessionContext(plan.entries.filter(isSessionTreeEntry));
  assert.deepEqual(visibleContext.messages.map((message) => message.role), ["assistant", "toolResult", "user"]);
});

test("restoreHiddenEntries removes hidden flags across the session file", () => {
  const entries = buildSession([
    { type: "session", id: "session-1" },
    {
      type: "message",
      id: "user-1",
      parentId: null,
      hidden: true,
      message: { role: "user", content: [] },
    },
    {
      type: "message",
      id: "assistant-1",
      parentId: "user-1",
      hidden: true,
      message: { role: "assistant", content: [] },
    },
  ]);

  const plan = restoreHiddenEntries(entries);
  assert.equal(plan.changed, true);
  assert.equal(plan.restoredEntryCount, 2);
  assert.equal(plan.entries.some((entry) => "hidden" in entry && entry.hidden === true), false);
});

test("buildVisibleSessionContext skips hidden entries while preserving later visible context", () => {
  const entries = buildSession([
    { type: "session", id: "session-1" },
    {
      type: "message",
      id: "user-1",
      parentId: null,
      hidden: true,
      message: { role: "user", content: [] },
    },
    {
      type: "message",
      id: "assistant-1",
      parentId: "user-1",
      hidden: true,
      message: { role: "assistant", content: [] },
    },
    { type: "message", id: "user-2", parentId: "assistant-1", message: { role: "user", content: [] } },
    {
      type: "message",
      id: "assistant-2",
      parentId: "user-2",
      message: { role: "assistant", content: [] },
    },
  ]);

  const visibleContext = buildVisibleSessionContext(entries.filter(isSessionTreeEntry));
  assert.deepEqual(visibleContext.messages.map((message) => message.role), ["user", "assistant"]);
});
