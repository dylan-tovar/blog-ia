import { describe, expect, it } from "vitest";
import {
  getPageTitle,
  isNavItemActive,
  NAV_ITEMS,
} from "@/components/shared/navigation";

describe("NAV_ITEMS", () => {
  it("only links to routes that exist, with the feed at the root", () => {
    expect(NAV_ITEMS.map((item) => item.href)).toEqual([
      "/",
      "/explore",
      "/activity",
      "/profile",
    ]);
  });
});

describe("getPageTitle", () => {
  it.each([
    ["/", "Inicio"],
    ["/explore", "Explorar"],
    ["/posts", "Mis posts"],
    ["/activity", "Actividad"],
    ["/settings", "Settings"],
    ["/post/3f2b8c1e-6a4d-4f1b-9c7e-2d5a8b0e1f34", "Post"],
    ["/author/3f2b8c1e-6a4d-4f1b-9c7e-2d5a8b0e1f34", "Autor"],
  ])("%s -> %s", (pathname, title) => {
    expect(getPageTitle(pathname)).toBe(title);
  });

  it("falls back to Inicio for unknown paths", () => {
    expect(getPageTitle("/algo-raro")).toBe("Inicio");
  });

  it("no longer treats /feed as a page of its own", () => {
    expect(getPageTitle("/feed")).toBe("Inicio");
  });
});

describe("isNavItemActive", () => {
  it("matches the exact route", () => {
    expect(isNavItemActive("/posts", "/posts")).toBe(true);
    expect(isNavItemActive("/settings", "/posts")).toBe(false);
  });

  it("matches nested routes of the item", () => {
    expect(isNavItemActive("/posts/abc", "/posts")).toBe(true);
  });

  it("does not match a route that only shares a prefix", () => {
    expect(isNavItemActive("/postscript", "/posts")).toBe(false);
  });

  it("does not treat the editor (it has no shell) as part of Mis posts", () => {
    expect(isNavItemActive("/editor/abc", "/posts")).toBe(false);
  });

  describe("Inicio (the root)", () => {
    it("is active only on the root itself", () => {
      expect(isNavItemActive("/", "/")).toBe(true);
    });

    it.each(["/posts", "/settings", "/post/abc", "/author/abc", "/editor/abc"])(
      "is not active on %s",
      (pathname) => {
        expect(isNavItemActive(pathname, "/")).toBe(false);
      },
    );
  });
});
