import agentmail from "@agentmail/convex/convex.config";
import agent from "@convex-dev/agent/convex.config";
import workflow from "@convex-dev/workflow/convex.config";
import { defineApp } from "convex/server";

const app = defineApp({});

app.use(agentmail);
app.use(agent);
app.use(workflow);

export default app;
