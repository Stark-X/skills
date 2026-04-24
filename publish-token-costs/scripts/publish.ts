#!/usr/bin/env bun
/**
 * Orchestrate: collect usage → render chart → POST to Zectrix e-ink device.
 * Env: ZECTRIX_DEVICE_ID, ZECTRIX_API_KEY
 */

import { join } from "node:path";

const BASE_URL   = "https://cloud.zectrix.com/open/v1/devices";
const SCRIPTS    = join(import.meta.dir);

function parseArgs() {
  const args = process.argv.slice(2);
  let dryRun    = false;
  let date      = new Date().toISOString().slice(0, 10);
  let imagePage = "1";
  let textPage  = "2";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run")   dryRun    = true;
    if (args[i] === "--date"       && args[i + 1]) date      = args[++i];
    if (args[i] === "--image-page" && args[i + 1]) imagePage = args[++i];
    if (args[i] === "--text-page"  && args[i + 1]) textPage  = args[++i];
  }
  return { dryRun, date, imagePage, textPage };
}

function requireEnv(name: string): string {
  const val = process.env[name]?.trim();
  if (!val) {
    console.error(`Error: environment variable ${name} is not set.`);
    process.exit(1);
  }
  return val;
}

async function runScript(script: string, args: string[], stdin?: string): Promise<string> {
  const proc = Bun.spawn(["bun", "run", join(SCRIPTS, script), ...args], {
    stdout: "pipe",
    stderr: "inherit",
    stdin: stdin !== undefined ? Buffer.from(stdin, "utf-8") : "inherit",
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

function formatSummary(data: { date: string; claude_code: Record<string, unknown>; codex: Record<string, unknown> }) {
  const cc     = data.claude_code as { total_tokens: number; total_cost_usd: number };
  const cx     = data.codex      as { total_tokens: number; total_cost_usd: number };
  const title  = `Token Costs · ${data.date}`;
  const body   =
    `Claude Code\n` +
    `  Tokens: ${cc.total_tokens.toLocaleString()}\n` +
    `  Cost:   $${cc.total_cost_usd.toFixed(4)}\n` +
    `\n` +
    `Codex CLI\n` +
    `  Tokens: ${cx.total_tokens.toLocaleString()}\n` +
    `  Cost:   $${cx.total_cost_usd.toFixed(4)}\n` +
    `\n` +
    `Grand Total: $${(cc.total_cost_usd + cx.total_cost_usd).toFixed(4)}`;
  return { title, body };
}

async function main() {
  const { dryRun, date, imagePage, textPage } = parseArgs();

  const deviceId = dryRun ? (process.env.ZECTRIX_DEVICE_ID ?? "DRY-RUN-DEVICE") : requireEnv("ZECTRIX_DEVICE_ID");
  const apiKey   = dryRun ? "DRY-RUN-KEY"                                         : requireEnv("ZECTRIX_API_KEY");

  const yyyymmdd = date.replace(/-/g, "");
  const pngPath  = `/tmp/token-costs-${yyyymmdd}.png`;

  // Step 1: collect
  console.log(`[1/3] Collecting usage for ${date}…`);
  const usageJson = await runScript("collect.ts", ["--date", date]);
  const usageData = JSON.parse(usageJson);

  // Step 2: render
  console.log(`[2/3] Rendering chart → ${pngPath}`);
  await runScript("render_chart.ts", ["--input", "-", "--output", pngPath], usageJson);

  const pngBytes = await Bun.file(pngPath).arrayBuffer();
  const { title, body } = formatSummary(usageData);

  const imageUrl = `${BASE_URL}/${deviceId}/display/image`;
  const textUrl  = `${BASE_URL}/${deviceId}/display/structured-text`;

  if (dryRun) {
    console.log(`\n[DRY RUN] Image → ${imageUrl}`);
    console.log(`  PNG:    ${pngBytes.byteLength.toLocaleString()} bytes at ${pngPath}`);
    console.log(`  Fields: dither=true  pageId=${imagePage}`);
    console.log(`\n[DRY RUN] Text  → ${textUrl}`);
    console.log(JSON.stringify({ title, body, pageId: textPage }, null, 2));
    return;
  }

  // Step 3: publish
  console.log(`[3/3] Publishing to device ${deviceId}…`);

  const form = new FormData();
  form.append("images", new File([pngBytes], `token-costs-${yyyymmdd}.png`, { type: "image/png" }));
  form.append("dither", "true");
  form.append("pageId", imagePage);

  const imgResp = await fetch(imageUrl, {
    method: "POST",
    headers: { "X-API-Key": apiKey },
    body: form,
  });
  console.log("Image:", JSON.stringify(await imgResp.json()));

  const txtResp = await fetch(textUrl, {
    method: "POST",
    headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ title, body, pageId: textPage }),
  });
  console.log("Text: ", JSON.stringify(await txtResp.json()));
}

main().catch(err => { console.error(String(err)); process.exit(1); });
