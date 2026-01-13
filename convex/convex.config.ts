import { defineApp } from "convex/server";
import agent from "@convex-dev/agent/convex.config.js";
import workflow from "@convex-dev/workflow/convex.config.js";
import workpool from "@convex-dev/workpool/convex.config.js";
import actionCache from "@convex-dev/action-cache/convex.config.js";

const app = defineApp();

// Install all components
app.use(agent);
app.use(workflow);
app.use(workpool, { name: "aiWorkpool" });
app.use(workpool, { name: "impactAnalysisWorkpool" });
app.use(workpool, { name: "perspectiveWorkpool" });
app.use(workpool, { name: "summaryWorkpool" });
app.use(actionCache);

export default app;
