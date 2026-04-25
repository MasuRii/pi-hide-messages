import { existsSync } from "node:fs";

import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

import {
  HIDE_MESSAGES_CONTROL_MODE_MANUAL_RESTORE,
  RESTORE_MESSAGES_COMMAND,
  RESTORE_MESSAGES_DESCRIPTION,
} from "./constants.js";
import { queueRuntimeReload } from "./reload-queue.js";
import { persistHideMessagesControlMode } from "./session-control.js";
import { restoreSessionFileVisibility } from "./session-file.js";
import {
  getLiveSessionEntries,
  synchronizeHiddenFlags,
} from "./session-runtime.js";
import type { RestoreMessagesPlan } from "./types.js";

function buildOutcomeMessage(plan: RestoreMessagesPlan): string {
  if (!plan.changed) {
    return "restore-messages: all session entries are already visible.";
  }

  return `restore-messages: restored ${plan.restoredEntryCount} hidden session entr${plan.restoredEntryCount === 1 ? "y" : "ies"}. Reloading…`;
}

async function handleRestoreMessagesCommand(
  pi: ExtensionAPI,
  args: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  if (args.trim().length > 0) {
    ctx.ui.notify("restore-messages: this command does not accept arguments.", "warning");
    return;
  }

  const sessionFilePath = ctx.sessionManager.getSessionFile();
  if (!sessionFilePath) {
    ctx.ui.notify("restore-messages: no persisted session file is active.", "error");
    return;
  }

  if (!existsSync(sessionFilePath)) {
    ctx.ui.notify(
      "restore-messages: the current session file has not been created yet. Send at least one message first.",
      "warning",
    );
    return;
  }

  let plan: RestoreMessagesPlan;
  try {
    plan = restoreSessionFileVisibility(sessionFilePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.ui.notify(`restore-messages: failed to restore session visibility: ${message}`, "error");
    return;
  }

  synchronizeHiddenFlags(getLiveSessionEntries(ctx), plan.entries);

  try {
    persistHideMessagesControlMode(pi, HIDE_MESSAGES_CONTROL_MODE_MANUAL_RESTORE);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.ui.notify(`restore-messages: failed to persist manual restore preference: ${message}`, "error");
    return;
  }

  ctx.ui.notify(buildOutcomeMessage(plan), "info");
  if (!plan.changed || !ctx.hasUI) {
    return;
  }

  await queueRuntimeReload(ctx, "restore-messages");
}

export function registerRestoreMessagesCommand(pi: ExtensionAPI): void {
  pi.registerCommand(RESTORE_MESSAGES_COMMAND, {
    description: RESTORE_MESSAGES_DESCRIPTION,
    handler: (args, ctx) => handleRestoreMessagesCommand(pi, args, ctx),
  });
}
