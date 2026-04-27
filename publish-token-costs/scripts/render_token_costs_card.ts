#!/usr/bin/env bun

import {
  DEFAULT_TOKEN_COSTS_FONT,
  TOKEN_COSTS_CARD_HEIGHT,
  TOKEN_COSTS_CARD_WIDTH,
  demoTokenCostsCardData,
  renderTokenCostsCardSvg,
  usageReportToTokenCostsCardData,
  type UsageReport,
} from "./token-costs/token_costs_card.ts";
import { convertSvgToPng } from "./modules/bun/image-handling/svg_to_png.ts";

interface Args {
  input: string;
  output: string;
  png: string | null;
}

function parseArgs(): Args {
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

async function readStdin(): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Uint8Array);
  return Buffer.concat(chunks).toString("utf-8");
}

async function loadCardData(input: string) {
  if (input === "demo") return demoTokenCostsCardData();
  const raw = input === "-" ? await readStdin() : await Bun.file(input).text();
  return usageReportToTokenCostsCardData(JSON.parse(raw) as UsageReport, new Date());
}

async function main() {
  const { input, output, png } = parseArgs();
  const data = await loadCardData(input);
  const fontPath = process.env.TOKEN_COSTS_FONT || DEFAULT_TOKEN_COSTS_FONT;
  await Bun.write(output, renderTokenCostsCardSvg(data, { fontPath }));
  console.log(output);
  if (png) {
    await convertSvgToPng(output, png, {
      width: TOKEN_COSTS_CARD_WIDTH,
      height: TOKEN_COSTS_CARD_HEIGHT,
    });
    console.log(png);
  }
}

main().catch(err => {
  console.error(String(err));
  process.exit(1);
});
