import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: { "@": projectRoot },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["components/**/*.tsx", "convex/**/*.ts", "lib/**/*.ts"],
      exclude: ["convex/_generated/**", "convex/seed.ts", "lib/data/mock-data.ts"],
      thresholds: {
        // Vitest 5/V8 counts JSX and generated function branches more
        // precisely than Vitest 3. Keep each floor just below the audited
        // baseline so coverage regressions fail CI without retaining the old,
        // incompatible branch metric.
        statements: 70,
        branches: 60,
        functions: 75,
        lines: 70,
      },
    },
  },
});
