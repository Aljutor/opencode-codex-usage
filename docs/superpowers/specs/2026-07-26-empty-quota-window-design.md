# Empty Quota Window Design

## Problem

The quota API can return a secondary lane with no window duration, `0%` usage, and a `0m` reset. The formatter currently renders that incomplete lane with the fallback label `B`, which looks like a real but unexplained quota.

## Behavior

- Omit a lane when its window duration is missing, its usage is zero, and its reset is zero (`0m`).
- Keep lanes with a known duration.
- Keep unknown-duration lanes containing nonzero usage or a meaningful reset so real quota data is not hidden.
- Do not infer `5h` or `7d` when the API omits the duration.

For the observed snapshot, the toast changes from:

```text
7d: 3% used, reset 6d23h | B: 0% used, reset 0m
```

to:

```text
7d: 3% used, reset 6d23h
```

## Scope

Apply the filtering in the shared toast message formatter so server-plugin and TUI command toasts behave identically. Leave probe JSON and pretty CLI output unchanged because they expose raw diagnostic data.

## Testing

Add a formatter regression test for the observed incomplete secondary lane. Retain tests proving that two valid lanes and unknown-but-active lanes are displayed.
