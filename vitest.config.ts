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
        statements: 55,
        branches: 80,
        functions: 70,
        lines: 55,
      },
    },
  },
});
