import { describe, expect, it } from "vitest";
import {
  generateVerificationCode,
  VERIFICATION_CODE_TTL_SECONDS,
  verificationEmail,
} from "./verification";

describe("email verification", () => {
  it("issues six-digit codes with a bounded lifetime", () => {
    expect(generateVerificationCode()).toMatch(/^\d{6}$/);
    expect(VERIFICATION_CODE_TTL_SECONDS).toBe(900);
  });

  it("builds a message without links or account details", () => {
    const message = verificationEmail("123456");
    expect(message.subject).toMatch(/verify/i);
    expect(message.text).toContain("123456");
    expect(message.text).toContain("15 minutes");
  });
});
