import { AgentMail } from "@agentmail/convex";
import { components, internal } from "../_generated/api";

export const agentmail: AgentMail = new AgentMail(components.agentmail, {
  onMessageReceived: internal.email.onMessageReceived,
});
