import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        test: {
          name: "shared",
          root: "packages/shared",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "server",
          root: "apps/server",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        extends: "apps/client/vite.config.ts",
        test: {
          name: "client",
          root: "apps/client",
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
          setupFiles: ["./src/test-setup.ts"],
        },
      },
    ],
  },
});
