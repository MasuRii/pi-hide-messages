import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  HIDE_MESSAGES_COMMAND,
  HIDE_MESSAGES_CONTROL_CUSTOM_TYPE,
  HIDE_MESSAGES_CONTROL_MODE_MANUAL_HIDE,
  HIDE_MESSAGES_CONTROL_MODE_MANUAL_RESTORE,
  RESTORE_MESSAGES_COMMAND,
} from "../src/constants.js";
import type {
  HideMessagesControlEntryData,
  SessionFileEntry,
  SessionTreeEntry,
  VisibleSessionContext,
} from "../src/types.js";

const distRoot = fileURLToPath(new URL("..", import.meta.url));
const patchFlag = "__piHideMessagesRenderPatched";
const patchVersionKey = "__piHideMessagesRenderPatchVersion";
const originalRenderKey = "__piHideMessagesOriginalRenderSessionContext";
const originalRenderEntriesKey = "__piHideMessagesOriginalRenderSessionEntries";

type NotificationLevel = "info" | "warning" | "error";

type Notification = {
  level: NotificationLevel;
  message: string;
};

type RuntimeState = {
  cwd: string;
  leafId: string | null;
  liveEntries: SessionTreeEntry[];
};

type StubInteractiveMode = {
  lastRender?: {
    options?: { populateHistory?: boolean; updateFooter?: boolean };
    sessionContext: VisibleSessionContext;
  };
  renderCalls?: Array<{
    options?: { populateHistory?: boolean; updateFooter?: boolean };
    sessionContext: VisibleSessionContext;
  }>;
  lastEntryRender?: {
    options?: { populateHistory?: boolean; updateFooter?: boolean };
    entries: SessionTreeEntry[];
  };
  renderEntryCalls?: Array<{
    options?: { populateHistory?: boolean; updateFooter?: boolean };
    entries: SessionTreeEntry[];
  }>;
  renderSessionContext?(
    sessionContext: VisibleSessionContext,
    options?: { populateHistory?: boolean; updateFooter?: boolean },
  ): void;
  renderSessionEntries?(
    entries: SessionTreeEntry[],
    options?: { populateHistory?: boolean; updateFooter?: boolean },
  ): void;
  sessionManager?: {
    getCwd(): string;
    getEntries(): SessionTreeEntry[];
    getLeafId(): string | null;
  };
};

type RegisteredCommand = {
  description: string;
  handler: (args: string, ctx: CommandContextStub) => Promise<void> | void;
};

function parseJsonlSession(content: string): SessionFileEntry[] {
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as SessionFileEntry);
}

function serializeJsonlSession(entries: readonly SessionFileEntry[]): string {
  return `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
}

type CommandContextStub = {
  cwd: string;
  hasUI: boolean;
  reload(): Promise<void>;
  sessionManager: {
    getEntries(): SessionTreeEntry[];
    getLeafId(): string | null;
    getSessionFile(): string;
  };
  ui: {
    notify(message: string, level?: NotificationLevel): void;
  };
};

function createTempRoot(label: string): string {
  const root = join(
    distRoot,
    ".test-tmp",
    `${label}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  mkdirSync(root, { recursive: true });
  return root;
}

function installPiCodingAgentStub(stubPackageRoot: string): void {
  mkdirSync(stubPackageRoot, { recursive: true });
  writeFileSync(
    join(stubPackageRoot, "package.json"),
    JSON.stringify(
      {
        name: "@earendil-works/pi-coding-agent",
        type: "module",
        exports: "./index.js",
      },
      null,
      2,
    ),
    "utf-8",
  );
  writeFileSync(
    join(stubPackageRoot, "index.js"),
    [
      "export class InteractiveMode {",
      "  renderSessionContext(sessionContext, options) {",
      "    const call = { sessionContext, options };",
      "    if (!Array.isArray(this.renderCalls)) {",
      "      this.renderCalls = [];",
      "    }",
      "    this.renderCalls.push(call);",
      "    this.lastRender = call;",
      "  }",
      "}",
    ].join("\n"),
    "utf-8",
  );
}

