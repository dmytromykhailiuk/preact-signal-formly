import { resolve } from "node:path";
import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

const own = (pkg: string) => resolve(__dirname, "node_modules", pkg);

// Dev-only config to run the live playground at src/playground.
// Usage: npm run playground
export default defineConfig({
  root: "src/playground",
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
  server: { open: true, port: 5200 },
});
