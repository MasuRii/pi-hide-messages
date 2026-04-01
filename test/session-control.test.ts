import assert from "node:assert/strict";
import test from "node:test";

import {
  HIDE_MESSAGES_CONTROL_CUSTOM_TYPE,
  HIDE_MESSAGES_CONTROL_MODE_MANUAL_HIDE,
  HIDE_MESSAGES_CONTROL_MODE_MANUAL_RESTORE,
} from "../src/constants.js";
import { getLatestHideMessagesControlMode, shouldSkipAutoHide } from "../src/session-control.js";
import type { SessionTreeEntry } from "../src/types.js";

function withTimestamps(entries: readonly Omit<SessionTreeEntry, "timestamp">[]): SessionTreeEntry[] {
  return entries.map((entry, index) => ({
    ...entry,
    timestamp: new Date(1_700_000_000_000 + index * 1_000).toISOString(),
  })) as SessionTreeEntry[];
}

test("manual restore control entry disables auto-hide on the active path", () => {
  const entries = withTimestamps([
    { type: "message", id: "user-1", parentId: null, message: { role: "user", content: [] } },
    {
      type: "custom",
      id: "control-1",
      parentId: "user-1",
      customType: HIDE_MESSAGES_CONTROL_CUSTOM_TYPE,
      data: { mode: HIDE_MESSAGES_CONTROL_MODE_MANUAL_RESTORE },
    },
  ]);

  assert.equal(getLatestHideMessagesControlMode(entries), HIDE_MESSAGES_CONTROL_MODE_MANUAL_RESTORE);
  assert.equal(shouldSkipAutoHide(entries), true);
});

test("manual hide control entry re-enables auto-hide after a restore", () => {
  const entries = withTimestamps([
    { type: "message", id: "user-1", parentId: null, message: { role: "user", content: [] } },
    {
      type: "custom",
      id: "control-restore",
      parentId: "user-1",
      customType: HIDE_MESSAGES_CONTROL_CUSTOM_TYPE,
      data: { mode: HIDE_MESSAGES_CONTROL_MODE_MANUAL_RESTORE },
    },
    {
      type: "custom",
      id: "control-hide",
      parentId: "control-restore",
      customType: HIDE_MESSAGES_CONTROL_CUSTOM_TYPE,
      data: { mode: HIDE_MESSAGES_CONTROL_MODE_MANUAL_HIDE },
    },
  ]);

  assert.equal(getLatestHideMessagesControlMode(entries), HIDE_MESSAGES_CONTROL_MODE_MANUAL_HIDE);
  assert.equal(shouldSkipAutoHide(entries), false);
});
