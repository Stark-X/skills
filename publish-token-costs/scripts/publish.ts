#!/usr/bin/env bun
/**
 * Orchestrate: collect usage -> POST a plain-text chart to Zectrix e-ink device.
 * Env: ZECTRIX_DEVICE_ID, ZECTRIX_API_KEY
 */

import { join } from "node:path";

const BASE_URL = "https://cloud.zectrix.com/open/v1/devices";
const SCRIPTS = join(import.meta.dir);
const BAR_WIDTH = 22;

interface HourlyBucket {
  hour: number;
  tokens: number;
  cost_usd: number;
}

interface ToolUsage {
  total_tokens: number;
  total_cost_usd: number;
  hourly: HourlyBucket[];
}

interface UsageReport {
  date: string;
  claude_code: ToolUsage;
  codex: ToolUsage;
}

function localDate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function localTime(d = new Date()): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function usage(): never {
  console.error("Usage: publish.ts [--dry-run] [--date YYYY-MM-DD] [--page PAGE_ID]");
  process.exit(2);
}

function parseArgs() {
  const args = process.argv.slice(2);
  let dryRun = false;
  let date = localDate();
  let page = "1";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") {
      dryRun = true;
    } else if (args[i] === "--date" && args[i + 1]) {
      date = args[++i];
    } else if (args[i] === "--page" && args[i + 1]) {
      page = args[++i];
    } else {
      usage();
    }
  }
  return { dryRun, date, page };
}

function requireEnv(name: string): string {
  const val = process.env[name]?.trim();
  if (!val) {
    console.error(`Error: environment variable ${name} is not set.`);
    process.exit(1);
  }
  return val;
}

async function runScript(script: string, args: string[]): Promise<string> {
  const proc = Bun.spawn(["bun", "run", join(SCRIPTS, script), ...args], {
    stdout: "pipe",
    stderr: "inherit",
    cwd: SCRIPTS,
  });
  const text = await new Response(proc.stdout).text();
  const code = await proc.exited;
  if (code !== 0) {
    console.error(`Error: ${script} exited with code ${code}`);
    process.exit(code);
  }
  return text.trim();
}

function trimNumber(value: string): string {
  return value.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${trimNumber((tokens / 1_000_000).toFixed(2))}M`;
  if (tokens >= 1_000) return `${trimNumber((tokens / 1_000).toFixed(1))}k`;
  return String(Math.round(tokens));
}

function formatInteger(tokens: number): string {
  return Math.round(tokens).toLocaleString("en-US");
}

function niceUnit(max: number): number {
  if (max <= 0) return 1;
  const raw = max / BAR_WIDTH;
  if (raw >= 1_000_000) return Math.ceil(raw / 100_000) * 100_000;
  if (raw >= 100_000) return Math.ceil(raw / 10_000) * 10_000;
  if (raw >= 10_000) return Math.ceil(raw / 1_000) * 1_000;
  if (raw >= 1_000) return Math.ceil(raw / 100) * 100;
  return Math.ceil(raw);
}

function formatUnit(unit: number): string {
  return unit >= 1000 ? formatTokens(unit) : String(Math.round(unit));
}

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}h`;
}

function bar(tokens: number, unit: number): string {
  if (tokens <= 0) return ".";
  const len = Math.max(1, Math.min(BAR_WIDTH, Math.round(tokens / unit)));
  return "#".repeat(len);
}

function hourlyAt(tool: ToolUsage, hour: number): HourlyBucket {
  return tool.hourly.find(bucket => bucket.hour === hour) ?? { hour, tokens: 0, cost_usd: 0 };
}

function usageLine(prefix: string, label: string, bucket: HourlyBucket, unit: number): string {
  const graph = bar(bucket.tokens, unit).padEnd(BAR_WIDTH, " ");
  const tokens = formatTokens(bucket.tokens).padStart(7, " ");
  return `${prefix}  ${label.padEnd(6, " ")} ${graph} ${tokens} $${bucket.cost_usd.toFixed(4)}`;
}

function buildHourlyChart(data: UsageReport, now: Date): string {
  const activeHours = Array.from({ length: 24 }, (_, hour) => hour).filter(hour => {
    return hourlyAt(data.claude_code, hour).tokens > 0 || hourlyAt(data.codex, hour).tokens > 0;
  });

  if (activeHours.length === 0) {
    return "Hourly Tokens\nNo token usage yet.";
  }

  const startHour = activeHours[0];
  const lastActiveHour = activeHours[activeHours.length - 1];
  const endHour = data.date === localDate(now) ? Math.max(startHour, now.getHours()) : lastActiveHour;
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);
  const maxTokens = Math.max(
    ...hours.flatMap(hour => [hourlyAt(data.claude_code, hour).tokens, hourlyAt(data.codex, hour).tokens]),
    0,
  );
  const unit = niceUnit(maxTokens);
  const lines = [`Hourly Tokens ${hourLabel(startHour)}-${hourLabel(endHour)}`, `# ~= ${formatUnit(unit)} tokens`, ""];

  for (const hour of hours) {
    const cc = hourlyAt(data.claude_code, hour);
    const cx = hourlyAt(data.codex, hour);
    if (cc.tokens === 0 && cx.tokens === 0) {
      lines.push(`${String(hour).padStart(2, "0")}  .`);
      continue;
    }
    lines.push(usageLine(String(hour).padStart(2, "0"), "Claude", cc, unit));
    lines.push(usageLine("  ", "Codex", cx, unit));
  }

  return lines.join("\n");
}

function formatSummary(data: UsageReport, now = new Date()) {
  const cc = data.claude_code;
  const cx = data.codex;
  const totalCost = cc.total_cost_usd + cx.total_cost_usd;
  const title = `Token Costs · ${data.date} ${localTime(now)}`;
  const body = [
    buildHourlyChart(data, now),
    "",
    "Totals",
    `Claude Code ${formatInteger(cc.total_tokens).padStart(11, " ")} tok $${cc.total_cost_usd.toFixed(4)}`,
    `Codex CLI   ${formatInteger(cx.total_tokens).padStart(11, " ")} tok $${cx.total_cost_usd.toFixed(4)}`,
    `Grand Total             $${totalCost.toFixed(4)}`,
  ].join("\n");
  return { title, body };
}

async function main() {
  const { dryRun, date, page } = parseArgs();

  const deviceId = dryRun ? (process.env.ZECTRIX_DEVICE_ID ?? "DRY-RUN-DEVICE") : requireEnv("ZECTRIX_DEVICE_ID");
  const apiKey = dryRun ? "DRY-RUN-KEY" : requireEnv("ZECTRIX_API_KEY");

  console.log(`[1/2] Collecting usage for ${date}...`);
  const usageJson = await runScript("collect.ts", ["--date", date]);
  const usageData = JSON.parse(usageJson) as UsageReport;

  console.log("[2/2] Preparing structured text payload...");
  const { title, body } = formatSummary(usageData);
  const textUrl = `${BASE_URL}/${deviceId}/display/structured-text`;
  const payload = { title, body, pageId: page };

  if (dryRun) {
    console.log(`\n[DRY RUN] Text -> ${textUrl}`);
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`Publishing text to device ${deviceId} page ${page}...`);
  const txtResp = await fetch(textUrl, {
    method: "POST",
    headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  console.log("Text:", JSON.stringify(await txtResp.json()));
}

main().catch(err => { console.error(String(err)); process.exit(1); });
