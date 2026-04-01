declare namespace NodeJS {
  interface Process {
    pid: number;
    cwd(): string;
  }
}

declare const process: NodeJS.Process;

declare module "node:fs" {
  export function existsSync(path: string): boolean;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
  export function readFileSync(path: string, encoding: "utf-8"): string;
  export function renameSync(oldPath: string, newPath: string): void;
  export function unlinkSync(path: string): void;
  export function writeFileSync(path: string, content: string, encoding: "utf-8"): void;
}

declare module "node:path" {
  export function basename(path: string): string;
  export function dirname(path: string): string;
  export function join(...parts: string[]): string;
}

declare module "node:url" {
  export function fileURLToPath(url: unknown): string;
}

declare module "node:assert/strict" {
  const assert: {
    equal(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
    ok(value: unknown, message?: string): void;
  };

  export default assert;
}

declare module "node:test" {
  const test: (name: string, fn: () => void | Promise<void>) => void;
  export default test;
}

declare module "@mariozechner/pi-coding-agent" {
  export interface SessionManagerLike {
    getEntries(): unknown[];
    getSessionFile(): string | undefined;
    getLeafId?(): string | null | undefined;
  }

  export interface ExtensionContext {
    hasUI: boolean;
    cwd: string;
    sessionManager: SessionManagerLike;
    ui: {
      notify(message: string, level?: "info" | "warning" | "error"): void;
    };
  }

  export interface ExtensionCommandContext extends ExtensionContext {
    reload(): Promise<void>;
  }

  export class InteractiveMode {}

  export interface ExtensionAPI {
    on(
      eventName: string,
      handler: (event: Record<string, unknown>, ctx: ExtensionContext) => void | Promise<void>,
    ): void;

    appendEntry<T = unknown>(customType: string, data?: T): void;

    registerCommand(
      name: string,
      definition: {
        description: string;
        handler: (args: string, ctx: ExtensionCommandContext) => void | Promise<void>;
      },
    ): void;
  }
}
