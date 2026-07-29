import type { TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui";
import { createMemo, createSignal, Show } from "solid-js";
import type { ProbeSnapshot } from "./lib/codex-usage-probe.js";
import { statusStateNormalized, isSupportedProbeModel } from "./lib/codex-usage-toast-plugin.js";
import { readCache } from "./lib/codex-usage-cache.js";
import { writeFile } from "node:fs/promises";
import { resolveSignalPath } from "./lib/codex-usage-signal.js";

const CACHE_POLL_MS = 5_000;

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
        <b>Codex Quota</b>
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

const loadFromCache = async (): Promise<{
  snapshot: ProbeSnapshot | undefined;
  sessionModel: string | undefined;
}> => {
  const cached = await readCache();
  return { snapshot: cached?.snapshot ?? undefined, sessionModel: cached?.sessionModel ?? undefined };
};

const triggerRefresh = async (): Promise<void> => {
  const signalPath = resolveSignalPath();
  await writeFile(signalPath, `${Date.now()}\n`, { flag: "w" });
};

export const CodexQuotaTuiPlugin: TuiPlugin = async (api) => {
  const [snapshot, setSnapshot] = createSignal<ProbeSnapshot | undefined>(undefined);
  const [showPanel, setShowPanel] = createSignal(false);
  const [busy, setBusy] = createSignal(false);

  let cacheTimer: ReturnType<typeof setInterval> | undefined;

  const pollCache = (): void => {
    loadFromCache().then(({ snapshot: next, sessionModel }) => {
      if (next) setSnapshot(next);
      setShowPanel(isSupportedProbeModel(sessionModel));
    }).catch(() => {
      // Cache read failure is non-fatal.
    });
  };

  api.slots.register({
    order: 150,
    slots: {
      sidebar_content: () => (showPanel() ? <QuotaPanel api={api} snapshot={snapshot} busy={busy} /> : undefined),
    },
  });

  const disposeCommand = api.command?.register(() => [
    {
      title: "Codex usage",
      value: "codex-usage",
      description: "Refresh Codex Quota",
      category: "Codex",
      slash: { name: "codex-usage" },
      onSelect: () => {
        setBusy(true);
        triggerRefresh().then(pollCache).catch(() => {}).finally(() => setBusy(false));
      },
    },
  ]);

  loadFromCache().then(({ snapshot: next, sessionModel }) => {
    if (next) setSnapshot(next);
    setShowPanel(isSupportedProbeModel(sessionModel));
    setBusy(false);
  }).catch(() => {});

  cacheTimer = setInterval(pollCache, CACHE_POLL_MS);

  api.lifecycle.onDispose(() => {
    if (cacheTimer) clearInterval(cacheTimer);
    disposeCommand?.();
  });
};

export default { id: "opencode-codex-usage", tui: CodexQuotaTuiPlugin };
