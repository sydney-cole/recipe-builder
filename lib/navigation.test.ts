import { describe, expect, it } from "vitest";
import { safeAppRedirect } from "./navigation";

describe("safeAppRedirect", () => {
  it.each([
    [null, "/app"],
    ["/app", "/app"],
    ["/app/recipe-book?sort=az", "/app/recipe-book?sort=az"],
    ["/app/discover#results", "/app/discover#results"],
  ])("maps %s to %s", (value, expected) => {
    expect(safeAppRedirect(value)).toBe(expected);
  });

  it.each(["//evil.example", "/application", "https://evil.example/app", "%2Fapp%2Fimports"])(
    "rejects an unsafe redirect: %s",
    (value) => expect(safeAppRedirect(value)).toBe("/app"),
  );
});
