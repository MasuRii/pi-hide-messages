import { type ExtensionAPI, InteractiveMode } from "@mariozechner/pi-coding-agent";

import { EXTENSION_ID } from "./constants.js";
import {
  buildVisibleSessionContext,
  hasHiddenEntries,
} from "./session-visibility.js";
import type {
  SessionTreeEntry,
  VisibleSessionContext,
} from "./types.js";

const PATCH_FLAG = "__piHideMessagesRenderPatched" as const;

type RenderSessionContext = (
  sessionContext: VisibleSessionContext,
  options?: { updateFooter?: boolean; populateHistory?: boolean },
) => void;

type PatchableInteractiveModePrototype = typeof InteractiveMode.prototype & {
  [PATCH_FLAG]?: boolean;
  renderSessionContext?: RenderSessionContext;
  __piHideMessagesOriginalRenderSessionContext?: RenderSessionContext;
};

type InteractiveModeLike = {
  sessionManager?: {
    getEntries?: () => unknown[];
    getLeafId?: () => string | null | undefined;
  };
};

export interface RenderPatchResult {
  patched: boolean;
  alreadyPatched: boolean;
  error?: string;
}

function getSessionEntries(instance: InteractiveModeLike): SessionTreeEntry[] {
  const getEntries = instance.sessionManager?.getEntries;
  if (typeof getEntries !== "function") {
    return [];
  }

  return getEntries.call(instance.sessionManager) as SessionTreeEntry[];
}

function getLeafId(instance: InteractiveModeLike): string | null | undefined {
  const leafIdGetter = instance.sessionManager?.getLeafId;
  if (typeof leafIdGetter !== "function") {
    return undefined;
  }

  return leafIdGetter.call(instance.sessionManager) as string | null | undefined;
}

function buildPatchedRender(
  originalRender: RenderSessionContext,
): RenderSessionContext {
  return function renderVisibleSessionContext(
    this: InteractiveModeLike,
    sessionContext: VisibleSessionContext,
    options?: { updateFooter?: boolean; populateHistory?: boolean },
  ): void {
    const entries = getSessionEntries(this);
    if (entries.length === 0 || !hasHiddenEntries(entries)) {
      originalRender.call(this as never, sessionContext, options);
      return;
    }

    const visibleContext = buildVisibleSessionContext(entries, getLeafId(this));
    originalRender.call(this as never, visibleContext, options);
  };
}

export function applyHideMessagesRenderPatch(): RenderPatchResult {
  const prototype = InteractiveMode.prototype as PatchableInteractiveModePrototype;
  if (prototype[PATCH_FLAG]) {
    return { patched: false, alreadyPatched: true };
  }

  const originalRender = prototype.renderSessionContext as RenderSessionContext | undefined;
  if (typeof originalRender !== "function") {
    return {
      patched: false,
      alreadyPatched: false,
      error: "InteractiveMode.renderSessionContext is unavailable",
    };
  }

  prototype.__piHideMessagesOriginalRenderSessionContext ??= originalRender;
  prototype.renderSessionContext = buildPatchedRender(
    prototype.__piHideMessagesOriginalRenderSessionContext,
  );
  prototype[PATCH_FLAG] = true;

  return { patched: true, alreadyPatched: false };
}

export function registerPatchWarning(
  pi: ExtensionAPI,
  patchResult: RenderPatchResult,
): void {
  if (patchResult.patched || patchResult.alreadyPatched) {
    return;
  }

  let warned = false;
  pi.on("session_start", async (_event, ctx) => {
    if (warned || !ctx.hasUI) {
      return;
    }

    warned = true;
    ctx.ui.notify(
      `${EXTENSION_ID}: failed to patch TUI message rendering (${patchResult.error ?? "unknown error"})`,
      "warning",
    );
  });
}
