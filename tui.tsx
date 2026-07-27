import type { TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui";
import { createMemo, createSignal, Show } from "solid-js";
import { probeQuota } from "./lib/codex-usage-probe.js";
import type { ProbeSnapshot } from "./lib/codex-usage-probe.js";
import {
  resolvePollMs,
  resolveToastDurationMs,
  resolveToastThreshold,
  statusStateNormalized,
  shouldToastForBackground,
  shouldToastForBackgroundTransition,
  toastBodyFromParsed,
} from "./lib/codex-usage-toast-plugin.js";

const percent = (value: number | null | undefined): string =>
  Number.isFinite(value) ? `${Math.round(value as number)}%` : "-";

const pair = <T,>(value: { primary?: T | null; secondary?: T | null } | string | undefined) => {
  if (typeof value !== "object" || value === null) return { primary: null, secondary: null };
  return { primary: value.primary ?? null, secondary: value.secondary ?? null };
};

const windowLabel = (minutes: number | null, fallback: string): string => {
  if (!minutes || minutes <= 0) return fallback;
  if (minutes % 1440 === 0) return `${minutes / 1440}d window`;
  if (minutes % 60 === 0) return `${minutes / 60}h window`;
  return `${minutes}m window`;
};

function QuotaPanel(props: {
  snapshot: () => ProbeSnapshot | undefined;
  busy: () => boolean;
  api: TuiPluginApi;
}) {
  const theme = () => props.api.theme.current;
  const snapshot = () => props.snapshot();
  const used = createMemo(() => pair<number>(snapshot()?.used));
  const reset = createMemo(() => pair<string>(snapshot()?.reset));
  const windows = createMemo(() => pair<number>(snapshot()?.windowMinutes));
  const status = createMemo(() => statusStateNormalized(snapshot()?.status));
  const secondaryActive = createMemo(() => {
    const resetValue = reset().secondary;
    return (
      (windows().secondary ?? 0) > 0 ||
      (used().secondary ?? 0) > 0 ||
      (resetValue !== null && resetValue !== "" && resetValue !== "0m" && resetValue !== "-")
    );
  });

  return (
    <box>
      <text fg={theme().text}>
        <b>Codex quota</b>
      </text>
      <Show
        when={props.busy() && !snapshot()}
        fallback={
          <Show when={snapshot()} fallback={<text fg={theme().textMuted}>No quota data</text>}>
            <text fg={theme().textMuted}>
              {windowLabel(windows().primary, "5h window")}: {percent(used().primary)} used, reset{" "}
              {reset().primary ?? "-"}
            </text>
            <Show when={secondaryActive()}>
              <text fg={theme().textMuted}>
                {windowLabel(windows().secondary, "7d window")}: {percent(used().secondary)} used,
                reset {reset().secondary ?? "-"}
              </text>
            </Show>
            <text
              fg={
                status() === "ok"
                  ? theme().success
                  : status() === "warn"
                    ? theme().warning
                    : theme().error
              }
            >
              {status().toUpperCase()}
              {snapshot()?.plan ? ` · ${snapshot()?.plan}` : ""}
            </text>
          </Show>
        }
      >
        <text fg={theme().textMuted}>Checking quota...</text>
      </Show>
      <Show when={snapshot()?.error}>
        <text fg={theme().error}>{snapshot()?.error}</text>
      </Show>
    </box>
  );
}

export const CodexQuotaTuiPlugin: TuiPlugin = async (api) => {
  const [snapshot, setSnapshot] = createSignal<ProbeSnapshot>();
  const [busy, setBusy] = createSignal(false);
  const pollMs = resolvePollMs();
  const toastDurationMs = resolveToastDurationMs();
  const threshold = resolveToastThreshold();
  let previousStatus: string | undefined;
  let running = false;

  const runProbe = async (manual = false): Promise<void> => {
    if (running) return;
    running = true;
    setBusy(true);
    try {
      const next = await probeQuota();
      setSnapshot(next);
      const state = statusStateNormalized(next.status);
      const shouldToast =
        manual ||
        (shouldToastForBackground(next.status, threshold) &&
          shouldToastForBackgroundTransition(state, previousStatus));
      previousStatus = state;
      if (shouldToast)
        api.ui.toast(
          next.error
            ? {
                title: "Codex quota",
                message: `Quota error | ${next.error}`,
                variant: "error",
                duration: toastDurationMs,
              }
            : toastBodyFromParsed(next, toastDurationMs),
        );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const next = { status: "error", error: detail } satisfies ProbeSnapshot;
      setSnapshot(next);
      if (manual)
        api.ui.toast({
          title: "Codex quota",
          message: `Quota error | ${detail}`,
          variant: "error",
          duration: toastDurationMs,
        });
    } finally {
      running = false;
      setBusy(false);
    }
  };

  api.slots.register({
    order: 150,
    slots: { sidebar_content: () => <QuotaPanel api={api} snapshot={snapshot} busy={busy} /> },
  });

  const disposeCommand = api.command?.register(() => [
    {
      title: "Codex usage",
      value: "codex-usage",
      description: "Refresh Codex quota",
      category: "Codex",
      slash: { name: "codex-usage" },
      onSelect: () => void runProbe(true),
    },
  ]);
  const timer = setInterval(() => void runProbe(), pollMs);
  void runProbe();

  api.lifecycle.onDispose(() => {
    clearInterval(timer);
    disposeCommand?.();
  });
};

export default { id: "opencode-codex-usage", tui: CodexQuotaTuiPlugin };
