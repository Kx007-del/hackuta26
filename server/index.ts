import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerApi } from "../packages/social/server";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));
app.get("/api/health", (_req, res) =>
  res.json({ ok: true, service: "run-it-back" }),
);
const cleanup = registerApi(app);
app.use("/api", (_req, res) =>
  res.status(404).json({ error: "Unknown API route" }),
);
if (process.argv.includes("--production")) {
  app.use(express.static(path.join(root, "dist")));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(path.join(root, "dist/index.html")),
  );
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    root,
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
app.use((error: any, _req: any, res: any, _next: any) => {
  console.error(error.message);
  res
    .status(error.status === 413 ? 413 : 500)
    .json({
      error:
        error.status === 413
          ? "Replay is too large. Try a shorter attempt."
          : "Something went wrong. Please retry.",
    });
});
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || "127.0.0.1";
const server = app.listen(port, host, () =>
  console.log(`Run It Back ready at http://${host}:${port}`),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () =>
    server.close(() => {
      cleanup();
      process.exit(0);
    }),
  );
