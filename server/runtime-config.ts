/** Resolve only public runtime settings; importing this module has no side effects. */
export function resolveRuntimeConfig(
  env: Record<string, string | undefined>,
): { host: string; port: number; commit: string | null } {
  const host = env.HOST?.trim() || (env.RENDER === "true" ? "0.0.0.0" : "127.0.0.1");
  const configuredPort = env.PORT?.trim() ?? "";
  const port = configuredPort === "" ? 5173 : Number(configuredPort);
  if (
    (configuredPort !== "" && !/^[0-9]+$/.test(configuredPort)) ||
    !Number.isInteger(port) ||
    port < 0 ||
    port > 65535
  ) {
    throw new Error("PORT must contain only ASCII digits and be an integer from 0 through 65535.");
  }
  const configuredCommit = env.RENDER_GIT_COMMIT?.trim() ?? "";
  const commit = /^[0-9a-fA-F]{40}$/.test(configuredCommit)
    ? configuredCommit.toLowerCase()
    : null;
  return { host, port, commit };
}