function resetInteractiveModePrototype(InteractiveMode: { prototype: StubInteractiveMode }): void {
  const prototype = InteractiveMode.prototype as StubInteractiveMode & Record<string, unknown>;
  delete prototype[patchFlag];
  delete prototype[patchVersionKey];
  delete prototype[originalRenderKey];
  delete prototype[originalRenderEntriesKey];
  // Force the legacy context-based patch path: no renderSessionEntries present.
  delete prototype.renderSessionEntries;
  prototype.renderSessionContext = function renderSessionContext(
    this: StubInteractiveMode,
    sessionContext: VisibleSessionContext,
    options?: { populateHistory?: boolean; updateFooter?: boolean },
  ): void {
    const call = { sessionContext, options };
    if (!Array.isArray(this.renderCalls)) {
      this.renderCalls = [];
    }
    this.renderCalls.push(call);
    this.lastRender = call;
  };
}

function resetInteractiveModePrototypeEntries(InteractiveMode: { prototype: StubInteractiveMode }): void {
  const prototype = InteractiveMode.prototype as StubInteractiveMode & Record<string, unknown>;
  delete prototype[patchFlag];
  delete prototype[patchVersionKey];
  delete prototype[originalRenderKey];
  delete prototype[originalRenderEntriesKey];
  // Force the current entry-based patch path (Pi >= 0.80.5).
  delete prototype.renderSessionContext;
  prototype.renderSessionEntries = function renderSessionEntries(
    this: StubInteractiveMode,
    entries: SessionTreeEntry[],
    options?: { populateHistory?: boolean; updateFooter?: boolean },
  ): void {
    const call = { entries, options };
    if (!Array.isArray(this.renderEntryCalls)) {
      this.renderEntryCalls = [];
    }
    this.renderEntryCalls.push(call);
    this.lastEntryRender = call;
  };
}

function buildSessionEntries(): SessionFileEntry[] {
  const start = 1_700_000_000_000;
  const messages: Array<{ id: string; parentId: string | null; role: string }> = [
    { id: "user-1", parentId: null, role: "user" },
    { id: "assistant-1", parentId: "user-1", role: "assistant" },
    { id: "user-2", parentId: "assistant-1", role: "user" },
    { id: "assistant-2", parentId: "user-2", role: "assistant" },
  ];

  return [
    { type: "session", id: "session-1", cwd: "C:/runtime-validation" },
    ...messages.map((entry, index) => ({
      type: "message" as const,
      id: entry.id,
      parentId: entry.parentId,
      timestamp: new Date(start + index * 1_000).toISOString(),
      message: { role: entry.role, content: [] },
    })),
  ];
}

function readTreeEntries(sessionFilePath: string): SessionTreeEntry[] {
  return parseJsonlSession(readFileSync(sessionFilePath, "utf-8")).filter(
    (entry): entry is SessionTreeEntry => entry.type !== "session",
  );
}

function getHiddenIds(entries: readonly SessionTreeEntry[]): string[] {
  return entries.filter((entry) => entry.hidden === true).map((entry) => entry.id);
}

function buildUnfilteredContext(entries: readonly SessionTreeEntry[]): VisibleSessionContext {
  return {
    messages: entries
      .filter(
        (entry): entry is SessionTreeEntry & { type: "message"; message: VisibleSessionContext["messages"][number] } =>
          entry.type === "message",
      )
      .map((entry) => entry.message),
    thinkingLevel: "off",
    model: null,
  };
}

function createInteractiveModeInstance(
  InteractiveMode: { prototype: StubInteractiveMode },
  state: RuntimeState,
): StubInteractiveMode {
  const instance = Object.create(InteractiveMode.prototype) as StubInteractiveMode;
  Object.defineProperty(instance, "sessionManager", {
    configurable: true,
    value: {
      getCwd: () => state.cwd,
      getEntries: () => state.liveEntries,
      getLeafId: () => state.leafId,
    },
  });
  return instance;
}

function buildCommandContext(
  cwd: string,
  sessionFilePath: string,
  notifications: Notification[],
  state: RuntimeState,
  reloads: { count: number },
): CommandContextStub {
  return {
    cwd,
    hasUI: true,
    async reload(): Promise<void> {
      reloads.count += 1;
    },
    sessionManager: {
      getEntries: () => state.liveEntries,
      getLeafId: () => state.leafId,
      getSessionFile: () => sessionFilePath,
    },
    ui: {
      notify(message: string, level: NotificationLevel = "info"): void {
        notifications.push({ message, level });
      },
    },
  };
}

function assertLatestControlEntry(
  entries: readonly SessionTreeEntry[],
  expectedId: string,
  expectedData: HideMessagesControlEntryData,
): void {
  const control = entries[entries.length - 1] as SessionTreeEntry & {
    customType?: string;
    data?: HideMessagesControlEntryData;
  };
  assert.equal(control.id, expectedId);
  assert.equal(control.customType, HIDE_MESSAGES_CONTROL_CUSTOM_TYPE);
  assert.deepEqual(control.data, expectedData);
}

