import { readFile, rename, stat, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import type { ProbeSnapshot } from "./codex-usage-probe.js";
import { resolveSignalPath } from "./codex-usage-signal.js";

export type QuotaStatusState = "ok" | "warn" | "critical" | "error" | "unknown";

export type ProbeCache = {
  version: 1;
  createdAt: number;
  snapshot: ProbeSnapshot;
  lastBackgroundStatus: QuotaStatusState | undefined;
  lastToastMsByStatus: Record<string, number>;
  sessionModel: string | undefined;
};

const CACHE_VERSION = 1 as const;
const CACHE_STALE_MS = 30_000;
const LOCK_STALE_MS = 10_000;

const signalPath = resolveSignalPath();
const signalDir = path.dirname(signalPath);
const signalBase = path.basename(signalPath);

const cachePath = path.join(signalDir, `${signalBase}.cache`);
const lockPath = path.join(signalDir, `${signalBase}.lock`);

const initToastTimes = (): Record<string, number> => ({
  ok: 0,
  warn: 0,
  critical: 0,
  error: 0,
  unknown: 0,
});

export { cachePath, lockPath };

export const acquireLock = async (timeoutMs = 5_000): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      await writeFile(lockPath, `${process.pid}\n`, { flag: "wx" });
      return true;
    } catch (err: unknown) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code !== "EEXIST") throw err;

      try {
        const content = await readFile(lockPath, "utf8");
        const pid = Number.parseInt(content.trim(), 10);
        if (Number.isFinite(pid)) {
          try {
            process.kill(pid, 0);
          } catch (killErr: unknown) {
            const killNodeErr = killErr as NodeJS.ErrnoException;
            if (killNodeErr.code === "ESRCH") {
              await rm(lockPath, { force: true });
              continue;
            }
          }
        }
      } catch {
        // Lock file may have been released between checks.
      }

      try {
        const lockStat = await stat(lockPath);
        if (Date.now() - lockStat.mtimeMs > LOCK_STALE_MS) {
          await rm(lockPath, { force: true });
          continue;
        }
      } catch {
        // Lock released between checks.
      }

      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return false;
};

export const releaseLock = async (): Promise<void> => {
  await rm(lockPath, { force: true });
};

export const readCache = async (): Promise<ProbeCache | null> => {
  try {
    const raw = await readFile(cachePath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && (parsed as Record<string, unknown>).version === CACHE_VERSION) {
      return parsed as ProbeCache;
    }
    return null;
  } catch {
    return null;
  }
};

export const writeCache = async (
  snapshot: ProbeSnapshot,
  lastBackgroundStatus: QuotaStatusState | undefined,
  lastToastMsByStatus: Record<string, number>,
  sessionModel: string | undefined,
): Promise<void> => {
  const data: ProbeCache = {
    version: CACHE_VERSION,
    createdAt: Date.now(),
    snapshot,
    lastBackgroundStatus,
    lastToastMsByStatus,
    sessionModel,
  };
  const tmpPath = `${cachePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmpPath, JSON.stringify(data), { encoding: "utf8", mode: 0o600 });
  await rename(tmpPath, cachePath);
};

export const isCacheFresh = (cached: ProbeCache, maxAgeMs = CACHE_STALE_MS): boolean => {
  return Date.now() - cached.createdAt < maxAgeMs;
};

export const loadCacheOrInit = (cached: ProbeCache | null): {
  lastBackgroundStatus: QuotaStatusState | undefined;
  lastToastMsByStatus: Record<string, number>;
  sessionModel: string | undefined;
} => {
  if (cached) {
    return {
      lastBackgroundStatus: cached.lastBackgroundStatus,
      lastToastMsByStatus: { ...initToastTimes(), ...cached.lastToastMsByStatus },
      sessionModel: cached.sessionModel,
    };
  }
  return {
    lastBackgroundStatus: undefined,
    lastToastMsByStatus: initToastTimes(),
    sessionModel: undefined,
  };
};

export const makeEmptyToastTimes = initToastTimes;
