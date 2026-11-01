import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const configuredProxyTarget = env.VITE_API_PROXY_TARGET || "http://127.0.0.1:5000";
  let apiProxyTarget;

  try {
    const targetUrl = new URL(configuredProxyTarget);
    if (!["http:", "https:"].includes(targetUrl.protocol)) throw new Error("Unsupported protocol");
    apiProxyTarget = targetUrl.origin;
  } catch {
    throw new Error("VITE_API_PROXY_TARGET must be a valid HTTP or HTTPS backend origin.");
  }

  return {
    base: "/",
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      port: 5173,
      host: "0.0.0.0",
      proxy: {
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: false,
          ws: true,
          timeout: 30000,
          proxyTimeout: 30000,
          configure: (proxy) => {
            proxy.on("error", (error, req, res) => {
              console.error("[vite proxy] API proxy error", req?.url, `target=${apiProxyTarget}`, error?.code || error?.message || error);
              if (res && !res.headersSent && !res.destroyed) {
                res.writeHead(502, { "Content-Type": "application/json" });
                res.end(JSON.stringify({
                  success: false,
                  message: `Unable to reach the backend API at ${apiProxyTarget}. Check that the backend is running and the proxy target is correct.`,
                }));
              }
            });
          },
        },
      },
    },
  };
});
