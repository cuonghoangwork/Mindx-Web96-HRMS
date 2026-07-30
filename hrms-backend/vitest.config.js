import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    hookTimeout: 120_000,
    testTimeout: 30_000,
    pool: "forks",
    reporters: ["verbose"],
  },
  poolOptions: {
    forks: { singleFork: true },
  },
});
