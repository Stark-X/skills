---
name: publish-token-costs
description: Publish today's Claude Code + Codex CLI token usage as a grayscale stacked line chart (cost + tokens, hourly 0-23h) to a Zectrix e-ink device, or install a systemd user service/timer for scheduled publishing. Use when asked to "push today's AI costs to the e-ink", "update the Zectrix token usage display", "send daily usage report to e-ink", "install/setup/enable the token cost service", or "set up/schedule/enable the token cost timer". If the user request is ambiguous, ask whether they want an immediate publish, a dry-run preview, or service/timer installation.
---

# Publish Token Costs

Collect hourly Claude Code and Codex CLI usage, render a grayscale stacked line chart, and push it to a Zectrix e-ink panel via `cloud.zectrix.com`. All scripts run on Bun as self-contained TypeScript.

## Prerequisites check

Before running, verify the system has:
- `bun` — `which bun` must resolve (installed at `~/.bun/bin/bun`)
- `convert` (ImageMagick) — `which convert` must resolve; used by `render_chart.ts` for SVG→PNG conversion
- `ZECTRIX_DEVICE_ID` and `ZECTRIX_API_KEY` env vars exported, just check env var exists or not, don't get the value of them

## Workflow

If the user does not clearly choose one mode, ask whether they want:
- immediate publish to the e-ink device
- dry-run preview without touching the device
- systemd service/timer installation for scheduled publishing

1. Ensure `ZECTRIX_DEVICE_ID` and `ZECTRIX_API_KEY` are exported in the shell.
2. Run `scripts/publish.ts` — it collects usage, renders the chart PNG, then posts two pages.
   - **Page 1**: line chart image — two stacked subplots (cost USD / tokens), Claude Code solid, Codex dashed.
   - **Page 2**: plaintext numeric summary — tokens and USD cost per tool, grand total.
4. Verify both `{"code":0,...}` response lines printed to stdout.
5. Use `--dry-run` to preview the chart and payloads locally without touching the device.

## Scheduled publishing

For long-running scheduled publishing, use the bundled user-level systemd timer instead of a long-lived service. The service is `Type=oneshot`; the timer starts it periodically.

Bundled files:
- `systemd/publish-token-costs.service` — oneshot service that runs `scripts/publish.ts`
- `systemd/publish-token-costs.timer` — default five-minute timer
- `systemd/env.example` — example environment file
- `scripts/install_timer.sh` — installs/enables the user timer

When asked to set up the timer:
1. Check `bun`, `convert`, and `systemctl` exist.
2. Ensure `ZECTRIX_DEVICE_ID` and `ZECTRIX_API_KEY` are available either in the shell or in `~/.config/publish-token-costs/env`; never print the API key value.
3. Run the installer:

```bash
publish-token-costs/scripts/install_timer.sh
```

The default schedule publishes every five minutes. Optional schedule override:

```bash
publish-token-costs/scripts/install_timer.sh --on-calendar '*:0/5'
```

Verify status and logs:

```bash
systemctl --user list-timers publish-token-costs.timer
systemctl --user status publish-token-costs.timer
journalctl --user -u publish-token-costs.service -n 100
```

Manual run:

```bash
systemctl --user start publish-token-costs.service
```

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
