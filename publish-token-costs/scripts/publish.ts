#!/usr/bin/env bun
/**
 * Orchestrate: collect usage -> render 400x300 PNG -> POST to Zectrix e-ink device.
 * Env: ZECTRIX_DEVICE_ID, ZECTRIX_API_KEY, TOKEN_COSTS_FONT
 */

import { join } from "node:path";
import { DEFAULT_ZECTRIX_BASE_URL, publishZectrixImage } from "./modules/bun/zectrix/zectrix.ts";

const SCRIPTS = join(import.meta.dir);

function localDate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

async function main() {
  const { dryRun, date, page } = parseArgs();

  const deviceId = dryRun ? (process.env.ZECTRIX_DEVICE_ID ?? "DRY-RUN-DEVICE") : requireEnv("ZECTRIX_DEVICE_ID");
  const apiKey = dryRun ? "DRY-RUN-KEY" : requireEnv("ZECTRIX_API_KEY");
  const yyyymmdd = date.replace(/-/g, "");
  const svgPath = `/tmp/token-costs-${yyyymmdd}.svg`;
  const pngPath = `/tmp/token-costs-${yyyymmdd}.png`;

  console.log(`[1/3] Collecting usage for ${date}...`);
  const usageJson = await runScript("collect.ts", ["--date", date]);

  console.log(`[2/3] Rendering image -> ${pngPath}`);
  await runScript("render_token_costs_card.ts", ["--input", "-", "--output", svgPath, "--png", pngPath], usageJson);

  const pngBytes = await Bun.file(pngPath).arrayBuffer();

  if (dryRun) {
    const imageUrl = `${DEFAULT_ZECTRIX_BASE_URL}/${deviceId}/display/image`;
    console.log(`\n[DRY RUN] Image -> ${imageUrl}`);
    console.log(`  PNG:    ${pngBytes.byteLength.toLocaleString()} bytes at ${pngPath}`);
    console.log(`  SVG:    ${svgPath}`);
    console.log(`  Fields: dither=true  pageId=${page}`);
    return;
  }

  console.log(`[3/3] Publishing image to device ${deviceId} page ${page}...`);
  const result = await publishZectrixImage({
    deviceId,
    apiKey,
    pageId: page,
    pngBytes,
    filename: `token-costs-${yyyymmdd}.png`,
  });
  console.log("Image:", JSON.stringify(result.body));
}

main().catch(err => { console.error(String(err)); process.exit(1); });
