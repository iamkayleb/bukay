import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["__tests__/**/*.test.ts", "__tests__/**/*.test.tsx", "test/**/*.test.ts"],
    testTimeout: 120_000,
    coverage: {
      provider: "v8",
      include: ["app/lib/availability.ts"],
      reporter: ["text", "text-summary"],
      thresholds: {
        branches: 95,
        lines: 95,
        functions: 95,
        statements: 95,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
