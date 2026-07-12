import assert from "node:assert/strict";
import test from "node:test";

import {
  applyHiddenPrefix,
  buildVisibleSessionContext,
  buildVisibleSessionContextWithHiddenPrefix,
  dropHiddenEntries,
  isSessionTreeEntry,
  selectVisibleEntries,
} from "../src/session-visibility.js";
import {
  buildLinearConversationSession,
  buildTimedSessionEntries,
  extractHiddenIds,
} from "./helpers/fixtures.js";

const buildSession = buildTimedSessionEntries;

test("applyHiddenPrefix hides a contiguous active-branch prefix", () => {
  const entries = buildSession(buildLinearConversationSession());

  const plan = applyHiddenPrefix(entries, 2);
  assert.equal(plan.hiddenEntryCount, 2);
  assert.equal(plan.retainedVisibleItemCount, 2);
  assert.deepEqual(extractHiddenIds(plan.entries), ["user-1", "assistant-1"]);
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
  assert.deepEqual(extractHiddenIds(plan.entries), []);

  const visibleContext = buildVisibleSessionContext(plan.entries.filter(isSessionTreeEntry));
  assert.deepEqual(visibleContext.messages.map((message) => message.role), ["assistant", "toolResult", "user"]);
});

test("buildVisibleSessionContext skips hidden entries while preserving later visible context", () => {
  const entries = buildSession(buildLinearConversationSession({ hiddenPrefix: true }));

  const visibleContext = buildVisibleSessionContext(entries.filter(isSessionTreeEntry));
  assert.deepEqual(visibleContext.messages.map((message) => message.role), ["user", "assistant"]);
});

test("buildVisibleSessionContextWithHiddenPrefix filters older active-branch entries without mutating source", () => {
  const entries = buildSession(buildLinearConversationSession());
  const treeEntries = entries.filter(isSessionTreeEntry);

  const visibleContext = buildVisibleSessionContextWithHiddenPrefix(treeEntries, 2);

  assert.deepEqual(visibleContext.messages.map((message) => message.role), ["user", "assistant"]);
  assert.equal(treeEntries.some((entry) => entry.hidden === true), false);
});

test("selectVisibleEntries drops the older prefix of a compaction-aware entry list", () => {
  const entries = buildSession(buildLinearConversationSession()).filter(isSessionTreeEntry);

  const visible = selectVisibleEntries(entries, 2);

  assert.deepEqual(
    visible.map((entry) => entry.id),
    ["user-2", "assistant-2"],
  );
  // Source list is not mutated.
  assert.equal(entries.length, 4);
  assert.equal(entries.some((entry) => entry.hidden === true), false);
});

test("selectVisibleEntries keeps a trailing tool result attached to a visible assistant", () => {
  const entries = buildSession([
    { type: "session", id: "session-1" },
    { type: "message", id: "user-1", parentId: null, message: { role: "user", content: [] } },
    {
      type: "message",
      id: "assistant-1",
      parentId: "user-1",
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
  ]).filter(isSessionTreeEntry);

  // Keep 1 primary item: the assistant, its trailing tool result rides along.
  const visible = selectVisibleEntries(entries, 1);
  assert.deepEqual(
    visible.map((entry) => entry.id),
    ["assistant-1", "tool-result-1"],
  );
});

test("selectVisibleEntries rejects non-positive counts", () => {
  const entries = buildSession(buildLinearConversationSession()).filter(isSessionTreeEntry);
  assert.throws(() => selectVisibleEntries(entries, 0), /positive integer/);
});

test("dropHiddenEntries removes entries carrying a persisted hidden flag", () => {
  const entries = buildSession(buildLinearConversationSession({ hiddenPrefix: true })).filter(
    isSessionTreeEntry,
  );

  const visible = dropHiddenEntries(entries);

  assert.equal(visible.some((entry) => entry.hidden === true), false);
  assert.deepEqual(
    visible.map((entry) => entry.id),
    ["user-2", "assistant-2"],
  );
});
