import { defineApp } from "convex/server";
import actionCache from "@convex-dev/action-cache/convex.config.js";

const app = defineApp();

// Install components
app.use(actionCache);

export default app;
