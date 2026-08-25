import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.json" with { type: "json" };
import pkg from "./package.json" with { type: "json" };

export default defineConfig({
  plugins: [crx({ manifest })],
  // 把版本号注入为全局常量,UI 单一数据源(取自 package.json)
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: { rollupOptions: { input: { tab: "src/tab/tab.html" } } },
});
