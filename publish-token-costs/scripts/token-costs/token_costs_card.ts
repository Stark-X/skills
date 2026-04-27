import { basename } from "node:path";

export const TOKEN_COSTS_CARD_WIDTH = 400;
export const TOKEN_COSTS_CARD_HEIGHT = 300;
export const DEFAULT_TOKEN_COSTS_FONT = "/usr/share/fonts/truetype/MapleMono-NF-CN-unhinted/MapleMono-NF-CN-Regular.ttf";

export interface HourPoint {
  hour: number;
  codexTokens: number;
  codexCost: number;
  claudeTokens: number;
  claudeCost: number;
}

export interface CardData {
  date: string;
  time: string;
  hours: HourPoint[];
}

export interface HourlyBucket {
  hour: number;
  tokens: number;
  cost_usd: number;
}

export interface ToolUsage {
  total_tokens: number;
  total_cost_usd: number;
  hourly: HourlyBucket[];
}

export interface UsageReport {
  date: string;
  claude_code: ToolUsage;
  codex: ToolUsage;
}

export interface RenderTokenCostsCardOptions {
  fontPath?: string;
}

export function localDateTime(d = new Date()) {
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return { date, time };
}

export function demoTokenCostsCardData(): CardData {
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

export function usageReportToTokenCostsCardData(report: UsageReport, now = new Date()): CardData {
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

export function renderTokenCostsCardSvg(data: CardData, options: RenderTokenCostsCardOptions = {}): string {
  const fontPath = options.fontPath || DEFAULT_TOKEN_COSTS_FONT;
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
<svg xmlns="http://www.w3.org/2000/svg" width="${TOKEN_COSTS_CARD_WIDTH}" height="${TOKEN_COSTS_CARD_HEIGHT}" viewBox="0 0 ${TOKEN_COSTS_CARD_WIDTH} ${TOKEN_COSTS_CARD_HEIGHT}">
<defs>
  <style>
    @font-face { font-family: '${fontName}'; src: url('file://${fontPath}') format('truetype'); }
    text { font-family: '${fontName}', monospace; fill: #111; dominant-baseline: alphabetic; }
  </style>
</defs>
<rect width="${TOKEN_COSTS_CARD_WIDTH}" height="${TOKEN_COSTS_CARD_HEIGHT}" fill="white"/>
<rect x="0" y="0" width="${TOKEN_COSTS_CARD_WIDTH}" height="36" fill="#111"/>
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
