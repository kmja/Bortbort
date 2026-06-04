import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// The lib modules `import "server-only"`, which throws outside a server bundle.
// Alias it (and client-only) to an empty stub so pure logic can be unit-tested.
const stub = fileURLToPath(new URL("./test/empty-module.ts", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "server-only": stub,
      "client-only": stub,
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
