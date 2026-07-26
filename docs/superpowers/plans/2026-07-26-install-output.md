# Install Output Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace duplicate no-op install messages with one combined server-and-TUI summary.

**Architecture:** Make `runInstall` return whether a config changed while retaining file-specific output for created and updated files. Let `runCli` aggregate both results and print one summary only when neither changed.

**Tech Stack:** TypeScript, Node.js test runner

## Global Constraints

- Preserve file-specific created and updated messages.
- Print `No changes needed. Server and TUI plugins are already configured.` only when neither config changes.
- Do not create a git commit unless explicitly requested.

---

### Task 1: Aggregate Install No-Op Output

**Files:**
- Modify: `lib/codex-usage-cli.ts:274-326,464-471`
- Modify: `tests/codex-usage-cli.test.ts`

**Interfaces:**
- Change private `runInstall(configPath: string): Promise<void>` to `runInstall(configPath: string): Promise<boolean>` where `true` means the file was created or updated.
- Preserve exported `runCli(argv?: string[]): Promise<void>`.

- [ ] **Step 1: Add a failing CLI integration test**

Create temporary `opencode.jsonc` and `tui.json` files containing the built package path, execute the compiled CLI with `--install --config <temporary opencode.jsonc>`, and assert stdout equals:

```text
No changes needed. Server and TUI plugins are already configured.
```

- [ ] **Step 2: Verify the test fails**

Run the compiled `codex-usage-cli` test file with a name pattern for the new test. Expect two identical no-op lines instead of one summary.

- [ ] **Step 3: Return change state from `runInstall`**

Return `true` after creating or updating a file. Return `false` for an already-configured file without printing from that branch.

- [ ] **Step 4: Print the aggregate no-op in `runCli`**

Capture both `runInstall` return values and print the combined summary only when both are `false`.

- [ ] **Step 5: Verify focused and full tests**

Run the focused CLI tests, then `npm test`, then `git diff --check`.
