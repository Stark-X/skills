#!/usr/bin/env bun
/**
 * Read usage JSON from stdin, render a grayscale stacked line chart PNG.
 * Uses: ImageMagick `convert` (system tool) — no JS native deps required.
 */

interface HourlyBucket { hour: number; tokens: number; cost_usd: number }
interface ToolUsage    { hourly: HourlyBucket[] }
interface UsageReport  { date: string; claude_code: ToolUsage; codex: ToolUsage }

function parseArgs() {
  const args = process.argv.slice(2);
  let input: string = "-", output: string | null = null, size = "800x480";
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--input"  || args[i] === "-i") && args[i+1]) input  = args[++i];
    if ((args[i] === "--output" || args[i] === "-o") && args[i+1]) output = args[++i];
    if (args[i] === "--size" && args[i+1]) size = args[++i];
  }
  return { input, output, size };
}

async function readInput(src: string): Promise<string> {
  if (src !== "-") return Bun.file(src).text();
  const chunks: Uint8Array[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Uint8Array);
  return Buffer.concat(chunks).toString("utf-8");
}

function autoTicks(max: number, count = 4): number[] {
  if (max === 0) return [0];
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const nice = [1, 2, 2.5, 5, 10].map(f => f * mag).find(v => v >= raw) ?? raw;
  const ticks: number[] = [];
  for (let v = 0; v <= max * 1.05; v += nice) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

interface SubplotArgs {
  ccData: number[];
  cxData: number[];
  title: string;
  yLabel: string;
  formatY: (v: number) => string;
  left: number; top: number; right: number; bottom: number;
  showXAxis: boolean;
}

function renderSubplot(a: SubplotArgs): string {
  const plotL = a.left + 54;
  const plotR = a.right - 14;
  const plotT = a.top + (a.title ? 26 : 10);
  const plotB = a.bottom - (a.showXAxis ? 30 : 10);
  const plotW = plotR - plotL;
  const plotH = plotB - plotT;

  const maxY  = Math.max(...a.ccData, ...a.cxData, 0);
  const ticks = autoTicks(maxY);
  const yMax  = ticks[ticks.length - 1] || 1;

  const xOf = (h: number) => plotL + (h / 23) * plotW;
  const yOf = (v: number) => plotB - (Math.max(0, v) / yMax) * plotH;

  const parts: string[] = [
    `<rect x="${a.left}" y="${a.top}" width="${a.right - a.left}" height="${a.bottom - a.top}" fill="white"/>`,
  ];

  if (a.title) {
    parts.push(`<text x="${plotL + plotW / 2}" y="${a.top + 16}" text-anchor="middle" font-size="12" font-weight="bold" fill="#000">${a.title}</text>`);
  }

  // y-axis label (rotated)
  parts.push(`<text x="${a.left + 11}" y="${plotT + plotH / 2}" text-anchor="middle" font-size="9" fill="#555" transform="rotate(-90,${a.left + 11},${plotT + plotH / 2})">${a.yLabel}</text>`);

  // grid + y tick labels
  for (const t of ticks) {
    const gy = yOf(t);
    if (gy < plotT - 1 || gy > plotB + 1) continue;
    parts.push(`<line x1="${plotL}" y1="${gy.toFixed(1)}" x2="${plotR}" y2="${gy.toFixed(1)}" stroke="#ddd" stroke-width="0.6" stroke-dasharray="3,3"/>`);
    parts.push(`<text x="${plotL - 4}" y="${(gy + 3).toFixed(1)}" text-anchor="end" font-size="8" fill="#666">${a.formatY(t)}</text>`);
  }

  // axes
  parts.push(`<line x1="${plotL}" y1="${plotB}" x2="${plotR}" y2="${plotB}" stroke="#999" stroke-width="0.8"/>`);
  parts.push(`<line x1="${plotL}" y1="${plotT}" x2="${plotL}" y2="${plotB}" stroke="#999" stroke-width="0.8"/>`);

  // x tick labels
  if (a.showXAxis) {
    for (let h = 0; h <= 23; h += 2) {
      parts.push(`<text x="${xOf(h).toFixed(1)}" y="${plotB + 14}" text-anchor="middle" font-size="8" fill="#666">${h}</text>`);
    }
    parts.push(`<text x="${plotL + plotW / 2}" y="${a.bottom - 4}" text-anchor="middle" font-size="9" fill="#555">Hour of day</text>`);
  }

  // Codex line (dashed gray)
  const cxPts = a.cxData.map((v, i) => `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(" ");
  parts.push(`<polyline points="${cxPts}" fill="none" stroke="#888" stroke-width="1.8" stroke-dasharray="6,4"/>`);

  // Claude Code line (solid black)
  const ccPts = a.ccData.map((v, i) => `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(" ");
  parts.push(`<polyline points="${ccPts}" fill="none" stroke="#000" stroke-width="1.8"/>`);

  // dots: squares = Codex, circles = Claude Code
  for (let i = 0; i < 24; i++) {
    const cx = xOf(i), cy = yOf(a.cxData[i]);
    parts.push(`<rect x="${(cx - 3).toFixed(1)}" y="${(cy - 3).toFixed(1)}" width="6" height="6" fill="#888" stroke="white" stroke-width="0.8"/>`);
  }
  for (let i = 0; i < 24; i++) {
    const cx = xOf(i), cy = yOf(a.ccData[i]);
    parts.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="3" fill="#000" stroke="white" stroke-width="0.8"/>`);
  }

  // legend box
  const lx = plotR - 116, ly = plotT + 8;
  parts.push(`<rect x="${lx}" y="${ly}" width="116" height="32" fill="white" stroke="#ccc" stroke-width="0.8" rx="2"/>`);
  parts.push(`<line x1="${lx+6}" y1="${ly+10}" x2="${lx+22}" y2="${ly+10}" stroke="#000" stroke-width="1.8"/>`);
  parts.push(`<circle cx="${lx+14}" cy="${ly+10}" r="3" fill="#000"/>`);
  parts.push(`<text x="${lx+27}" y="${ly+14}" font-size="8" fill="#000">Claude Code</text>`);
  parts.push(`<line x1="${lx+6}" y1="${ly+23}" x2="${lx+22}" y2="${ly+23}" stroke="#888" stroke-width="1.8" stroke-dasharray="6,4"/>`);
  parts.push(`<rect x="${lx+11}" y="${ly+20}" width="6" height="6" fill="#888"/>`);
  parts.push(`<text x="${lx+27}" y="${ly+27}" font-size="8" fill="#888">Codex</text>`);

  return parts.join("\n");
}

async function main() {
  const { input, output, size } = parseArgs();

  const raw = await readInput(input);
  let data: UsageReport;
  try { data = JSON.parse(raw); } catch {
    console.error("Error: invalid JSON input"); process.exit(1);
  }

  const [wStr, hStr] = size.split("x");
  const W = parseInt(wStr, 10) || 800;
  const H = parseInt(hStr, 10) || 480;
  const dateStr = data.date ?? "unknown";
  const hours   = Array.from({ length: 24 }, (_, i) => i);

  const ccCost   = hours.map(h => data.claude_code.hourly[h]?.cost_usd ?? 0);
  const cxCost   = hours.map(h => data.codex.hourly[h]?.cost_usd        ?? 0);
  const ccTokens = hours.map(h => data.claude_code.hourly[h]?.tokens    ?? 0);
  const cxTokens = hours.map(h => data.codex.hourly[h]?.tokens          ?? 0);

  const midY = Math.floor(H / 2);

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="${W}" height="${H}" fill="white"/>`,
    renderSubplot({
      ccData: ccCost, cxData: cxCost,
      title: `Token Usage · ${dateStr}`,
      yLabel: "Cost (USD)", formatY: v => `$${v.toFixed(3)}`,
      left: 0, top: 0, right: W, bottom: midY,
      showXAxis: false,
    }),
    renderSubplot({
      ccData: ccTokens, cxData: cxTokens,
      title: "", yLabel: "Tokens",
      formatY: v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)),
      left: 0, top: midY, right: W, bottom: H,
      showXAxis: true,
    }),
    `</svg>`,
  ].join("\n");

  const outPath  = output ?? `/tmp/token-costs-${dateStr.replace(/-/g, "")}.png`;
  const svgPath  = outPath.replace(/\.png$/, ".svg");

  await Bun.write(svgPath, svg);

  // Use ImageMagick convert for SVG→grayscale PNG
  const proc = Bun.spawn(
    ["convert", "-density", "150", "-background", "white", "-flatten",
     "-colorspace", "Gray", "-resize", `${W}x${H}!`, svgPath, outPath],
    { stdout: "inherit", stderr: "pipe" },
  );
  const stderr = await new Response(proc.stderr).text();
  const code   = await proc.exited;

  // Clean up temp SVG
  await Bun.spawn(["rm", "-f", svgPath]).exited;

  if (code !== 0) {
    console.error(`convert failed (${code}): ${stderr}`);
    process.exit(1);
  }

  console.log(outPath);
}

main().catch(err => { console.error(String(err)); process.exit(1); });
