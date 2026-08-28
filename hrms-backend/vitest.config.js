import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    hookTimeout: 120_000,
    testTimeout: 30_000,
    // Vitest 4 removed poolOptions.forks.singleFork in favor of maxWorkers
    // (isolate stays on — a separate setting that would break cross-test
    // module isolation, per the same finding in hrms-react/vite.config.js).
    pool: "forks",
    maxWorkers: 1,
    reporters: ["verbose"],
  },
});
