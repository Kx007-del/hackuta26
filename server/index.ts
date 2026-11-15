import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { apiErrorHandler, registerApi } from "../packages/social/server";
import { registerClipApi } from "../packages/social/clips";
import { registerLeaderboardApi } from "../packages/leaderboard/server";
import { registerShowcaseScoring } from "../packages/showcase-scoring/server";
import { registerProgression } from "../packages/progression/server";
import { registerCompetitions } from "../packages/competitions/server";
import { resolveRuntimeConfig } from "./runtime-config";
const { host, port, commit } = resolveRuntimeConfig(process.env);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = express();
app.disable("x-powered-by");
// Render sits behind one proxy hop; trust it so per-client rate limits see the real client address.
if (process.env.RENDER === "true") app.set("trust proxy", 1);
const clips = registerClipApi(app);
app.use(express.json({ limit: "2mb" }));
app.get("/api/health", (_req, res) =>
  res.json({ ok: true, service: "run-it-back", commit }),
);
const cleanup = registerApi(app, { clipLookup: clips.get });
const closeLeaderboard = registerLeaderboardApi(app);
const progression = registerProgression(app);
const competitions = registerCompetitions(app, { identity: progression.identity, revision: commit });
registerShowcaseScoring(app, { progress: progression.scoring, competitions: competitions.scoring });
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
app.use(apiErrorHandler);
const server = app.listen(port, host, () =>
  console.log(`Run It Back ready at http://${host}:${port}`),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () =>
    server.close(() => {
      cleanup();
      closeLeaderboard();
      progression.close();
      competitions.close();
      clips.close();
      process.exit(0);
    }),
  );
