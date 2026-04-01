import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import {
  HIDE_MESSAGES_CONTROL_CUSTOM_TYPE,
  HIDE_MESSAGES_CONTROL_MODE_MANUAL_HIDE,
  HIDE_MESSAGES_CONTROL_MODE_MANUAL_RESTORE,
} from "./constants.js";
import { buildActivePath } from "./session-path.js";
import type {
  HideMessagesControlEntryData,
  HideMessagesControlMode,
  SessionTreeEntry,
} from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHideMessagesControlMode(value: unknown): value is HideMessagesControlMode {
  return value === HIDE_MESSAGES_CONTROL_MODE_MANUAL_HIDE
    || value === HIDE_MESSAGES_CONTROL_MODE_MANUAL_RESTORE;
}

function parseControlEntryData(value: unknown): HideMessagesControlEntryData | null {
  if (!isRecord(value) || !isHideMessagesControlMode(value.mode)) {
    return null;
  }

  return { mode: value.mode };
}

export function getLatestHideMessagesControlMode(
  entries: readonly SessionTreeEntry[],
  leafId?: string | null,
): HideMessagesControlMode | undefined {
  const path = buildActivePath(entries, leafId);
  for (let index = path.length - 1; index >= 0; index -= 1) {
    const entry = path[index];
    if (entry.type !== "custom" || entry.customType !== HIDE_MESSAGES_CONTROL_CUSTOM_TYPE) {
      continue;
    }

    const data = parseControlEntryData(entry.data);
    if (data) {
      return data.mode;
    }
  }

  return undefined;
}

export function shouldSkipAutoHide(
  entries: readonly SessionTreeEntry[],
  leafId?: string | null,
): boolean {
  return getLatestHideMessagesControlMode(entries, leafId) === HIDE_MESSAGES_CONTROL_MODE_MANUAL_RESTORE;
}

export function persistHideMessagesControlMode(
  pi: ExtensionAPI,
  mode: HideMessagesControlMode,
): void {
  pi.appendEntry<HideMessagesControlEntryData>(HIDE_MESSAGES_CONTROL_CUSTOM_TYPE, { mode });
}
