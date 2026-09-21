import { describe, expect, it } from "vitest";
import {
  ONBOARDING_PATH,
  getGateRedirect,
  isProtectedPath,
} from "@/features/auth/onboarding-gate";

describe("getGateRedirect", () => {
  const authed = { isAuthenticated: true, hasProfile: true };

  it("sends anonymous users on /onboarding to /login", () => {
    expect(
      getGateRedirect({ pathname: "/onboarding", isAuthenticated: false, hasProfile: null }),
    ).toBe("/login");
  });

  it("sends anonymous users on private paths to /login", () => {
    for (const pathname of ["/settings", "/posts", "/editor/abc"]) {
      expect(
        getGateRedirect({ pathname, isAuthenticated: false, hasProfile: null }),
      ).toBe("/login");
    }
  });

  it("leaves anonymous users alone elsewhere", () => {
    for (const pathname of ["/", "/login", "/register", "/explore"]) {
      expect(
        getGateRedirect({ pathname, isAuthenticated: false, hasProfile: null }),
      ).toBeNull();
    }
  });

  it("sends users without a profile to /onboarding", () => {
    for (const pathname of ["/", "/settings", "/posts", "/explore", "/login", "/register"]) {
      expect(
        getGateRedirect({ pathname, isAuthenticated: true, hasProfile: false }),
      ).toBe(ONBOARDING_PATH);
    }
  });

  it("lets users without a profile stay on /onboarding", () => {
    expect(
      getGateRedirect({ pathname: "/onboarding", isAuthenticated: true, hasProfile: false }),
    ).toBeNull();
  });

  it("bounces users with a profile away from /onboarding", () => {
    expect(getGateRedirect({ ...authed, pathname: "/onboarding" })).toBe("/");
  });

  it("does not redirect users with a profile elsewhere", () => {
    for (const pathname of ["/", "/settings", "/login", "/editor/abc"]) {
      expect(getGateRedirect({ ...authed, pathname })).toBeNull();
    }
  });

  it("fails open when the profile lookup failed (hasProfile unknown)", () => {
    for (const pathname of ["/", "/settings", "/onboarding"]) {
      expect(
        getGateRedirect({ pathname, isAuthenticated: true, hasProfile: null }),
      ).toBeNull();
    }
  });

  it("treats nested /onboarding paths as onboarding", () => {
    expect(
      getGateRedirect({ pathname: "/onboarding/x", isAuthenticated: true, hasProfile: false }),
    ).toBeNull();
    expect(getGateRedirect({ ...authed, pathname: "/onboarding/x" })).toBe("/");
  });

  it("does not confuse lookalike paths with /onboarding", () => {
    expect(
      getGateRedirect({ pathname: "/onboardingx", isAuthenticated: true, hasProfile: false }),
    ).toBe(ONBOARDING_PATH);
  });
});

describe("isProtectedPath", () => {
  it("matches the private areas and /onboarding", () => {
    for (const p of ["/settings", "/settings/x", "/editor/1", "/posts", "/onboarding"]) {
      expect(isProtectedPath(p)).toBe(true);
    }
  });

  it("does not match public paths", () => {
    for (const p of ["/", "/login", "/explore", "/post/1", "/author/1"]) {
      expect(isProtectedPath(p)).toBe(false);
    }
  });
});
