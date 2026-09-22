import { describe, expect, it } from "vitest";
import { welcomeEmail } from "./welcome";

describe("welcomeEmail", () => {
  it("includes the display name in the subject and body", () => {
    const { subject, html } = welcomeEmail({ displayName: "Ana" });
    expect(subject).toContain("Ana");
    expect(html).toContain("Ana");
  });
});
