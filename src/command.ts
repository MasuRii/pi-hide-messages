import { existsSync } from "node:fs";

import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

import {
  HIDE_MESSAGES_COMMAND,
  HIDE_MESSAGES_DESCRIPTION,
  HIDE_MESSAGES_USAGE,
  HIDE_MESSAGES_CONTROL_MODE_MANUAL_HIDE,
} from "./constants.js";
import { persistHideMessagesControlMode } from "./session-control.js";
import { updateSessionFileVisibility } from "./session-file.js";
import {
  getLiveSessionEntries,
  getSessionLeafId,
  synchronizeHiddenFlags,
} from "./session-runtime.js";
import type { HideMessagesPlan, HideMessagesConfigController } from "./types.js";

interface ParsedArgs {
  keepVisibleCount: number;
  usedDefault: boolean;
}

function parseArgs(args: string, defaultVisibleCount: number): ParsedArgs {
  const trimmed = args.trim();
  if (!trimmed) {
    return { keepVisibleCount: defaultVisibleCount, usedDefault: true };
  }

  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`Expected a positive integer visible-count. ${HIDE_MESSAGES_USAGE}`);
  }

  const keepVisibleCount = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(keepVisibleCount) || keepVisibleCount < 1) {
    throw new Error(`Expected a positive integer visible-count. ${HIDE_MESSAGES_USAGE}`);
  }

  return { keepVisibleCount, usedDefault: false };
}

function buildOutcomeMessage(
  keepVisibleCount: number,
  hiddenEntryCount: number,
  totalVisibleCount: number,
  changed: boolean,
  usedDefault: boolean,
  configPath: string,
): string {
  const keptCount = Math.min(keepVisibleCount, totalVisibleCount);
  const defaultSuffix = usedDefault ? ` using defaultVisibleCount from ${configPath}` : "";
  if (hiddenEntryCount === 0) {
    return changed
      ? `hide-messages: restored all ${keptCount} visible chat item(s). Reloading…`
      : `hide-messages: nothing to hide. All ${keptCount} visible chat item(s) are already retained${defaultSuffix}.`;
  }

  return `hide-messages: hid ${hiddenEntryCount} older session entr${hiddenEntryCount === 1 ? "y" : "ies"} and kept ${keptCount} visible chat item(s)${defaultSuffix}. Reloading…`;
}

function createHideMessagesHandler(
  pi: ExtensionAPI,
  controller: HideMessagesConfigController,
): (args: string, ctx: ExtensionCommandContext) => Promise<void> {
  return async function handleHideMessagesCommand(
    args: string,
    ctx: ExtensionCommandContext,
  ): Promise<void> {
    const configResult = controller.getConfigResult(ctx);
    controller.reportWarnings(ctx, configResult);

    let parsed: ParsedArgs;
    try {
      parsed = parseArgs(args, configResult.config.defaultVisibleCount);
    } catch (error) {
      ctx.ui.notify(error instanceof Error ? error.message : String(error), "warning");
      return;
    }

    const sessionFilePath = ctx.sessionManager.getSessionFile();
    if (!sessionFilePath) {
      ctx.ui.notify("hide-messages: no persisted session file is active.", "error");
      return;
    }

    if (!existsSync(sessionFilePath)) {
      ctx.ui.notify(
        "hide-messages: the current session file has not been created yet. Send at least one message first.",
        "warning",
      );
      return;
    }

    let plan: HideMessagesPlan;
    try {
      plan = updateSessionFileVisibility(sessionFilePath, parsed.keepVisibleCount, getSessionLeafId(ctx));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.ui.notify(`hide-messages: failed to update session visibility: ${message}`, "error");
      return;
    }

    synchronizeHiddenFlags(getLiveSessionEntries(ctx), plan.entries);

    try {
      persistHideMessagesControlMode(pi, HIDE_MESSAGES_CONTROL_MODE_MANUAL_HIDE);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.ui.notify(`hide-messages: failed to persist manual hide preference: ${message}`, "error");
      return;
    }

    const notification = buildOutcomeMessage(
      parsed.keepVisibleCount,
      plan.hiddenEntryCount,
      plan.visibleItemCount,
      plan.changed,
      parsed.usedDefault,
      configResult.config.configPath,
    );
    ctx.ui.notify(notification, "info");

    if (!plan.changed || !ctx.hasUI) {
      return;
    }

    await ctx.reload();
  };
}

export function registerHideMessagesCommand(
  pi: ExtensionAPI,
  controller: HideMessagesConfigController,
): void {
  pi.registerCommand(HIDE_MESSAGES_COMMAND, {
    description: HIDE_MESSAGES_DESCRIPTION,
    handler: createHideMessagesHandler(pi, controller),
  });
}
