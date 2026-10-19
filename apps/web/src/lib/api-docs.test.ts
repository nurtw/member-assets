import { describe, expect, it } from "vitest";

import {
  accessLabel,
  accessOf,
  areaOf,
  byArea,
  exampleBody,
  fieldsOf,
  matchesSearch,
  operationsOf,
  typeOf,
  type OpenApiDocument,
} from "./api-docs";

/** A document shaped as the API's generator writes one. */
const DOCUMENT: OpenApiDocument = {
  paths: {
    "/api/v1/verification/vehicle/plate": {
      post: {
        summary: "Check a plate.",
        description:
          "Answers MATCH_FOUND or NO_MATCH_FOUND.\n\n**Scope required:** `vehicle:verify:plate`. Authenticated by API token.",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  plate_number: { type: "string", description: "As entered." },
                  note: { type: "string" },
                },
                required: ["plate_number"],
              },
            },
          },
        },
        responses: { "200": { description: "Successful response." } },
        security: [{ apiToken: ["vehicle:verify:plate"] }],
      },
    },
    "/api/v1/members/{id}": {
      get: {
        summary: "Read a member.",
        description: "**Permission required:** `member.read`.",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: { "200": { description: "Successful response." } },
      },
    },
    "/api/v1/auth/me": {
      get: {
        summary: "Your account.",
        description: "**Permission required:** `(any signed-in officer)`.",
      },
    },
    "/api/v1/health": {
      get: { summary: "Alive.", security: [] },
    },
    "/api/v1/portal/usage": {
      get: { summary: "Usage.", security: [{ portalCookie: [] }] },
    },
  },
};

describe("the docs page's reading of the API's documents", () => {
  it("tells who may call each route", () => {
    const access = Object.fromEntries(
      operationsOf(DOCUMENT).map((operation) => [
        operation.path,
        operation.access,
      ]),
    );
    expect(access["/api/v1/verification/vehicle/plate"]).toEqual({
      kind: "scope",
      name: "vehicle:verify:plate",
    });
    expect(access["/api/v1/members/{id}"]).toEqual({
      kind: "permission",
      name: "member.read",
    });
    expect(access["/api/v1/auth/me"]).toEqual({ kind: "signed-in" });
    expect(access["/api/v1/health"]).toEqual({ kind: "public" });
    expect(access["/api/v1/portal/usage"]).toEqual({ kind: "portal" });
    expect(accessOf({})).toEqual({ kind: "signed-in" });
  });

  it("drops the access line from a route's words, since the page shows it beside them", () => {
    const [plate] = operationsOf(DOCUMENT).filter(
      (o) => o.area === "verification",
    );
    expect(plate!.description).toBe("Answers MATCH_FOUND or NO_MATCH_FOUND.");
  });

  it("lists a body's fields, required first, and a body to start from", () => {
    const [plate] = operationsOf(DOCUMENT).filter(
      (o) => o.area === "verification",
    );
    expect(plate!.body).toEqual([
      {
        name: "plate_number",
        type: "string",
        required: true,
        description: "As entered.",
      },
      { name: "note", type: "string", required: false, description: null },
    ]);
    expect(exampleBody(plate!.body)).toEqual({ plate_number: "…" });
  });

  it("says a type in words", () => {
    expect(typeOf({ type: "string" })).toBe("string");
    expect(typeOf({ type: ["string", "null"] })).toBe("string");
    expect(typeOf({ enum: ["2026-09", "2026-Q3"] })).toBe(
      "one of 2026-09, 2026-Q3",
    );
    expect(typeOf({ type: "array", items: { type: "string" } })).toBe(
      "array of string",
    );
    expect(typeOf({ anyOf: [{ type: "string" }, { type: "integer" }] })).toBe(
      "string or integer",
    );
    expect(typeOf({ type: "string", format: "uuid" })).toBe("string (uuid)");
    expect(typeOf(undefined)).toBe("any");
    expect(fieldsOf(undefined)).toEqual([]);
  });

  it("groups routes by what they are about, and finds them by any word", () => {
    const operations = operationsOf(DOCUMENT);
    expect(byArea(operations).map((group) => group.area)).toEqual([
      "auth",
      "health",
      "members",
      "portal",
      "verification",
    ]);
    expect(areaOf("/api/v1/verification/vehicle/plate")).toBe("verification");
    const member = operations.find((o) => o.area === "members")!;
    expect(matchesSearch(member, "member.read")).toBe(true);
    expect(matchesSearch(member, "GET members")).toBe(true);
    expect(matchesSearch(member, "plate")).toBe(false);
    expect(matchesSearch(member, "  ")).toBe(true);
    expect(member.parameters).toEqual([
      { name: "id", type: "path · string", required: true, description: null },
    ]);
  });

  it("gives every operation an id fit for a link", () => {
    for (const operation of operationsOf(DOCUMENT)) {
      expect(operation.id).toMatch(/^[a-zA-Z0-9-]+$/);
    }
    expect(accessLabel({ kind: "scope", name: "vehicle:verify:plate" })).toBe(
      "Scope vehicle:verify:plate",
    );
  });
});