test("pi-hide-messages remains compatible with v0.68.0 startup, reload, and resume render flows", async () => {
  const tempRoot = createTempRoot("runtime-validation");
  const nodeModulesRoot = join(distRoot, "node_modules");
  const nodeModulesExisted = existsSync(nodeModulesRoot);
  const stubPackageRoot = join(nodeModulesRoot, "@earendil-works", "pi-coding-agent");
  installPiCodingAgentStub(stubPackageRoot);

  try {
    const { InteractiveMode } = await import("@earendil-works/pi-coding-agent");
    const { applyHideMessagesRenderPatch } = await import("../src/render-patch.js");
    const { default: hideMessagesExtension } = await import("../index.js");

    resetInteractiveModePrototype(InteractiveMode as never);

    const oldPatchPrototype = InteractiveMode.prototype as StubInteractiveMode & Record<string, unknown>;
    oldPatchPrototype[originalRenderKey] = oldPatchPrototype.renderSessionContext;
    oldPatchPrototype[patchFlag] = true;
    oldPatchPrototype.renderSessionContext = function oldRenderSessionContext(
      this: StubInteractiveMode,
      sessionContext: VisibleSessionContext,
      options?: { populateHistory?: boolean; updateFooter?: boolean },
    ): void {
      (oldPatchPrototype[originalRenderKey] as NonNullable<StubInteractiveMode["renderSessionContext"]>)
        .call(this, sessionContext, options);
    };

    const upgradePatchResult = await applyHideMessagesRenderPatch();
    assert.deepEqual(upgradePatchResult, { patched: true, alreadyPatched: false });

    const upgradedState: RuntimeState = {
      cwd: tempRoot,
      leafId: "control-upgrade",
      liveEntries: [
        ...buildSessionEntries().filter((entry): entry is SessionTreeEntry => entry.type !== "session"),
        {
          type: "custom",
          id: "control-upgrade",
          parentId: "assistant-2",
          timestamp: new Date(1_700_000_020_000).toISOString(),
          customType: HIDE_MESSAGES_CONTROL_CUSTOM_TYPE,
          data: {
            mode: HIDE_MESSAGES_CONTROL_MODE_MANUAL_HIDE,
            visibleCount: 2,
            firstVisibleEntryId: "user-2",
          },
        } as SessionTreeEntry,
      ],
    };
    const upgradedRenderInstance = createInteractiveModeInstance(
      InteractiveMode as new () => StubInteractiveMode,
      upgradedState,
    );
    upgradedRenderInstance.renderSessionContext?.(buildUnfilteredContext(upgradedState.liveEntries));
    assert.deepEqual(
      upgradedRenderInstance.lastRender?.sessionContext.messages.map((message) => message.role),
      ["user", "assistant"],
    );
    assert.deepEqual(await applyHideMessagesRenderPatch(), { patched: false, alreadyPatched: true });

    resetInteractiveModePrototype(InteractiveMode as never);

    const firstPatchResult = await applyHideMessagesRenderPatch();
    const secondPatchResult = await applyHideMessagesRenderPatch();
    assert.deepEqual(firstPatchResult, { patched: true, alreadyPatched: false });
    assert.deepEqual(secondPatchResult, { patched: false, alreadyPatched: true });

    resetInteractiveModePrototype(InteractiveMode as never);

    const sessionFilePath = join(tempRoot, "session.jsonl");
    writeFileSync(sessionFilePath, serializeJsonlSession(buildSessionEntries()), "utf-8");

    const projectConfigPath = join(
      tempRoot,
      ".pi",
      "extensions",
      "pi-hide-messages",
      "config.json",
    );
    mkdirSync(join(tempRoot, ".pi", "extensions", "pi-hide-messages"), { recursive: true });
    writeFileSync(
      projectConfigPath,
      JSON.stringify(
        {
          debug: false,
          defaultVisibleCount: 2,
          autoHideOnSessionStart: true,
        },
        null,
        2,
      ),
      "utf-8",
    );

    const notifications: Notification[] = [];
    const commands = new Map<string, RegisteredCommand>();
    const sessionStartHandlers: Array<(event: { type: string; reason: string }, ctx: CommandContextStub) => Promise<void> | void> = [];
    const reloads = { count: 0 };
    let controlSequence = 0;

    const state: RuntimeState = {
      cwd: tempRoot,
      leafId: "assistant-2",
      liveEntries: readTreeEntries(sessionFilePath),
    };

    const rebuildRuntimeStateFromFile = (): void => {
      state.liveEntries = readTreeEntries(sessionFilePath);
      state.leafId = state.liveEntries[state.liveEntries.length - 1]?.id ?? null;
    };

    const commandContext = buildCommandContext(tempRoot, sessionFilePath, notifications, state, reloads);

    const pi = {
      appendEntry<T = unknown>(customType: string, data?: T): void {
        controlSequence += 1;
        const entry = {
          type: "custom",
          id: `control-${controlSequence}`,
          parentId: state.leafId,
          timestamp: new Date(1_700_000_010_000 + controlSequence * 1_000).toISOString(),
          customType,
          data,
        } as SessionTreeEntry;

        state.liveEntries = [...state.liveEntries, entry];
        state.leafId = entry.id;

        const nextEntries = [...parseJsonlSession(readFileSync(sessionFilePath, "utf-8")), entry];
        writeFileSync(sessionFilePath, serializeJsonlSession(nextEntries), "utf-8");
      },
      on(
        eventName: string,
        handler: (event: { type: string; reason: string }, ctx: CommandContextStub) => Promise<void> | void,
      ): void {
        if (eventName === "session_start") {
          sessionStartHandlers.push(handler);
        }
      },
      registerCommand(name: string, definition: RegisteredCommand): void {
        commands.set(name, definition);
      },
    };

    hideMessagesExtension(pi as never);

    assert.ok(commands.has(HIDE_MESSAGES_COMMAND));
    assert.ok(commands.has(RESTORE_MESSAGES_COMMAND));
    assert.equal(sessionStartHandlers.length, 2);

    const runSessionStart = async (reason: string): Promise<void> => {
      for (const handler of sessionStartHandlers) {
        await handler({ type: "session_start", reason }, commandContext);
      }
    };

    const sessionFileBeforeAutoHide = readFileSync(sessionFilePath, "utf-8");
    await runSessionStart("resume");
    assert.deepEqual(getHiddenIds(state.liveEntries), []);
    assert.deepEqual(getHiddenIds(readTreeEntries(sessionFilePath)), []);
    assert.equal(readFileSync(sessionFilePath, "utf-8"), sessionFileBeforeAutoHide);

    const hiddenRenderInstance = createInteractiveModeInstance(
      InteractiveMode as new () => StubInteractiveMode,
      state,
    );
    hiddenRenderInstance.renderSessionContext?.(
      buildUnfilteredContext(state.liveEntries),
      { populateHistory: true, updateFooter: true },
    );
    assert.deepEqual(
      hiddenRenderInstance.lastRender?.sessionContext.messages.map((message) => message.role),
      ["user", "assistant"],
    );

    await commands.get(RESTORE_MESSAGES_COMMAND)?.handler("", commandContext);
    assert.equal(reloads.count, 1);
    assert.deepEqual(getHiddenIds(state.liveEntries), []);

    rebuildRuntimeStateFromFile();
    assert.equal(state.leafId, "control-1");
    assertLatestControlEntry(
      state.liveEntries,
      "control-1",
      { mode: HIDE_MESSAGES_CONTROL_MODE_MANUAL_RESTORE },
    );

    await runSessionStart("reload");
    assert.deepEqual(getHiddenIds(state.liveEntries), []);

    const restoredRenderInstance = createInteractiveModeInstance(
      InteractiveMode as new () => StubInteractiveMode,
      state,
    );
    restoredRenderInstance.renderSessionContext?.(buildUnfilteredContext(state.liveEntries));
    assert.deepEqual(
      restoredRenderInstance.lastRender?.sessionContext.messages.map((message) => message.role),
      ["user", "assistant", "user", "assistant"],
    );

    await commands.get(HIDE_MESSAGES_COMMAND)?.handler("2", commandContext);
    assert.equal(reloads.count, 2);
    assert.deepEqual(getHiddenIds(state.liveEntries), []);

    rebuildRuntimeStateFromFile();
    assert.equal(state.leafId, "control-2");
    assertLatestControlEntry(
      state.liveEntries,
      "control-2",
      {
        mode: HIDE_MESSAGES_CONTROL_MODE_MANUAL_HIDE,
        visibleCount: 2,
        firstVisibleEntryId: "user-2",
      },
    );

    await runSessionStart("resume");
    assert.deepEqual(getHiddenIds(state.liveEntries), []);

    const resumedRenderInstance = createInteractiveModeInstance(
      InteractiveMode as new () => StubInteractiveMode,
      state,
    );
    resumedRenderInstance.renderSessionContext?.(buildUnfilteredContext(state.liveEntries));
    assert.deepEqual(
      resumedRenderInstance.lastRender?.sessionContext.messages.map((message) => message.role),
      ["user", "assistant"],
    );

    assert.equal(
      notifications.some((entry) => entry.message.includes("failed to patch TUI message rendering")),
      false,
    );
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
    rmSync(stubPackageRoot, { recursive: true, force: true });
    if (!nodeModulesExisted) {
      rmSync(nodeModulesRoot, { recursive: true, force: true });
    }
  }
});

