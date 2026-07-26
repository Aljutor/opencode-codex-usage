# Empty Quota Window Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent an empty, duration-less quota lane from appearing as an unexplained `B` limit in quota toasts.

**Architecture:** Filter display segments inside the shared `messageFromParsed` formatter after parsing each lane's duration, usage, and reset values. Preserve the probe snapshot and CLI diagnostic formats; both server and TUI toasts already consume this shared formatter.

**Tech Stack:** TypeScript, Node.js test runner, Zod-based existing data parsing

## Global Constraints

- Omit a lane only when its duration is missing, usage is zero, and reset is exactly `0m`.
- Preserve known-duration lanes and unknown-duration lanes containing meaningful data.
- Do not infer a missing window duration.
- Do not create a git commit unless the user explicitly requests one.

---

### Task 1: Filter Empty Toast Lanes

**Files:**
- Modify: `tests/toast-message.test.ts`
- Modify: `lib/codex-usage-toast-plugin.ts:319-360`

**Interfaces:**
- Consumes: `ProbeSnapshot` fields `windowMinutes`, `used`, and `reset`
- Produces: unchanged `messageFromParsed(parsed: ProbeSnapshot): string` interface

- [ ] **Step 1: Write the failing regression test**

Add this test to `tests/toast-message.test.ts` after the compact-window-summary test:

```ts
test("omits an empty secondary lane without a window duration", () => {
  const message = messageFromParsed({
    status: "ok",
    used: { primary: 3, secondary: 0 },
    reset: { primary: "6d23h", secondary: "0m" },
    windowMinutes: { primary: 10080, secondary: null },
  });

  assert.equal(message, "⏳ 7d: 3% used, reset 6d23h");
});
```

The existing test `falls back to neutral labels when window minutes are missing` remains unchanged and verifies that unknown-duration lanes with meaningful values are retained.

- [ ] **Step 2: Run the focused test file and verify failure**

Run:

```bash
npm run clean && tsc -p tsconfig.test.json && node --test --test-name-pattern="omits an empty secondary lane" dist/tests/toast-message.test.js
```

Expected: FAIL because the actual message still contains `| B: 0% used, reset 0m`.

- [ ] **Step 3: Implement minimal segment filtering**

In `messageFromParsed`, replace the unconditional `compact` construction with lane objects and filter only the empty unknown lane:

```ts
  const windows = [
    {
      minutes: windowA,
      label: firstWindowLabel,
      used: usedWindowA,
      reset: resetWindowA,
    },
    {
      minutes: windowB,
      label: secondWindowLabel,
      used: usedWindowB,
      reset: resetWindowB,
    },
  ];
  const compact = windows
    .filter(
      ({ minutes, used, reset }) =>
        minutes !== undefined || Number.parseFloat(used) !== 0 || reset !== "0m",
    )
    .map(({ label, used, reset }) => `${label}: ${usageText(used)} used, reset ${reset}`)
    .join(" | ");
  return `⏳ ${compact}`;
```

This retains missing-value placeholders because `Number.parseFloat("-")` is `NaN` and `reset` is `-`, while suppressing the observed lane where all three empty-lane conditions hold.

- [ ] **Step 4: Run focused formatter tests**

Run:

```bash
npm run clean && tsc -p tsconfig.test.json && node --test dist/tests/toast-message.test.js
```

Expected: all toast-message tests PASS, including the existing two-lane and unknown-active-lane cases.

- [ ] **Step 5: Run full verification**

Run:

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 6: Inspect the final diff**

Run:

```bash
git diff --check && git diff -- lib/codex-usage-toast-plugin.ts tests/toast-message.test.ts
```

Expected: no whitespace errors; the diff contains only the regression test and shared formatter filtering.
