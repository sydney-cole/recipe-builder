import { describe, expect, it } from "vitest";
import {
  firecrawlAgentMaxCredits,
  withFirecrawlMaxCredits,
} from "./firecrawlAgent";

describe("firecrawlAgentMaxCredits", () => {
  it("uses the team-safe 500-credit default", () => {
    expect(firecrawlAgentMaxCredits(undefined)).toBe(500);
    expect(firecrawlAgentMaxCredits("  ")).toBe(500);
  });

  it("accepts a lower deployment-specific ceiling", () => {
    expect(firecrawlAgentMaxCredits("100")).toBe(100);
  });

  it.each(["0", "-1", "1.5", "2501", "not-a-number"])(
    "rejects the unsafe value %s",
    (value) => {
      expect(() => firecrawlAgentMaxCredits(value)).toThrow(
        "FIRECRAWL_AGENT_MAX_CREDITS must be a whole number from 1 to 2500",
      );
    },
  );
});
describe("withFirecrawlMaxCredits", () => {
  it("adds the configured maximum to an agent request", () => {
    expect(
      withFirecrawlMaxCredits(
        {
          prompt: "Find three complete recipes",
          urls: ["https://example.com/recipes"],
          effort: "low",
        },
        "500",
      ),
    ).toEqual({
      prompt: "Find three complete recipes",
      urls: ["https://example.com/recipes"],
      effort: "low",
      maxCredits: 500,
    });
  });
});
