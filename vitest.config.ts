import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // 15 s — WASM warm cost on first call is ~30 ms but cold imports of
    // @rhwp/core can take longer when node first resolves the package.
    testTimeout: 15000,
    // Run each file in its own worker process so the WASM init state
    // doesn't accidentally leak across test files (and so a panic in
    // one test doesn't poison the others).
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: false,
      },
    },
  },
});
