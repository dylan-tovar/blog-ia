import { describe, expect, it } from "vitest";
import {
  ONBOARDING_PATH,
  getGateRedirect,
  getOnboardingState,
  isProtectedPath,
  type OnboardingState,
} from "@/features/auth/onboarding-gate";

const authed = (pathname: string, onboardingState: OnboardingState) => ({
  pathname,
  isAuthenticated: true,
  onboardingState,
});

describe("getOnboardingState", () => {
  it("is none when there is no profile", () => {
    expect(getOnboardingState(null)).toBe("none");
  });

  it("is interests when the profile has not finished step 2", () => {
    expect(getOnboardingState({ onboarded_at: null })).toBe("interests");
  });

  it("is done once onboarded_at is set", () => {
    expect(getOnboardingState({ onboarded_at: "2026-01-01T00:00:00Z" })).toBe("done");
  });
});

describe("getGateRedirect", () => {
  it("sends anonymous users on /onboarding to /login", () => {
    expect(
      getGateRedirect({ pathname: "/onboarding", isAuthenticated: false, onboardingState: null }),
    ).toBe("/login");
  });

  it("sends anonymous users on private paths to /login", () => {
    for (const pathname of ["/settings", "/posts", "/editor/abc"]) {
      expect(
        getGateRedirect({ pathname, isAuthenticated: false, onboardingState: null }),
      ).toBe("/login");
    }
  });

  it("leaves anonymous users alone elsewhere", () => {
    for (const pathname of ["/", "/login", "/register", "/explore"]) {
      expect(
        getGateRedirect({ pathname, isAuthenticated: false, onboardingState: null }),
      ).toBeNull();
    }
  });

  describe.each<OnboardingState>(["none", "interests"])("while onboarding is pending (%s)", (state) => {
    it("sends the user to /onboarding from every other page", () => {
      for (const pathname of ["/", "/settings", "/posts", "/explore", "/login", "/register", "/editor/abc"]) {
        expect(getGateRedirect(authed(pathname, state))).toBe(ONBOARDING_PATH);
      }
    });

    it("lets the user stay on /onboarding", () => {
      expect(getGateRedirect(authed("/onboarding", state))).toBeNull();
    });

    it("treats nested /onboarding paths as onboarding", () => {
      expect(getGateRedirect(authed("/onboarding/x", state))).toBeNull();
    });

    it("does not confuse lookalike paths with /onboarding", () => {
      expect(getGateRedirect(authed("/onboardingx", state))).toBe(ONBOARDING_PATH);
    });
  });

  describe("once onboarding is done", () => {
    it("bounces the user away from /onboarding", () => {
      expect(getGateRedirect(authed("/onboarding", "done"))).toBe("/");
    });

    it("bounces the user away from nested /onboarding paths", () => {
      expect(getGateRedirect(authed("/onboarding/x", "done"))).toBe("/");
    });

    it("does not redirect the user elsewhere", () => {
      for (const pathname of ["/", "/settings", "/login", "/editor/abc", "/onboardingx"]) {
        expect(getGateRedirect(authed(pathname, "done"))).toBeNull();
      }
    });
  });

  it("fails open when the lookup failed (state unknown)", () => {
    for (const pathname of ["/", "/settings", "/onboarding"]) {
      expect(getGateRedirect(authed(pathname, null))).toBeNull();
    }
  });
});

describe("isProtectedPath", () => {
  it("matches the private areas and /onboarding", () => {
    for (const p of ["/settings", "/settings/x", "/editor/1", "/posts", "/onboarding"]) {
      expect(isProtectedPath(p)).toBe(true);
    }
  });

  it("does not match public paths", () => {
    for (const p of ["/", "/login", "/explore", "/p/1", "/algunusername"]) {
      expect(isProtectedPath(p)).toBe(false);
    }
  });
});
