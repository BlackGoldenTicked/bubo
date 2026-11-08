/**
 * @purpose Configure the bubo marketing site (Next.js App Router).
 * @role    Build/runtime config for the apps/web package.
 * @deps    Next.js 15.
 * @gotcha  Linting runs through the workspace oxlint pass, not next lint. The blog (and its
 *          Velite content pipeline) is not part of this repository, so no content build is
 *          wired in here anymore.
 */

import { join } from "node:path"

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "export",
  // Pin file tracing to the monorepo root so the stray home-dir lockfile is ignored.
  outputFileTracingRoot: join(import.meta.dirname, "..", ".."),
  // @bubo/shared ships TypeScript source; let Next transpile it.
  transpilePackages: ["@bubo/shared"],
  eslint: {
    // The monorepo lints with oxlint at the root; skip Next's bundled ESLint.
    ignoreDuringBuilds: true,
  },
  webpack: (config) => {
    // The verbatim-copied renderer files under appmock/ import via "@mock/*".
    config.resolve.alias = {
      ...config.resolve.alias,
      "@mock": join(import.meta.dirname, "appmock"),
    }
    return config
  },
}

export default nextConfig
