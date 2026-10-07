import { describe, expect, it } from "vitest";

import {
  OFFICER_ACCOUNT_ITEMS,
  OFFICER_LANDING_ORDER,
  OFFICER_NAVIGATION,
  activeItem,
  breadcrumbs,
  landingHref,
  navigationItems,
  visibleNavigation,
} from "./navigation";

const holding =
  (...permissions: string[]) =>
  (permission: string) =>
    permissions.includes(permission);

describe("visibleNavigation", () => {
  it("shows a verification officer Verify and the vehicles alone", () => {
    const groups = visibleNavigation(
      OFFICER_NAVIGATION,
      holding("verification.perform", "vehicle.read"),
    );
    expect(navigationItems(groups).map((item) => item.label)).toEqual([
      "Verify",
      "Vehicles",
    ]);
  });

  it("drops a group the officer can open nothing in", () => {
    const groups = visibleNavigation(
      OFFICER_NAVIGATION,
      holding("vehicle.read"),
    );
    expect(groups.map((group) => group.label)).toEqual(["Vehicles"]);
  });

  it("gives an officer who reads cards the Home screen as well as the cards", () => {
    const groups = visibleNavigation(OFFICER_NAVIGATION, holding("card.read"));
    expect(navigationItems(groups).map((item) => item.label)).toEqual([
      "Home",
      "Cards",
    ]);
  });

  it("offers the sticker stock only to a holder of sticker.stock_intake", () => {
    const labels = (permission: string) =>
      navigationItems(
        visibleNavigation(OFFICER_NAVIGATION, holding(permission)),
      ).map((item) => item.label);
    expect(labels("sticker.stock_intake")).toEqual(["Sticker stock"]);
    expect(labels("sticker.attach")).not.toContain("Sticker stock");
    expect(labels("sticker.manage_stock")).not.toContain("Sticker stock");
  });

  it("offers Members to an officer who reads members, and not Applications", () => {
    const groups = visibleNavigation(
      OFFICER_NAVIGATION,
      holding("member.read"),
    );
    expect(navigationItems(groups).map((item) => item.label)).toEqual([
      "Members",
    ]);
  });

  it("shows nothing to an officer with no permission", () => {
    expect(visibleNavigation(OFFICER_NAVIGATION, holding())).toEqual([]);
  });

  it("opens a screen on any one of its permissions", () => {
    const groups = visibleNavigation(
      OFFICER_NAVIGATION,
      holding("verification.membership"),
    );
    expect(navigationItems(groups).map((item) => item.href)).toEqual([
      "/verify",
    ]);
  });
});

describe("landingHref", () => {
  it("lands an officer with a desk on the Overview", () => {
    expect(
      landingHref(
        OFFICER_NAVIGATION,
        OFFICER_LANDING_ORDER,
        holding("verification.perform", "application.read", "user.read"),
      ),
    ).toBe("/overview");
  });

  it("gives an officer who only verifies no Overview, even reading vehicles", () => {
    const groups = visibleNavigation(
      OFFICER_NAVIGATION,
      holding("verification.perform", "vehicle.read"),
    );
    expect(navigationItems(groups).map((item) => item.href)).not.toContain(
      "/overview",
    );
  });

  it("lands a verification officer on Verify", () => {
    expect(
      landingHref(
        OFFICER_NAVIGATION,
        OFFICER_LANDING_ORDER,
        holding("vehicle.read", "verification.perform"),
      ),
    ).toBe("/verify");
  });

  it("lands an officer who records vehicles on the vehicles, not the members", () => {
    expect(
      landingHref(
        OFFICER_NAVIGATION,
        OFFICER_LANDING_ORDER,
        holding("vehicle.read", "member.read"),
      ),
    ).toBe("/vehicles");
  });

  it("lands an officer on the structure only when they hold nothing else", () => {
    expect(
      landingHref(
        OFFICER_NAVIGATION,
        OFFICER_LANDING_ORDER,
        holding("organisation.read"),
      ),
    ).toBe("/settings/structure");
    expect(
      landingHref(
        OFFICER_NAVIGATION,
        OFFICER_LANDING_ORDER,
        holding("organisation.read", "member.read"),
      ),
    ).toBe("/members");
  });

  it("lands an officer who may only read roles on the roles", () => {
    expect(
      landingHref(
        OFFICER_NAVIGATION,
        OFFICER_LANDING_ORDER,
        holding("role.read"),
      ),
    ).toBe("/settings/users/roles");
  });

  it("has nowhere to land an officer with no permission", () => {
    expect(
      landingHref(OFFICER_NAVIGATION, OFFICER_LANDING_ORDER, holding()),
    ).toBeNull();
  });

  it("names every sidebar screen in the landing order", () => {
    const sidebar = navigationItems(OFFICER_NAVIGATION).map(
      (item) => item.href,
    );
    expect([...OFFICER_LANDING_ORDER].sort()).toEqual([...sidebar].sort());
  });
});

describe("activeItem", () => {
  const items = navigationItems(OFFICER_NAVIGATION);

  it("marks Roles on its own page, not Officers", () => {
    expect(activeItem("/settings/users/roles", items)?.label).toBe("Roles");
  });

  it("marks Officers on an officer's page", () => {
    expect(
      activeItem("/settings/users/0b9c2f9e-1111-4c4c-9d9d-123456789abc", items)
        ?.label,
    ).toBe("Officers");
  });

  it("does not match a screen whose address merely starts the same", () => {
    expect(activeItem("/cardsharp", items)).toBeNull();
  });
});

describe("breadcrumbs", () => {
  it("names the group and the screen, the screen not a link", () => {
    expect(breadcrumbs("/organisations/limits", OFFICER_NAVIGATION)).toEqual([
      { label: "Partners" },
      { label: "Limits" },
    ]);
  });

  it("calls a record's page Details, beneath a link to its list", () => {
    expect(
      breadcrumbs(
        "/applications/0b9c2f9e-1111-4c4c-9d9d-123456789abc",
        OFFICER_NAVIGATION,
      ),
    ).toEqual([
      { label: "Membership" },
      { label: "Applications", href: "/applications" },
      { label: "Details" },
    ]);
  });

  it("names a new record's page", () => {
    expect(breadcrumbs("/vehicles/new", OFFICER_NAVIGATION)).toEqual([
      { label: "Vehicles", href: "/vehicles" },
      { label: "New" },
    ]);
  });

  it("leaves out a group named as its only screen is", () => {
    expect(breadcrumbs("/vehicles", OFFICER_NAVIGATION)).toEqual([
      { label: "Vehicles" },
    ]);
  });

  it("reaches the account page through the extra items", () => {
    expect(
      breadcrumbs("/account", OFFICER_NAVIGATION, OFFICER_ACCOUNT_ITEMS),
    ).toEqual([{ label: "Your account" }]);
  });

  it("names Home alone, which has no group", () => {
    expect(breadcrumbs("/overview", OFFICER_NAVIGATION)).toEqual([
      { label: "Home" },
    ]);
  });

  it("gives nothing for a page outside the navigation", () => {
    expect(breadcrumbs("/elsewhere", OFFICER_NAVIGATION)).toEqual([]);
  });
});
