#!/usr/bin/env bun
/**
 * Collect today's Claude Code + Codex CLI token usage.
 * Outputs JSON: daily totals (from ccusage) + hourly token/cost bins (from raw JSONL).
 */

import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CLAUDE_PROJECTS_DIR = join(homedir(), ".claude", "projects");
const CODEX_SESSIONS_DIR  = join(homedir(), ".codex", "sessions");
const BUNX = join(homedir(), ".bun", "bin", "bunx");

interface HourlyBucket { hour: number; tokens: number; cost_usd: number }
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

function parseArgs(): { date: string; pretty: boolean } {
  const args = process.argv.slice(2);
  const now = new Date();
  let date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  let pretty = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--date" && args[i + 1]) date = args[++i];
    if (args[i] === "--pretty") pretty = true;
  }
  return { date, pretty };
}

async function runCcusageClaude(dateStr: string): Promise<{ total_tokens: number; total_cost_usd: number }> {
  const yyyymmdd = dateStr.replace(/-/g, "");
  const proc = Bun.spawn([BUNX, "ccusage@latest", "daily", "--since", yyyymmdd, "--until", yyyymmdd, "--json"], {
    stdout: "pipe", stderr: "pipe",
  });
  const text = await new Response(proc.stdout).text();
  await proc.exited;
  try {
    const data = JSON.parse(text);
    const t = data.totals ?? {};
    return { total_tokens: t.totalTokens ?? 0, total_cost_usd: t.totalCost ?? 0 };
  } catch {
    return { total_tokens: 0, total_cost_usd: 0 };
  }
}

async function runCcusageCodex(dateStr: string): Promise<{ total_tokens: number; total_cost_usd: number }> {
  const proc = Bun.spawn([BUNX, "@ccusage/codex@latest", "daily", "--since", dateStr, "--until", dateStr, "--json"], {
    stdout: "pipe", stderr: "pipe",
  });
  const text = await new Response(proc.stdout).text();
  await proc.exited;
  try {
    const data = JSON.parse(text);
    const t = data.totals ?? {};
    return { total_tokens: t.totalTokens ?? 0, total_cost_usd: t.costUSD ?? 0 };
  } catch {
    return { total_tokens: 0, total_cost_usd: 0 };
  }
}

function localHour(isoTimestamp: string): number {
  return new Date(isoTimestamp).getHours();
}

function targetDateStr(isoTimestamp: string, dateStr: string): boolean {
  const d = new Date(isoTimestamp);
  const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return local === dateStr;
}

function shiftDateStr(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(year, month - 1, day + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function codexSessionDirsForDate(dateStr: string): string[] {
  const dirs = new Set<string>();
  for (const candidate of [shiftDateStr(dateStr, -1), dateStr, shiftDateStr(dateStr, 1)]) {
    const [year, month, day] = candidate.split("-");
    dirs.add(join(CODEX_SESSIONS_DIR, year, month, day));
  }
  return [...dirs];
}

async function collectClaudeHourly(dateStr: string): Promise<number[]> {
  const hourly = new Array<number>(24).fill(0);
  if (!existsSync(CLAUDE_PROJECTS_DIR)) return hourly;
  const projectDirs = await readdir(CLAUDE_PROJECTS_DIR).catch(() => [] as string[]);
  for (const proj of projectDirs) {
    const projPath = join(CLAUDE_PROJECTS_DIR, proj);
    const files = await readdir(projPath).catch(() => [] as string[]);
    for (const file of files) {
      if (!file.endsWith(".jsonl")) continue;
      const text = await readFile(join(projPath, file), "utf-8").catch(() => "");
      for (const line of text.split("\n")) {
        const l = line.trim();
        if (!l) continue;
        let obj: Record<string, unknown>;
        try { obj = JSON.parse(l); } catch { continue; }
        const ts = obj.timestamp as string | undefined;
        if (!ts || !targetDateStr(ts, dateStr)) continue;
        const msg = obj.message as Record<string, unknown> | undefined;
        const usage = msg?.usage as Record<string, number> | undefined;
        if (!usage) continue;
        // Use output+cache_creation as hourly activity proxy to avoid
        // double-counting cache_read_tokens (context reused across turns).
        const tokens =
          (usage.output_tokens ?? 0) +
          (usage.cache_creation_input_tokens ?? 0);
        hourly[localHour(ts)] += tokens;
      }
    }
  }
  return hourly;
}

async function collectCodexHourly(dateStr: string): Promise<number[]> {
  const hourly = new Array<number>(24).fill(0);
  for (const dayDir of codexSessionDirsForDate(dateStr)) {
    if (!existsSync(dayDir)) continue;
    const files = await readdir(dayDir).catch(() => [] as string[]);
    for (const file of files) {
      if (!file.startsWith("rollout-") || !file.endsWith(".jsonl")) continue;
      const text = await readFile(join(dayDir, file), "utf-8").catch(() => "");
      for (const line of text.split("\n")) {
        const l = line.trim();
        if (!l) continue;
        let obj: Record<string, unknown>;
        try { obj = JSON.parse(l); } catch { continue; }
        // Codex wraps token_count inside a payload envelope: {type:"event_msg", payload:{type:"token_count",...}}
        const payload = obj.payload as Record<string, unknown> | undefined;
        if (payload?.type !== "token_count") continue;
        const ts = obj.timestamp as string | undefined;
        if (!ts || !targetDateStr(ts, dateStr)) continue;
        const info = payload.info as Record<string, unknown> | undefined;
        // last_token_usage is per-request (not cumulative) — correct for hourly binning
        const last = info?.last_token_usage as Record<string, number> | undefined;
        const tokens = last?.total_tokens ?? 0;
        hourly[localHour(ts)] += tokens;
      }
    }
  }
  return hourly;
}

// Distribute daily cost proportionally by hourly activity proxy (shape only).
function scaleCost(hourlyTokens: number[], _totalTokens: number, totalCost: number): number[] {
  const sum = hourlyTokens.reduce((a, b) => a + b, 0);
  if (sum === 0) return new Array<number>(24).fill(0);
  return hourlyTokens.map(t => Math.round((t / sum) * totalCost * 1e6) / 1e6);
}

async function main() {
  const { date: dateStr, pretty } = parseArgs();

  const [claudeTotals, codexTotals, ccHourly, cxHourly] = await Promise.all([
    runCcusageClaude(dateStr),
    runCcusageCodex(dateStr),
    collectClaudeHourly(dateStr),
    collectCodexHourly(dateStr),
  ]);

  const ccCost = scaleCost(ccHourly, claudeTotals.total_tokens, claudeTotals.total_cost_usd);
  const cxCost = scaleCost(cxHourly, codexTotals.total_tokens, codexTotals.total_cost_usd);

  const report: UsageReport = {
    date: dateStr,
    claude_code: {
      total_tokens: claudeTotals.total_tokens,
      total_cost_usd: claudeTotals.total_cost_usd,
      hourly: Array.from({ length: 24 }, (_, h) => ({ hour: h, tokens: ccHourly[h], cost_usd: ccCost[h] })),
    },
    codex: {
      total_tokens: codexTotals.total_tokens,
      total_cost_usd: codexTotals.total_cost_usd,
      hourly: Array.from({ length: 24 }, (_, h) => ({ hour: h, tokens: cxHourly[h], cost_usd: cxCost[h] })),
    },
  };

  console.log(pretty ? JSON.stringify(report, null, 2) : JSON.stringify(report));
}

main().catch(err => { console.error(String(err)); process.exit(1); });
