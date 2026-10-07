import { describe, expect, it } from "vitest";

import {
  PHOTOGRAPH_MAX_EDGE,
  PHOTOGRAPH_TYPES,
  fitWithin,
  isPrintable,
} from "./photograph";

describe("what a card can print", () => {
  it("is a JPEG or a PNG, and not a WebP, which the card cannot draw", () => {
    expect(isPrintable("image/jpeg")).toBe(true);
    expect(isPrintable("IMAGE/PNG")).toBe(true);
    expect(isPrintable("image/webp")).toBe(false);
    expect(isPrintable("image/svg+xml")).toBe(false);
    expect(isPrintable("")).toBe(false);
  });

  it("is all a file chooser offers", () => {
    expect(PHOTOGRAPH_TYPES).toBe("image/jpeg,image/png");
  });
});

describe("fitWithin", () => {
  it("leaves a picture that already fits as it is", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(PHOTOGRAPH_MAX_EDGE, 900)).toEqual({
      width: PHOTOGRAPH_MAX_EDGE,
      height: 900,
    });
  });

  it("brings a phone's picture down to the longer edge, keeping its shape", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1200, height: 900 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 900, height: 1200 });
  });

  it("never makes an edge nothing", () => {
    expect(fitWithin(12000, 4)).toEqual({ width: 1200, height: 1 });
  });

  it("leaves an empty picture alone, for the API to refuse", () => {
    expect(fitWithin(0, 0)).toEqual({ width: 0, height: 0 });
  });
});
