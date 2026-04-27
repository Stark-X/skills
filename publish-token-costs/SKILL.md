---
name: publish-token-costs
description: Publish today's Claude Code + Codex CLI token usage as a 400x300 grayscale PNG chart to a Zectrix e-ink device, or install a systemd user service/timer for scheduled publishing. Use when asked to "push today's AI costs to the e-ink", "update the Zectrix token usage display", "send daily usage report to e-ink", "install/setup/enable the token cost service", or "set up/schedule/enable the token cost timer". If the user request is ambiguous, ask whether they want an immediate publish, a dry-run preview, or systemd service/timer installation.
---

# Publish Token Costs

Collect hourly Claude Code and Codex CLI usage, render a 400x300 grayscale PNG chart, and push it to a Zectrix e-ink panel via `cloud.zectrix.com`. All scripts run on Bun as self-contained TypeScript.

## Prerequisites check

Before running, verify the system has:
- `bun` — `which bun` must resolve (installed at `~/.bun/bin/bun`)
- `convert` (ImageMagick) — `which convert` must resolve; used by `render_token_costs_card.ts` for SVG→PNG conversion
- `ZECTRIX_DEVICE_ID` and `ZECTRIX_API_KEY` env vars exported, just check env var exists or not, don't get the value of them
- Optional `TOKEN_COSTS_FONT`; default is `/usr/share/fonts/truetype/MapleMono-NF-CN-unhinted/MapleMono-NF-CN-Regular.ttf`

## Workflow

If the user does not clearly choose one mode, ask whether they want:
- immediate publish to the e-ink device
- dry-run preview without touching the device
- systemd service/timer installation for scheduled publishing

1. Ensure `ZECTRIX_DEVICE_ID` and `ZECTRIX_API_KEY` are exported in the shell.
2. Run `scripts/publish.ts` — it keeps the skill workflow simple: collect usage, call the render CLI, then call the Zectrix publisher module to post one image page.
   - Default page: **Page 1**.
   - Image: 400x300 grayscale PNG with title, date/time, totals, hourly token bars, legend, and scale.
3. Verify the `Image: {"code":0,...}` response line printed to stdout.
4. Use `--dry-run` to render the local PNG and preview upload fields without touching the device.

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

### `scripts/publish.ts`
Orchestrate the skill workflow: collect → render PNG chart → POST image. Keep generic capabilities in `scripts/modules/`, and keep token-cost-specific rendering in `scripts/token-costs/`.

```bash
bun run /abs/path/to/publish-token-costs/scripts/publish.ts
bun run /abs/path/to/publish-token-costs/scripts/publish.ts --dry-run
bun run /abs/path/to/publish-token-costs/scripts/publish.ts --date 2026-04-24
bun run /abs/path/to/publish-token-costs/scripts/publish.ts --page 2
```

### `scripts/render_token_costs_card.ts`
Simple render CLI: read collect JSON from stdin or `--input`, write a 400x300 SVG and optional PNG.

```bash
bun run /abs/path/to/publish-token-costs/scripts/render_token_costs_card.ts --demo --png /tmp/token-costs-demo.png
bun run /abs/path/to/publish-token-costs/scripts/collect.ts | \
  bun run /abs/path/to/publish-token-costs/scripts/render_token_costs_card.ts --png /tmp/token-costs.png
```

### `scripts/modules/`
Git submodule pointing at the generic libraries repository. Purpose-separated modules:
- `bun/image-handling/svg_to_png.ts` — ImageMagick-backed SVG → PNG conversion for Bun/Node scripts
- `bun/zectrix/zectrix.ts` — Zectrix image upload client for Bun/Node scripts
- `uv/` — Python/uv generic library location

### `scripts/token-costs/`
Business-specific modules for this skill:
- `token_costs_card.ts` — usage report → token-cost card data → SVG rendering

## Environment

| Variable | Required | Description |
|---|---|---|
| `ZECTRIX_DEVICE_ID` | Yes | Device MAC address (e.g. `11:22:33:EE:DD:FF`) |
| `ZECTRIX_API_KEY` | Yes | API key passed as `X-API-Key` header |
| `TOKEN_COSTS_FONT` | No | Font file used for chart rendering |

## Safety

Never print, log, or echo the value of `ZECTRIX_API_KEY` in responses, terminal output, or issue comments.
