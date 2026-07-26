# Install Output Design

## Problem

`--install` checks both `opencode.jsonc` and `tui.json`. When both are already configured, each check prints the same pathless no-op message, making the output look accidentally duplicated.

## Behavior

- Do not print a separate no-op from each config-file check.
- When neither file changes, print one summary: `No changes needed. Server and TUI plugins are already configured.`
- Preserve existing file-specific created and updated messages.
- For a partial install, print only the file-specific message for the file that changed.

## Testing

Run the real CLI against two temporary, preconfigured files and assert that stdout contains exactly the single summary line.
