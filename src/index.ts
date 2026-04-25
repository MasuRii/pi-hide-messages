import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import { applyAutoHideToCurrentSession } from "./auto-hide.js";
import { registerHideMessagesCommand } from "./command.js";
import { loadHideMessagesConfig } from "./config-store.js";
import { EXTENSION_ID } from "./constants.js";
import {
  applyHideMessagesRenderPatch,
  registerPatchWarning,
} from "./render-patch.js";
import { registerRestoreMessagesCommand } from "./restore-command.js";
import type { HideMessagesConfigLoadResult } from "./types.js";

export default function hideMessagesExtension(pi: ExtensionAPI): void {
  let cachedConfigResult: HideMessagesConfigLoadResult | null = null;
  let lastWarningFingerprint = "";

  const refreshConfig = (ctx: Pick<ExtensionContext, "cwd">): HideMessagesConfigLoadResult => {
    cachedConfigResult = loadHideMessagesConfig(ctx);
    return cachedConfigResult;
  };

  const getConfigResult = (ctx: Pick<ExtensionContext, "cwd">): HideMessagesConfigLoadResult => {
    return cachedConfigResult ?? refreshConfig(ctx);
  };

  const reportWarnings = (
    ctx: Pick<ExtensionContext, "hasUI" | "ui">,
    configResult: HideMessagesConfigLoadResult,
  ): void => {
    if (!ctx.hasUI || configResult.warnings.length === 0) {
      return;
    }

    const fingerprint = configResult.warnings.join("\n");
    if (fingerprint === lastWarningFingerprint) {
      return;
    }

    lastWarningFingerprint = fingerprint;
    for (const warning of configResult.warnings) {
      ctx.ui.notify(`${EXTENSION_ID}: ${warning}`, "warning");
    }
  };

  registerHideMessagesCommand(pi, {
    getConfigResult,
    reportWarnings,
  });
  registerRestoreMessagesCommand(pi);

  const patchResult = applyHideMessagesRenderPatch();
  registerPatchWarning(pi, patchResult);

  const syncAutoHide = async (ctx: ExtensionContext): Promise<void> => {
    const configResult = refreshConfig(ctx);
    reportWarnings(ctx, configResult);

    try {
      await applyAutoHideToCurrentSession(ctx, configResult.config);
    } catch (error) {
      if (!ctx.hasUI) {
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      ctx.ui.notify(`${EXTENSION_ID}: failed to auto-hide older messages: ${message}`, "warning");
    }
  };

  pi.on("session_start", async (_event, ctx) => {
    await syncAutoHide(ctx);
  });

}
