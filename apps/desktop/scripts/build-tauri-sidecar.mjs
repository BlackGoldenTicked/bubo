#!/usr/bin/env node
/**
 * @purpose Package bubo's Node data process using Tauri's target-specific sidecar naming.
 * @role    Build-time bridge from Rust host triples to the @yao-pkg/pkg JavaScript CLI.
 * @deps    rustc, pnpm, @yao-pkg/pkg, and the prebuilt dist-sidecar/index.cjs entry.
 * @gotcha  Build on the matching runner; invoke pkg through Node, not Windows command shims.
 */

import { execFileSync } from "node:child_process"
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = dirname(fileURLToPath(import.meta.url))
const desktopDir = join(scriptDir, "..")
const require = createRequire(import.meta.url)

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}

function main() {
  const targetTriple = execFileSync("rustc", ["--print", "host-tuple"], {
    encoding: "utf8",
  }).trim()
  const { output, outputDir, pkgArgs } = sidecarBuildSpec(targetTriple)

  mkdirSync(outputDir, { recursive: true })
  execFileSync(process.execPath, pkgArgs, { cwd: desktopDir, stdio: "inherit" })

  console.log(`Built Tauri sidecar: ${output}`)
  refreshDevCopy(output, targetTriple)
}

/**
 * `tauri dev` spawns `src-tauri/target/debug/bubo-sidecar`, and tauri-build only
 * copies it when the Rust build actually runs. Editing only TypeScript leaves that
 * copy stale, so the app talks to an old sidecar ("No procedure found on path …").
 * Refresh the dev copy here every time the packaged sidecar is rebuilt.
 */
function refreshDevCopy(output, targetTriple) {
  const extension = targetTriple.includes("windows") ? ".exe" : ""
  const debugDir = join(desktopDir, "src-tauri", "target", "debug")
  if (!existsSync(debugDir)) return

  const destination = join(debugDir, `bubo-sidecar${extension}`)
  // Write-then-rename: overwriting the inode that a running dev sidecar was spawned
  // from leaves the kernel's code-signature cache stale, and the next exec dies with
  // SIGKILL (exit 137) without printing anything. A rename swaps in a fresh inode.
  const staging = `${destination}.new`
  copyFileSync(output, staging)
  chmodSync(staging, 0o755)
  renameSync(staging, destination)
  console.log(`Refreshed dev sidecar: ${destination}`)
}

export function sidecarBuildSpec(targetTriple, nodeVersion = process.versions.node) {
  const pkgTarget = pkgTargetFor(targetTriple, nodeVersion)
  const extension = targetTriple.includes("windows") ? ".exe" : ""
  const outputDir = join(desktopDir, "src-tauri", "binaries")
  const output = join(outputDir, `bubo-sidecar-${targetTriple}${extension}`)

  return {
    output,
    outputDir,
    pkgArgs: [
      resolvePkgCli(),
      "dist-sidecar/index.cjs",
      "--config",
      "pkg.sidecar.config.cjs",
      "--target",
      pkgTarget,
      "--output",
      output,
    ],
  }
}

export function pkgTargetFor(triple, nodeVersion = process.versions.node) {
  const architecture = triple.startsWith("aarch64-")
    ? "arm64"
    : triple.startsWith("x86_64-")
      ? "x64"
      : null
  const platform = triple.includes("apple-darwin")
    ? "macos"
    : triple.includes("pc-windows")
      ? "win"
      : triple.includes("unknown-linux-gnu")
        ? "linux"
        : null

  if (!architecture || !platform) {
    throw new Error(`Unsupported Tauri sidecar target: ${triple}`)
  }
  if (Number(nodeVersion.split(".")[0]) !== 22) {
    throw new Error(`bubo sidecars must be built with Node 22; found ${nodeVersion}`)
  }
  return `node22-${platform}-${architecture}`
}

function resolvePkgCli() {
  const packageJsonPath = require.resolve("@yao-pkg/pkg/package.json")
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"))
  const binPath = typeof packageJson.bin === "string" ? packageJson.bin : packageJson.bin?.pkg

  if (!binPath) throw new Error("@yao-pkg/pkg does not expose the pkg CLI")
  return resolve(dirname(packageJsonPath), binPath)
}
