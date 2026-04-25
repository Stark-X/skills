#!/usr/bin/env bun

import { basename } from "node:path";

const W = 400;
const H = 300;
const DEFAULT_FONT = "/usr/share/fonts/truetype/MapleMono-NF-CN-unhinted/MapleMono-NF-CN-Regular.ttf";

interface HourPoint {
  hour: number;
  codexTokens: number;
  codexCost: number;
  claudeTokens: number;
  claudeCost: number;
}

interface CardData {
  date: string;
  time: string;
  hours: HourPoint[];
}

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

function parseArgs() {
  const args = process.argv.slice(2);
  let input = "-";
  let output = "/tmp/token-costs-card.svg";
  let png: string | null = null;
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--input" || args[i] === "-i") && args[i + 1]) input = args[++i];
    else if ((args[i] === "--output" || args[i] === "-o") && args[i + 1]) output = args[++i];
    else if (args[i] === "--png" && args[i + 1]) png = args[++i];
    else if (args[i] === "--demo") input = "demo";
    else {
      console.error("Usage: render_token_costs_card.ts [--input report.json|--demo] [--output card.svg] [--png card.png]");
      process.exit(2);
    }
  }
  return { input, output, png };
}

function localDateTime(d = new Date()) {
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return { date, time };
}

function demoData(): CardData {
  const { date, time } = localDateTime();
  return {
    date,
    time,
    hours: [
      { hour: 9, codexTokens: 137_500, codexCost: 0.18, claudeTokens: 153_700, claudeCost: 0.34 },
      { hour: 10, codexTokens: 2_380_000, codexCost: 2.31, claudeTokens: 0, claudeCost: 0 },
      { hour: 11, codexTokens: 6_000_000, codexCost: 5.65, claudeTokens: 11_700, claudeCost: 0.03 },
      { hour: 12, codexTokens: 12_390_000, codexCost: 10.1, claudeTokens: 0, claudeCost: 0 },
      { hour: 13, codexTokens: 3_250_000, codexCost: 2.8, claudeTokens: 0, claudeCost: 0 },
    ],
  };
}

async function readStdin(): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Uint8Array);
  return Buffer.concat(chunks).toString("utf-8");
}

async function loadData(input: string): Promise<CardData> {
  if (input === "demo") return demoData();
  const raw = input === "-" ? await readStdin() : await Bun.file(input).text();
  const report = JSON.parse(raw) as UsageReport;
  return usageToCardData(report, new Date());
}

function usageToCardData(report: UsageReport, now: Date): CardData {
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const activeHours = Array.from({ length: 24 }, (_, hour) => hour).filter(hour => {
    return hourlyAt(report.codex, hour).tokens > 0 || hourlyAt(report.claude_code, hour).tokens > 0;
  });

  if (activeHours.length === 0) {
    return { date: report.date, time, hours: [] };
  }

  const today = localDateTime(now).date;
  const startHour = activeHours[0];
  const lastActiveHour = activeHours[activeHours.length - 1];
  const endHour = report.date === today ? Math.max(startHour, now.getHours()) : lastActiveHour;
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i).map(hour => {
    const cx = hourlyAt(report.codex, hour);
    const cc = hourlyAt(report.claude_code, hour);
    return {
      hour,
      codexTokens: cx.tokens,
      codexCost: cx.cost_usd,
      claudeTokens: cc.tokens,
      claudeCost: cc.cost_usd,
    };
  });
  return { date: report.date, time, hours };
}

function hourlyAt(tool: ToolUsage, hour: number): HourlyBucket {
  return tool.hourly.find(bucket => bucket.hour === hour) ?? { hour, tokens: 0, cost_usd: 0 };
}

function esc(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${trim((n / 1_000_000).toFixed(1))}M`;
  if (n >= 1_000) return `${trim((n / 1_000).toFixed(0))}k`;
  return String(Math.round(n));
}

function trim(s: string): string {
  return s.replace(/\.0$/, "");
}

function text(x: number, y: number, content: string, size = 12, attrs = ""): string {
  return `<text x="${x}" y="${y}" font-size="${size}" ${attrs}>${esc(content)}</text>`;
}

function bar(x: number, y: number, w: number, h: number, value: number, max: number, fill: string): string {
  const bw = max <= 0 ? 0 : Math.max(value > 0 ? 1 : 0, Math.round((value / max) * w));
  return [
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="white" stroke="#111" stroke-width="1"/>`,
    bw > 0 ? `<rect x="${x}" y="${y}" width="${bw}" height="${h}" fill="${fill}"/>` : "",
  ].join("");
}

