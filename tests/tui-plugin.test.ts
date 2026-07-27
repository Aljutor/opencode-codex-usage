import assert from "node:assert/strict";
import test from "node:test";
import TuiPluginModule from "../tui.js";
import { CodexQuotaTuiPlugin } from "../tui.js";

test("tui path plugin exports a stable id", () => {
  assert.equal((TuiPluginModule as Record<string, unknown>).id, "opencode-codex-usage");
});

type RegisteredCommand = {
  title: string;
  value: string;
  description: string;
  category: string;
  slash: { name: string };
  onSelect: () => void;
};

test("tui plugin registers codex usage as a slash command", async () => {
  let commands: RegisteredCommand[] = [];
  let slotOrder = 0;
  const disposers: Array<() => void> = [];
  const api = {
    command: {
      register: (callback: () => RegisteredCommand[]) => {
        commands = callback();
        const dispose = () => undefined;
        disposers.push(dispose);
        return dispose;
      },
    },
    ui: {
      toast: () => undefined,
    },
    slots: {
      register: (plugin: { order: number }) => {
        slotOrder = plugin.order;
        return "slot";
      },
    },
    theme: { current: {} },
    lifecycle: {
      onDispose: (dispose: () => void) => {
        disposers.push(dispose);
        return () => undefined;
      },
    },
  } as any;

  await CodexQuotaTuiPlugin(api, undefined, undefined as any);
  disposers.forEach((dispose) => dispose());

  assert.equal(slotOrder, 150);

  assert.deepEqual(commands, [
    {
      title: "Codex usage",
      value: "codex-usage",
      description: "Refresh Codex quota",
      category: "Codex",
      slash: { name: "codex-usage" },
      onSelect: commands[0]?.onSelect,
    },
  ]);
  assert.equal(typeof commands[0]?.onSelect, "function");
});
