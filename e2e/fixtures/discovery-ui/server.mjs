import { createServer } from "vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const navigation = fileURLToPath(new URL("./navigation.tsx", import.meta.url));
const server = await createServer({
  configFile: false,
  root,
  server: { host: "127.0.0.1", port: 3202, strictPort: true },
  resolve: { alias: { "@": root + "src", "next/navigation": navigation, "next/link": navigation } },
  plugins: [
    {
      name: "offline-discovery-document",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (!req.url?.startsWith("/admin/discovery")) return next();
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(
            '<!doctype html><html lang="es"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Offline discovery UX</title><div id="root"></div><script type="module" src="/e2e/fixtures/discovery-ui/main.tsx"></script></html>',
          );
        });
      },
    },
  ],
});
await server.listen();
