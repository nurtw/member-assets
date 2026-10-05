import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Every colour comes from a token (item 32, `DESIGN.md` §6).
 *
 * A raw colour reads correctly in one theme and wrongly in the other:
 * `text-black/60` vanishes on a dark surface, and `bg-white` is a glaring
 * panel there. A screen with one of them is half themed, which for a verdict
 * is worse than not themed at all. This test fails on any that come back.
 */

const SOURCE = fileURLToPath(new URL("..", import.meta.url));

const UTILITY =
  "(?:bg|text|border|ring|divide|outline|fill|stroke|from|via|to|placeholder|decoration|shadow|accent|caret)";

const FORBIDDEN: { rule: string; pattern: RegExp }[] = [
  {
    rule: "black or white: use a surface, text, or line token",
    pattern: new RegExp(`(?<![\\w-])${UTILITY}-(?:black|white)(?![\\w-])`, "g"),
  },
  {
    rule: "a palette colour: use a token",
    pattern: new RegExp(
      `(?<![\\w-])${UTILITY}-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\\d{2,3}(?![\\w-])`,
      "g",
    ),
  },
  {
    rule: "a literal colour in a class: use a token",
    pattern: new RegExp(`(?<![\\w-])${UTILITY}-\\[#[0-9a-fA-F]{3,8}\\]`, "g"),
  },
  {
    rule: "a variable in a class: use the token's own utility",
    pattern: new RegExp(`(?<![\\w-])${UTILITY}-\\[var\\(--`, "g"),
  },
];

function sources(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      return sources(path);
    }
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)
      ? [path]
      : [];
  });
}

describe("colour tokens", () => {
  it("leaves no raw colour in a component", () => {
    const found: string[] = [];
    for (const file of sources(SOURCE)) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, index) => {
        for (const { rule, pattern } of FORBIDDEN) {
          for (const match of line.matchAll(pattern)) {
            found.push(
              `${relative(SOURCE, file)}:${index + 1}  ${match[0]}  (${rule})`,
            );
          }
        }
      });
    }
    expect(found).toEqual([]);
  });

  it("would catch the classes it exists to stop", () => {
    const sample =
      'className="bg-white text-black/60 border-gray-200 bg-[#fff] text-[var(--foreground)]"';
    const caught = FORBIDDEN.flatMap(({ pattern }) => [
      ...sample.matchAll(pattern),
    ]);
    expect(caught.map((match) => match[0])).toEqual([
      "bg-white",
      "text-black",
      "border-gray-200",
      "bg-[#fff]",
      "text-[var(--",
    ]);
  });
});
