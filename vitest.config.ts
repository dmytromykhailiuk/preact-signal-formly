import { resolve } from "node:path";
import preact from "@preact/preset-vite";
import { defineConfig } from "vitest/config";

// The base library is linked via file: and carries its own node_modules copy of
// preact/@preact/signals. Everything must resolve to OUR copies, otherwise hooks
// and signals integration break (two Preact instances).
const own = (pkg: string) => resolve(__dirname, "node_modules", pkg);

export default defineConfig({
  plugins: [preact()],
  resolve: {
    dedupe: ["preact", "preact/hooks", "@preact/signals", "@preact/signals-core"],
    alias: [
      { find: /^preact$/, replacement: own("preact") },
      { find: /^preact\/hooks$/, replacement: own("preact/hooks") },
      { find: /^preact\/jsx-runtime$/, replacement: own("preact/jsx-runtime") },
      { find: /^@preact\/signals$/, replacement: own("@preact/signals") },
      { find: /^@preact\/signals\/utils$/, replacement: own("@preact/signals/utils") },
      { find: /^@preact\/signals-core$/, replacement: own("@preact/signals-core") },
    ],
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["tests/**/*.{test,spec}.{ts,tsx}", "src/**/*.{test,spec}.{ts,tsx}"],
    setupFiles: [],
  },
});