function render(data: CardData): string {
  const fontPath = process.env.TOKEN_COSTS_FONT || DEFAULT_FONT;
  const fontName = basename(fontPath).replace(/\.[^.]+$/, "");
  const totalCodexTokens = data.hours.reduce((sum, h) => sum + h.codexTokens, 0);
  const totalClaudeTokens = data.hours.reduce((sum, h) => sum + h.claudeTokens, 0);
  const totalCodexCost = data.hours.reduce((sum, h) => sum + h.codexCost, 0);
  const totalClaudeCost = data.hours.reduce((sum, h) => sum + h.claudeCost, 0);
  const maxTokens = Math.max(...data.hours.flatMap(h => [h.codexTokens, h.claudeTokens]), 1);
  const rowsToShow = data.hours.slice(-5);

  const rows = rowsToShow.map((h, i) => {
    const y = 94 + i * 28;
    return [
      text(20, y + 14, `${String(h.hour).padStart(2, "0")}:00`, 13),
      bar(70, y, 130, 11, h.codexTokens, maxTokens, "#111"),
      bar(70, y + 14, 130, 8, h.claudeTokens, maxTokens, "#777"),
      text(212, y + 10, fmtTokens(h.codexTokens), 11),
      text(212, y + 23, fmtTokens(h.claudeTokens), 10, `fill="#666"`),
      text(290, y + 14, `$${(h.codexCost + h.claudeCost).toFixed(2)}`, 12),
    ].join("\n");
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <style>
    @font-face { font-family: '${fontName}'; src: url('file://${fontPath}') format('truetype'); }
    text { font-family: '${fontName}', monospace; fill: #111; dominant-baseline: alphabetic; }
  </style>
</defs>
<rect width="${W}" height="${H}" fill="white"/>
<rect x="0" y="0" width="${W}" height="36" fill="#111"/>
${text(14, 24, "TOKEN COSTS", 18, `fill="white" font-weight="700"`)}
${text(236, 23, `${data.date} ${data.time}`, 13, `fill="white"`)}

${text(18, 58, "Codex", 14, `font-weight="700"`)}
${text(118, 58, `${fmtTokens(totalCodexTokens)}  $${totalCodexCost.toFixed(2)}`, 14)}
${text(18, 76, "Claude", 14, `font-weight="700" fill="#666"`)}
${text(118, 76, `${fmtTokens(totalClaudeTokens)}  $${totalClaudeCost.toFixed(2)}`, 14, `fill="#666"`)}
${text(280, 68, `ALL $${(totalCodexCost + totalClaudeCost).toFixed(2)}`, 16, `font-weight="700"`)}

<line x1="16" y1="84" x2="384" y2="84" stroke="#111" stroke-width="2"/>
${data.hours.length ? rows : text(90, 160, "No token usage yet", 22, `font-weight="700"`)}
<line x1="16" y1="244" x2="384" y2="244" stroke="#111" stroke-width="2"/>
${text(18, 266, "black: Codex", 12)}
${text(158, 266, "gray: Claude Code", 12, `fill="#666"`)}
${text(18, 286, `scale max ${fmtTokens(maxTokens)} tokens/hour`, 12)}
</svg>`;
}

async function convert(svgPath: string, pngPath: string) {
  const proc = Bun.spawn(
    ["convert", "-background", "white", "-flatten", "-colorspace", "Gray", "-resize", `${W}x${H}!`, svgPath, pngPath],
    { stdout: "inherit", stderr: "pipe" },
  );
  const stderr = await new Response(proc.stderr).text();
  const code = await proc.exited;
  if (code !== 0) {
    console.error(`convert failed (${code}): ${stderr}`);
    process.exit(code);
  }
}

async function main() {
  const { input, output, png } = parseArgs();
  const data = await loadData(input);
  await Bun.write(output, render(data));
  console.log(output);
  if (png) {
    await convert(output, png);
    console.log(png);
  }
}

main().catch(err => {
  console.error(String(err));
  process.exit(1);
});
