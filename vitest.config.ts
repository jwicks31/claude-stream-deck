import { defineConfig } from "vitest/config";

// Tests cover the pure core modules; src/actions/* (TC39 class decorators)
// only load inside the Stream Deck runtime — vite 8's oxc transform does not
// lower decorators for Node, so tests must not import decorated files.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 15_000,
  },
});
