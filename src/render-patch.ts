import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import {
  DEFAULT_CONFIG_FILE,
  EXTENSION_ID,
  HIDE_MESSAGES_CONTROL_MODE_MANUAL_HIDE,
  HIDE_MESSAGES_CONTROL_MODE_MANUAL_RESTORE,
} from "./constants.js";
import { getErrorMessage } from "./shared/error-utils.js";
import type {
  HideMessagesControlEntryData,
  HideMessagesConfigLoadResult,
  SessionTreeEntry,
  VisibleSessionContext,
} from "./types.js";

const PATCH_FLAG = "__piHideMessagesRenderPatched" as const;
const PATCH_VERSION = 3;

type RenderOptions = { updateFooter?: boolean; populateHistory?: boolean };

// Legacy API (Pi <= 0.80.3): renders a pre-projected session context.
type RenderSessionContext = (sessionContext: VisibleSessionContext, options?: RenderOptions) => void;

// Current API (Pi >= 0.80.5): renders the compaction-aware active entry list.
type RenderSessionEntries = (entries: SessionTreeEntry[], options?: RenderOptions) => void;

type PatchableInteractiveModePrototype = {
  [PATCH_FLAG]?: boolean;
  renderSessionContext?: RenderSessionContext;
  renderSessionEntries?: RenderSessionEntries;
  __piHideMessagesOriginalRenderSessionContext?: RenderSessionContext;
  __piHideMessagesOriginalRenderSessionEntries?: RenderSessionEntries;
  __piHideMessagesRenderPatchVersion?: number;
};

type InteractiveModeLike = {
  sessionManager?: {
    getCwd?: () => string;
    getEntries?: () => unknown[];
    getLeafId?: () => string | null | undefined;
  };
};

type InteractiveModeConstructor = {
  prototype: PatchableInteractiveModePrototype;
};

type VisibilityHelpers = {
  buildVisibleSessionContext(
    entries: readonly SessionTreeEntry[],
    leafId?: string | null,
  ): VisibleSessionContext;
  buildVisibleSessionContextWithHiddenPrefix(
    entries: readonly SessionTreeEntry[],
    keepVisibleCount: number,
    leafId?: string | null,
  ): VisibleSessionContext;
  selectVisibleEntries(
    entries: readonly SessionTreeEntry[],
    keepVisibleCount: number,
  ): SessionTreeEntry[];
  dropHiddenEntries(entries: readonly SessionTreeEntry[]): SessionTreeEntry[];
  hasHiddenEntries(entries: readonly SessionTreeEntry[]): boolean;
};

type ControlHelpers = {
  getLatestHideMessagesControlState(
    entries: readonly SessionTreeEntry[],
    leafId?: string | null,
  ): HideMessagesControlEntryData | undefined;
};

