import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Integration tests download a MongoDB binary on first run — give them room.
    hookTimeout: 120_000,
    testTimeout: 30_000,
    // Run test files sequentially so shared in-memory DB ports don't collide.
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
    reporters: ["verbose"],
  },
});
