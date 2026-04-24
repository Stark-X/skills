---
name: publish-token-costs
description: Publish today's Claude Code + Codex CLI token usage as a grayscale stacked line chart (cost + tokens, hourly 0-23h) to a Zectrix e-ink device. Use when asked to "push today's AI costs to the e-ink", "update the Zectrix token usage display", or "send daily usage report to e-ink".
---

# Publish Token Costs

Collect hourly Claude Code and Codex CLI usage, render a grayscale stacked line chart, and push it to a Zectrix e-ink panel via `cloud.zectrix.com`. All scripts run on Bun as self-contained TypeScript.

## Prerequisites check

Before running, verify the system has:
- `bun` — `which bun` must resolve (installed at `~/.bun/bin/bun`)
- `convert` (ImageMagick) — `which convert` must resolve; used by `render_chart.ts` for SVG→PNG conversion
- `ZECTRIX_DEVICE_ID` and `ZECTRIX_API_KEY` env vars exported

## Workflow

1. Ensure `ZECTRIX_DEVICE_ID` and `ZECTRIX_API_KEY` are exported in the shell.
2. Run `scripts/publish.ts` — it collects usage, renders the chart PNG, then posts two pages.
   - **Page 1**: line chart image — two stacked subplots (cost USD / tokens), Claude Code solid, Codex dashed.
   - **Page 2**: plaintext numeric summary — tokens and USD cost per tool, grand total.
4. Verify both `{"code":0,...}` response lines printed to stdout.
5. Use `--dry-run` to preview the chart and payloads locally without touching the device.

## Scripts

### `scripts/collect.ts`
Print today's usage JSON: ccusage daily totals + raw-JSONL hourly bins for both tools.

```bash
bun run /abs/path/to/publish-token-costs/scripts/collect.ts --pretty
bun run /abs/path/to/publish-token-costs/scripts/collect.ts --date 2026-04-24 --pretty
```

### `scripts/render_chart.ts`
Read collect JSON from stdin, write a grayscale 800×480 PNG.

```bash
bun run /abs/path/to/publish-token-costs/scripts/collect.ts | \
  bun run /abs/path/to/publish-token-costs/scripts/render_chart.ts --output /tmp/chart.png
```

### `scripts/publish.ts`
Orchestrate: collect → render → POST image to page 1, POST text summary to page 2.

```bash
bun run /abs/path/to/publish-token-costs/scripts/publish.ts
bun run /abs/path/to/publish-token-costs/scripts/publish.ts --dry-run
bun run /abs/path/to/publish-token-costs/scripts/publish.ts --date 2026-04-24
```

## Environment

| Variable | Required | Description |
|---|---|---|
| `ZECTRIX_DEVICE_ID` | Yes | Device MAC address (e.g. `11:22:33:EE:DD:FF`) |
| `ZECTRIX_API_KEY` | Yes | API key passed as `X-API-Key` header |

## Safety

Never print, log, or echo the value of `ZECTRIX_API_KEY` in responses, terminal output, or issue comments.