type ConfigHelpers = {
  loadHideMessagesConfig(ctx: { cwd: string }): HideMessagesConfigLoadResult;
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

function getCwd(instance: InteractiveModeLike): string {
  const cwdGetter = instance.sessionManager?.getCwd;
  if (typeof cwdGetter !== "function") {
    return process.cwd();
  }

  return cwdGetter.call(instance.sessionManager) || process.cwd();
}

function loadConfig(instance: InteractiveModeLike, config: ConfigHelpers): HideMessagesConfigLoadResult["config"] {
  try {
    return config.loadHideMessagesConfig({ cwd: getCwd(instance) }).config;
  } catch {
    return {
      configPath: "<defaults>",
      enabled: DEFAULT_CONFIG_FILE.enabled,
      debug: DEFAULT_CONFIG_FILE.debug,
      defaultVisibleCount: DEFAULT_CONFIG_FILE.defaultVisibleCount,
      autoHideOnSessionStart: DEFAULT_CONFIG_FILE.autoHideOnSessionStart,
    };
  }
}

/**
 * Resolve how many primary items to keep visible for the current session, or
 * `null` when everything should stay visible (manual restore / disabled hide).
 * Returns `hidden` when nothing should be hidden by count but persisted hidden
 * flags on entries should still be honored.
 */
type VisibilityDecision =
  | { kind: "all" }
  | { kind: "hidden-flags" }
  | { kind: "keep"; keepVisibleCount: number };

function resolveVisibilityDecision(
  instance: InteractiveModeLike,
  entries: readonly SessionTreeEntry[],
  visibility: VisibilityHelpers,
  controls: ControlHelpers,
  config: ConfigHelpers,
): VisibilityDecision {
  const rawEntries = getSessionEntries(instance);
  const leafId = getLeafId(instance);
  const controlState = controls.getLatestHideMessagesControlState(rawEntries, leafId);

  if (controlState?.mode === HIDE_MESSAGES_CONTROL_MODE_MANUAL_RESTORE) {
    return { kind: "all" };
  }

  if (controlState?.mode === HIDE_MESSAGES_CONTROL_MODE_MANUAL_HIDE) {
    const resolvedConfig = loadConfig(instance, config);
    return {
      kind: "keep",
      keepVisibleCount: controlState.visibleCount ?? resolvedConfig.defaultVisibleCount,
    };
  }

  const resolvedConfig = loadConfig(instance, config);
  if (resolvedConfig.autoHideOnSessionStart) {
    return { kind: "keep", keepVisibleCount: resolvedConfig.defaultVisibleCount };
  }

  if (visibility.hasHiddenEntries(entries)) {
    return { kind: "hidden-flags" };
  }

  return { kind: "all" };
}

// -----------------------------------------------------------------------------
// Current API: renderSessionEntries(entries, options)
// -----------------------------------------------------------------------------

function resolveVisibleEntries(
  instance: InteractiveModeLike,
  entries: SessionTreeEntry[],
  visibility: VisibilityHelpers,
  controls: ControlHelpers,
  config: ConfigHelpers,
): SessionTreeEntry[] {
  if (entries.length === 0) {
    return entries;
  }

  const decision = resolveVisibilityDecision(instance, entries, visibility, controls, config);
  switch (decision.kind) {
    case "all":
      return entries;
    case "hidden-flags":
      return visibility.dropHiddenEntries(entries);
    case "keep":
      return visibility.selectVisibleEntries(entries, decision.keepVisibleCount);
  }
}

function buildPatchedRenderEntries(
  originalRender: RenderSessionEntries,
  visibility: VisibilityHelpers,
  controls: ControlHelpers,
  config: ConfigHelpers,
): RenderSessionEntries {
  return function renderVisibleSessionEntries(
    this: InteractiveModeLike,
    entries: SessionTreeEntry[],
    options?: RenderOptions,
  ): void {
    const visibleEntries = resolveVisibleEntries(this, entries, visibility, controls, config);
    originalRender.call(this as never, visibleEntries, options);
  };
}

// -----------------------------------------------------------------------------
// Legacy API: renderSessionContext(sessionContext, options)
// -----------------------------------------------------------------------------

function resolveVisibleContext(
  instance: InteractiveModeLike,
  sessionContext: VisibleSessionContext,
  visibility: VisibilityHelpers,
  controls: ControlHelpers,
  config: ConfigHelpers,
): VisibleSessionContext {
  const entries = getSessionEntries(instance);
  if (entries.length === 0) {
    return sessionContext;
  }

  const leafId = getLeafId(instance);
  const decision = resolveVisibilityDecision(instance, entries, visibility, controls, config);
  switch (decision.kind) {
    case "all":
      return sessionContext;
    case "hidden-flags":
      return visibility.buildVisibleSessionContext(entries, leafId);
    case "keep":
      return visibility.buildVisibleSessionContextWithHiddenPrefix(
        entries,
        decision.keepVisibleCount,
        leafId,
      );
  }
}

function buildPatchedRenderContext(
  originalRender: RenderSessionContext,
  visibility: VisibilityHelpers,
  controls: ControlHelpers,
  config: ConfigHelpers,
): RenderSessionContext {
  return function renderVisibleSessionContext(
    this: InteractiveModeLike,
    sessionContext: VisibleSessionContext,
    options?: RenderOptions,
  ): void {
    const visibleContext = resolveVisibleContext(this, sessionContext, visibility, controls, config);
    originalRender.call(this as never, visibleContext, options);
  };
}

export async function applyHideMessagesRenderPatch(): Promise<RenderPatchResult> {
  try {
    const [codingAgentModule, visibility, controls, config] = await Promise.all([
      import("@earendil-works/pi-coding-agent"),
      import("./session-visibility.js"),
      import("./session-control.js"),
      import("./config-store.js"),
    ]);
    const InteractiveMode = (codingAgentModule as { InteractiveMode?: InteractiveModeConstructor }).InteractiveMode;
    const prototype = InteractiveMode?.prototype;

    if (!prototype) {
      return {
        patched: false,
        alreadyPatched: false,
        error: "InteractiveMode is unavailable",
      };
    }

    if (prototype[PATCH_FLAG] && prototype.__piHideMessagesRenderPatchVersion === PATCH_VERSION) {
      return { patched: false, alreadyPatched: true };
    }

    // Prefer the current entry-based API (Pi >= 0.80.5); fall back to the legacy
    // context-based API for older Pi releases still in the supported range.
    const savedOriginalEntries = prototype.__piHideMessagesOriginalRenderSessionEntries;
    const currentEntries = prototype.renderSessionEntries;
    const originalEntries = typeof savedOriginalEntries === "function" ? savedOriginalEntries : currentEntries;

    if (typeof originalEntries === "function") {
      prototype.__piHideMessagesOriginalRenderSessionEntries = originalEntries;
      prototype.renderSessionEntries = buildPatchedRenderEntries(
        originalEntries,
        visibility,
        controls,
        config,
      );
      prototype[PATCH_FLAG] = true;
      prototype.__piHideMessagesRenderPatchVersion = PATCH_VERSION;
      return { patched: true, alreadyPatched: false };
    }

    const savedOriginalContext = prototype.__piHideMessagesOriginalRenderSessionContext;
    const currentContext = prototype.renderSessionContext;
    const originalContext = typeof savedOriginalContext === "function" ? savedOriginalContext : currentContext;

    if (typeof originalContext === "function") {
      prototype.__piHideMessagesOriginalRenderSessionContext = originalContext;
      prototype.renderSessionContext = buildPatchedRenderContext(
        originalContext,
        visibility,
        controls,
        config,
      );
      prototype[PATCH_FLAG] = true;
      prototype.__piHideMessagesRenderPatchVersion = PATCH_VERSION;
      return { patched: true, alreadyPatched: false };
    }

    return {
      patched: false,
      alreadyPatched: false,
      error: "InteractiveMode.renderSessionEntries is unavailable",
    };
  } catch (error) {
    return {
      patched: false,
      alreadyPatched: false,
      error: getErrorMessage(error),
    };
  }
}

export function registerDeferredRenderPatch(pi: ExtensionAPI): void {
  let attempted = false;
  let warned = false;

  pi.on("session_start", async (_event, ctx) => {
    if (attempted) {
      return;
    }

    attempted = true;
    const patchResult = await applyHideMessagesRenderPatch();
    if (patchResult.patched || patchResult.alreadyPatched || warned || !ctx.hasUI) {
      return;
    }

    warned = true;
    ctx.ui.notify(
      `${EXTENSION_ID}: failed to patch TUI message rendering (${patchResult.error ?? "unknown error"})`,
      "warning",
    );
  });
}
