import { describe, expect, it } from "vitest";

import {
  FORWARDING_KEY_HEADER,
  VISITOR_ADDRESS_HEADER,
} from "@nurtw/contracts";

import { forwardingHeaders, visitorAddress } from "./visitor-address";

const SECRET = "s".repeat(40);

describe("visitorAddress", () => {
  it("reads the address the host set, Vercel's own header first", () => {
    expect(
      visitorAddress(
        new Headers({
          "x-vercel-forwarded-for": "198.51.100.23",
          "x-real-ip": "203.0.113.7",
        }),
      ),
    ).toBe("198.51.100.23");
    expect(visitorAddress(new Headers({ "x-real-ip": "2001:db8::7" }))).toBe(
      "2001:db8::7",
    );
  });

  it("takes the first of a list, and nothing that is not an address", () => {
    expect(
      visitorAddress(
        new Headers({ "x-vercel-forwarded-for": "198.51.100.23, 10.0.0.1" }),
      ),
    ).toBe("198.51.100.23");
    expect(
      visitorAddress(new Headers({ "x-real-ip": "localhost" })),
    ).toBeUndefined();
  });

  it("never reads x-forwarded-for, which a browser can write", () => {
    expect(
      visitorAddress(new Headers({ "x-forwarded-for": "198.51.100.23" })),
    ).toBeUndefined();
  });
});

describe("forwardingHeaders", () => {
  it("names the visitor, with the secret, when both are known", () => {
    const headers = forwardingHeaders(
      new Headers({ "x-real-ip": "198.51.100.23", cookie: "a=b" }),
      SECRET,
    );

    expect(headers.get(FORWARDING_KEY_HEADER)).toBe(SECRET);
    expect(headers.get(VISITOR_ADDRESS_HEADER)).toBe("198.51.100.23");
    expect(headers.get("cookie")).toBe("a=b");
  });

  it("removes what a browser sent, whether or not it adds its own", () => {
    const forged = new Headers({
      [FORWARDING_KEY_HEADER]: "a-guess",
      [VISITOR_ADDRESS_HEADER]: "192.0.2.1",
      "x-real-ip": "198.51.100.23",
    });

    const withSecret = forwardingHeaders(forged, SECRET);
    expect(withSecret.get(FORWARDING_KEY_HEADER)).toBe(SECRET);
    expect(withSecret.get(VISITOR_ADDRESS_HEADER)).toBe("198.51.100.23");

    const withoutSecret = forwardingHeaders(forged, undefined);
    expect(withoutSecret.has(FORWARDING_KEY_HEADER)).toBe(false);
    expect(withoutSecret.has(VISITOR_ADDRESS_HEADER)).toBe(false);
  });

  it("sends no secret when there is no address to vouch for", () => {
    const headers = forwardingHeaders(new Headers(), SECRET);

    expect(headers.has(FORWARDING_KEY_HEADER)).toBe(false);
    expect(headers.has(VISITOR_ADDRESS_HEADER)).toBe(false);
  });
});
