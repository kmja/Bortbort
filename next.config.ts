import type { NextConfig } from "next";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Semver from package.json — the human-friendly version I bump per release. */
function appVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/** Short git SHA of the deployed commit — the ground truth for "am I on the latest?". */
function appCommit(): string {
  // Vercel provides the deployed commit SHA at build time.
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7);
  }
  try {
    return execSync("git rev-parse --short HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "";
  }
}

const nextConfig: NextConfig = {
  // Inlined into the client bundle at build time (see next/dist/docs .../env.md).
  // Reference only as static `process.env.APP_VERSION` / `process.env.APP_COMMIT`.
  env: {
    APP_VERSION: appVersion(),
    APP_COMMIT: appCommit(),
  },
};

export default nextConfig;
