#!/usr/bin/env node
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

const USAGE = `Usage:
  droplet make auth <dir> [--force]

Commands:
  make auth <dir>   Create a standalone Droplet Auth app from the packaged template.

Options:
  --force           Replace an existing target directory.
  -h, --help        Show this help text.`;

async function main(args: string[]): Promise<void> {
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(USAGE);
    return;
  }

  const [command, type, targetArg, ...rest] = args;
  if (command !== "make" || type !== "auth" || !targetArg) {
    throw new CliError(USAGE);
  }

  const unknown = rest.filter((arg) => arg !== "--force");
  if (unknown.length > 0) {
    throw new CliError(`Unknown option: ${unknown[0]}\n\n${USAGE}`);
  }

  await makeAuth(targetArg, { force: rest.includes("--force") });
}

async function makeAuth(targetArg: string, options: { force: boolean }): Promise<void> {
  const packageRoot = new URL("..", import.meta.url).pathname;
  const templateDir = join(packageRoot, "templates/auth");
  const targetDir = resolve(process.cwd(), targetArg);
  const projectName = toPackageName(basename(targetDir));

  if (!(await exists(templateDir))) {
    throw new CliError(`Auth template not found at ${templateDir}. Reinstall @whnvr/droplet and try again.`);
  }

  if (await exists(targetDir)) {
    if (!options.force) {
      const entries = await readdir(targetDir).catch(() => []);
      if (entries.length > 0) {
        throw new CliError(`Target directory is not empty: ${targetDir}\nUse --force to replace it.`);
      }
    } else {
      await rm(targetDir, { recursive: true, force: true });
    }
  }

  await copyTemplate(templateDir, targetDir, { projectName });

  console.log(`Created Droplet Auth app in ${targetDir}`);
  console.log(`\nNext steps:\n  cd ${targetArg}\n  bun install\n  cp .env.example .env\n  bun run setup:print\n  bun alchemy plan ./alchemy.run.ts`);
}

async function copyTemplate(from: string, to: string, replacements: { projectName: string }): Promise<void> {
  const entryStat = await stat(from);
  if (entryStat.isDirectory()) {
    await mkdir(to, { recursive: true });
    const entries = (await readdir(from)).sort();
    for (const entry of entries) {
      await copyTemplate(join(from, entry), join(to, entry), replacements);
    }
    return;
  }

  await mkdir(dirname(to), { recursive: true });
  if (isTextFile(from)) {
    const text = await readFile(from, "utf8");
    await writeFile(to, text.replaceAll("{{projectName}}", replacements.projectName));
  } else {
    await writeFile(to, await readFile(from));
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function isTextFile(path: string): boolean {
  return /\.(css|html|js|json|jsonc|md|mjs|ts|tsx|txt|yml|yaml|toml|webmanifest)$/.test(path) || basename(path).startsWith(".");
}

function toPackageName(value: string): string {
  const name = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .replace(/-{2,}/g, "-");
  return name || "droplet-auth";
}

class CliError extends Error {}

main(process.argv.slice(2)).catch((error) => {
  if (error instanceof CliError) {
    console.error(error.message);
    process.exit(1);
  }
  console.error(error);
  process.exit(1);
});
