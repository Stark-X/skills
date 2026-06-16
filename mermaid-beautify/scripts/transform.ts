#!/usr/bin/env bun
// @ts-nocheck -- standalone script with no local node_modules/@types/bun;
// Bun's runtime provides process/node:fs/etc. and strips types at execution.
//
// Convert raw ```mermaid fences in Markdown/HTML files into a hidden-source
// container followed by a beautiful-mermaid rendering (SVG or ASCII).
//
// The original mermaid source is stored verbatim inside a <div hidden>
// wrapper — invisible in any browser, immune to the problems that plague
// HTML comments (backtick fences break comment boundaries in Markdown
// parsers, and mermaid arrows like "-->|label|" literally contain the HTML
// comment closer).  No escaping needed, no edge cases.
//
//     <div hidden>
//     graph TD
//       A --> B
//     </div>
//
//     <svg>...</svg>
//
// Self-contained script, no package.json — Bun fallback auto-install fetches
// the dependency on first use:
//   bun run --install=fallback transform.ts <file> [options]

import { readFileSync, writeFileSync } from "node:fs";
import { renderMermaidSVG, renderMermaidASCII, THEMES } from "beautiful-mermaid";

type Format = "svg" | "ascii";

interface Options {
  format: Format;
  theme?: string;
  output?: string;
  write: boolean;
  force: boolean;
}

function printHelp(): void {
  console.log(`Usage: transform.ts <file|-> [options]

Convert raw \`\`\`mermaid fences into a hidden-source HTML container followed
by a beautiful-mermaid rendering (SVG by default, or ASCII art).

Options:
  --format <svg|ascii>   Output format for rendered diagrams (default: svg)
  --theme <name>         beautiful-mermaid theme (default: library default)
                          Available: ${Object.keys(THEMES).join(", ")}
  --output <file>        Write result to <file> instead of stdout
  --write                Overwrite the input file in place
  --force                Re-render blocks that were already converted
  --help                 Show this help

Pass "-" as <file> to read from stdin (output goes to stdout).
`);
}

function parseArgs(argv: string[]): { input: string; options: Options } {
  let input: string | undefined;
  const options: Options = { format: "svg", write: false, force: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--format":
        options.format = argv[++i] as Format;
        break;
      case "--theme":
        options.theme = argv[++i];
        break;
      case "--output":
        options.output = argv[++i];
        break;
      case "--write":
        options.write = true;
        break;
      case "--force":
        options.force = true;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
      default:
        if (arg.startsWith("--")) {
          throw new Error(`Unknown option: ${arg}`);
        }
        if (input !== undefined) {
          throw new Error(`Unexpected extra argument: ${arg}`);
        }
        input = arg;
    }
  }

  if (!input) {
    printHelp();
    throw new Error("Missing <file> argument");
  }
  if (options.format !== "svg" && options.format !== "ascii") {
    throw new Error(`--format must be "svg" or "ascii", got "${options.format}"`);
  }
  if (options.theme && !(options.theme in THEMES)) {
    throw new Error(`Unknown theme "${options.theme}". Available: ${Object.keys(THEMES).join(", ")}`);
  }

  return { input, options };
}

// Matches two patterns:
//
//   1. Already converted block:
//        <div hidden>\n<source>\n</div>\n\n<svg>...</svg>
//        or  <div hidden>\n<source>\n</div>\n\n```\n<ascii>\n```
//      → g1=source, g2=rendered
//
//   2. Raw ```mermaid fence:
//        ```mermaid\n<source>\n```
//      → g3=source
const BLOCK_RE =
  /<div hidden>\n([\s\S]*?)\n<\/div>\n\n?(<svg[\s\S]*?<\/svg>|```[\w-]*\n[\s\S]*?\n```)(?=\n|$)|```mermaid\n([\s\S]*?)\n```(?=\n|$)/g;

function render(source: string, options: Options): string {
  if (options.format === "ascii") {
    const art = renderMermaidASCII(source, { colorMode: "none" });
    return "```\n" + art + "\n```";
  }
  const theme = options.theme ? THEMES[options.theme] : undefined;
  return renderMermaidSVG(source, theme);
}

// Wrap plain mermaid source in a <div hidden> for display-free storage.
// No HTML comment, no backtick fence — immune to both "```" and "-->" collisions.
function wrap(source: string, rendered: string): string {
  return `<div hidden>\n${source}\n</div>\n\n${rendered}`;
}

function main(): void {
  const { input, options } = parseArgs(process.argv.slice(2));

  const content = input === "-" ? readFileSync(0, "utf-8") : readFileSync(input, "utf-8");

  let converted = 0;
  let skipped = 0;
  const errors: string[] = [];

  const result = content.replace(
    BLOCK_RE,
    (match, wrappedSource, _rendered, rawSource, offset) => {
      const isWrapped = wrappedSource !== undefined;
      const source = isWrapped ? wrappedSource : rawSource;

      if (isWrapped && !options.force) {
        skipped++;
        return match;
      }

      try {
        const rendered = render(source, options);
        converted++;
        return wrap(source, rendered);
      } catch (err) {
        const lineNo = content.slice(0, offset).split("\n").length;
        errors.push(`line ${lineNo}: ${(err as Error).message}`);
        return match;
      }
    },
  );

  if (options.write) {
    if (input === "-") throw new Error("--write cannot be used when reading from stdin");
    writeFileSync(input, result);
  } else if (options.output) {
    writeFileSync(options.output, result);
  } else {
    process.stdout.write(result);
  }

  console.error(
    `mermaid-beautify: converted ${converted}, skipped ${skipped} (already converted), ${errors.length} error(s)`,
  );
  for (const e of errors) console.error(`  - ${e}`);

  if (errors.length > 0) process.exit(1);
}

main();
