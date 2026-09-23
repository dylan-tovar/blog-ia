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
    // A bare post id or username has no static title to key off of — falls
    // through to the default, same as any other unmapped segment.
    ["/p/3f2b8c1e-6a4d-4f1b-9c7e-2d5a8b0e1f34", "Inicio"],
    ["/algunusername", "Inicio"],
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

    it.each(["/posts", "/settings", "/p/abc", "/algunusername", "/editor/abc"])(
      "is not active on %s",
      (pathname) => {
        expect(isNavItemActive(pathname, "/")).toBe(false);
      },
    );
  });

  describe("Perfil (/profile, own username page)", () => {
    it("is active on /profile itself", () => {
      expect(isNavItemActive("/profile", "/profile")).toBe(true);
    });

    it("is active on the viewer's own username page", () => {
      expect(isNavItemActive("/dylan", "/profile", "dylan")).toBe(true);
    });

    it("is not active on someone else's username page", () => {
      expect(isNavItemActive("/otra_persona", "/profile", "dylan")).toBe(false);
    });

    it("is not active on any username page when the viewer's username is unknown", () => {
      expect(isNavItemActive("/dylan", "/profile", null)).toBe(false);
    });
  });
});