test("pi-hide-messages patches the entry-based renderSessionEntries flow on Pi 0.80.5+", async () => {
  const tempRoot = createTempRoot("runtime-validation-entries");
  const nodeModulesRoot = join(distRoot, "node_modules");
  const nodeModulesExisted = existsSync(nodeModulesRoot);
  const stubPackageRoot = join(nodeModulesRoot, "@earendil-works", "pi-coding-agent");
  installPiCodingAgentStub(stubPackageRoot);

  try {
    const { InteractiveMode } = await import("@earendil-works/pi-coding-agent");
    const { applyHideMessagesRenderPatch } = await import("../src/render-patch.js");

    resetInteractiveModePrototypeEntries(InteractiveMode as never);

    const firstPatch = await applyHideMessagesRenderPatch();
    assert.deepEqual(firstPatch, { patched: true, alreadyPatched: false });

    // Confirm the current entry-based API was patched (not the legacy context API).
    const prototype = InteractiveMode.prototype as StubInteractiveMode & Record<string, unknown>;
    assert.equal(typeof prototype[originalRenderEntriesKey], "function");
    assert.equal(prototype[originalRenderKey], undefined);

    // Idempotent re-patch.
    assert.deepEqual(await applyHideMessagesRenderPatch(), { patched: false, alreadyPatched: true });

    const messageEntries = buildSessionEntries().filter(
      (entry): entry is SessionTreeEntry => entry.type !== "session",
    );

    // Manual-hide with visibleCount 2 trims the compaction-aware entry list.
    const hideState: RuntimeState = {
      cwd: tempRoot,
      leafId: "control-hide",
      liveEntries: [
        ...messageEntries,
        {
          type: "custom",
          id: "control-hide",
          parentId: "assistant-2",
          timestamp: new Date(1_700_000_030_000).toISOString(),
          customType: HIDE_MESSAGES_CONTROL_CUSTOM_TYPE,
          data: {
            mode: HIDE_MESSAGES_CONTROL_MODE_MANUAL_HIDE,
            visibleCount: 2,
            firstVisibleEntryId: "user-2",
          },
        } as SessionTreeEntry,
      ],
    };
    const hideInstance = createInteractiveModeInstance(
      InteractiveMode as new () => StubInteractiveMode,
      hideState,
    );
    hideInstance.renderSessionEntries?.(messageEntries, { populateHistory: true, updateFooter: true });
    assert.deepEqual(
      hideInstance.lastEntryRender?.entries.map((entry) => entry.id),
      ["user-2", "assistant-2"],
    );
    // Options are forwarded untouched to the original renderer.
    assert.deepEqual(hideInstance.lastEntryRender?.options, {
      populateHistory: true,
      updateFooter: true,
    });

    // Manual-restore keeps every entry visible.
    const restoreState: RuntimeState = {
      cwd: tempRoot,
      leafId: "control-restore",
      liveEntries: [
        ...messageEntries,
        {
          type: "custom",
          id: "control-restore",
          parentId: "assistant-2",
          timestamp: new Date(1_700_000_040_000).toISOString(),
          customType: HIDE_MESSAGES_CONTROL_CUSTOM_TYPE,
          data: { mode: HIDE_MESSAGES_CONTROL_MODE_MANUAL_RESTORE },
        } as SessionTreeEntry,
      ],
    };
    const restoreInstance = createInteractiveModeInstance(
      InteractiveMode as new () => StubInteractiveMode,
      restoreState,
    );
    restoreInstance.renderSessionEntries?.(messageEntries);
    assert.deepEqual(
      restoreInstance.lastEntryRender?.entries.map((entry) => entry.id),
      ["user-1", "assistant-1", "user-2", "assistant-2"],
    );
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
    rmSync(stubPackageRoot, { recursive: true, force: true });
    if (!nodeModulesExisted) {
      rmSync(nodeModulesRoot, { recursive: true, force: true });
    }
  }
});
