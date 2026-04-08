import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      include: ["src/scaffold.ts"],
      exclude: ["src/__tests__/**"],
    },
  },
});
