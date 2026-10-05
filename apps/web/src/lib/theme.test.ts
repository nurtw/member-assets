import { describe, expect, it } from "vitest";

import {
  THEME_SCRIPT,
  THEME_STORAGE_KEY,
  parseThemeChoice,
  themeAttribute,
} from "./theme";

describe("parseThemeChoice", () => {
  it("keeps an explicit choice", () => {
    expect(parseThemeChoice("light")).toBe("light");
    expect(parseThemeChoice("dark")).toBe("dark");
  });

  it("treats anything else as System", () => {
    for (const value of [null, undefined, "", "system", "Dark", "purple", 1]) {
      expect(parseThemeChoice(value)).toBe("system");
    }
  });
});

describe("themeAttribute", () => {
  it("sets no attribute for System, so the stylesheet follows the device", () => {
    expect(themeAttribute("system")).toBeNull();
    expect(themeAttribute("dark")).toBe("dark");
  });
});

describe("THEME_SCRIPT", () => {
  function run(stored: string | null, throws = false): string | null {
    const attributes: Record<string, string> = {};
    const localStorage = {
      getItem(key: string) {
        if (throws) {
          throw new Error("storage blocked");
        }
        return key === THEME_STORAGE_KEY ? stored : null;
      },
    };
    const document = {
      documentElement: {
        setAttribute(name: string, value: string) {
          attributes[name] = value;
        },
      },
    };
    new Function("localStorage", "document", THEME_SCRIPT)(
      localStorage,
      document,
    );
    return attributes["data-theme"] ?? null;
  }

  it("applies a stored choice before the page is painted", () => {
    expect(run("dark")).toBe("dark");
    expect(run("light")).toBe("light");
  });

  it("leaves System, a tampered value, or blocked storage to the stylesheet", () => {
    expect(run(null)).toBeNull();
    expect(run("system")).toBeNull();
    expect(run('dark" onload="x')).toBeNull();
    expect(run("dark", true)).toBeNull();
  });
});
