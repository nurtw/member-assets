import type { UserScopedPermission } from "@nurtw/contracts";
import { describe, expect, it } from "vitest";

import { matchesPermission, notInPlace, placeNote } from "./officer-access";

function held(
  permission: string,
  organisationId: string,
): UserScopedPermission {
  return {
    id: `${permission}@${organisationId}`,
    permission,
    organisation: { id: organisationId, name: organisationId, level: "BRANCH" },
    reason: null,
    by: null,
    createdAt: "2026-10-20T09:00:00.000Z",
  };
}

describe("notInPlace (item 56)", () => {
  const grants = [
    held("member.read", "branch-a"),
    held("vehicle.read", "branch-b"),
  ];

  it("leaves out what is already in place in that part of the Union", () => {
    expect(
      notInPlace(
        ["member.read", "vehicle.read", "application.read"],
        grants,
        "branch-a",
      ),
    ).toEqual(["vehicle.read", "application.read"]);
  });

  it("keeps what is in place only somewhere else", () => {
    expect(notInPlace(["vehicle.read"], grants, "branch-a")).toEqual([
      "vehicle.read",
    ]);
    expect(notInPlace(["member.read"], grants, "branch-a")).toEqual([]);
  });
});

describe("matchesPermission", () => {
  const entry = {
    code: "vehicle.record",
    description: "Record a vehicle on record",
  };

  it("matches the code or the words, in any case, and everything when empty", () => {
    expect(matchesPermission(entry, "")).toBe(true);
    expect(matchesPermission(entry, "  VEHICLE.rec ")).toBe(true);
    expect(matchesPermission(entry, "on record")).toBe(true);
    expect(matchesPermission(entry, "sticker")).toBe(false);
  });
});

describe("placeNote (item 56)", () => {
  const grants = [
    held("member.read", "council"),
    held("vehicle.read", "council"),
  ];
  const revocations = [
    held("member.read", "council"),
    held("sticker.read", "council"),
  ];

  it("says what is in place there, and nothing elsewhere", () => {
    expect(placeNote("member.read", grants, revocations, "council")).toBe(
      "granted and revoked there",
    );
    expect(placeNote("vehicle.read", grants, revocations, "council")).toBe(
      "granted there",
    );
    expect(placeNote("sticker.read", grants, revocations, "council")).toBe(
      "revoked there",
    );
    expect(
      placeNote("member.read", grants, revocations, "branch-a"),
    ).toBeNull();
  });
});
