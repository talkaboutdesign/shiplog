import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
    // Include both convex/ and _tests/ directories
    include: ["convex/**/*.test.ts", "_tests/**/*.test.ts"],
  },
});
