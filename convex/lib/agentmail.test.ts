import {
  verifyAgentMailWebhook,
  WebhookVerificationError,
} from "@agentmail/convex";
import { describe, expect, it } from "vitest";

describe("AgentMail webhook boundary", () => {
  it("rejects an inbound payload without a valid webhook signature", () => {
    expect(() => verifyAgentMailWebhook("whsec_test", "{}", {})).toThrow(
      WebhookVerificationError,
    );
  });
});
