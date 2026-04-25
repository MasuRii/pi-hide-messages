import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

export async function queueRuntimeReload(
  ctx: Pick<ExtensionCommandContext, "ui" | "reload">,
  sourceCommand: string,
): Promise<boolean> {
  try {
    await ctx.reload();
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.ui.notify(`${sourceCommand}: automatic runtime reload failed: ${message}. Run /reload.`, "error");
    return false;
  }
}
