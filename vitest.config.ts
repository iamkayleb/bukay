import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: [
      "__tests__/**/*.test.ts",
      "__tests__/**/*.test.tsx",
      "__tests__/**/*.bench.ts",
      "test/**/*.test.ts",
    ],
    testTimeout: 120_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
