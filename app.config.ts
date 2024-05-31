import { defineConfig } from "@solidjs/start/config";

export default defineConfig({
    server: {
        preset: "./preset",
        rollupConfig: {
            external: ["__STATIC_CONTENT_MANIFEST", "node:async_hooks"]
        },

    }
});
