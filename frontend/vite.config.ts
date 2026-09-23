import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const DEFAULT_DEV_PORT = 5273;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.VITE_API_PROXY_TARGET ?? "http://localhost:8000";
  const portFromEnv = Number.parseInt(env.VITE_PORT ?? "", 10);
  const port = Number.isFinite(portFromEnv) && portFromEnv > 0 ? portFromEnv : DEFAULT_DEV_PORT;

  return {
    plugins: [react()],
    server: {
      port,
      // Fail loudly if the chosen port is taken instead of silently bumping
      // to the next free port — keeps the URL predictable when running
      // multiple Vite apps on this machine.
      strictPort: true,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
      },
    },
  };
});
