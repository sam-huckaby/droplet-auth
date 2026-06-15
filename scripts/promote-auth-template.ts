import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const sourceDir = join(root, "packages/auth-app");
const templateDir = join(root, "packages/droplet/templates/auth");
const dropletPackagePath = join(root, "packages/droplet/package.json");
const alchemyPackagePath = join(root, "repos/alchemy/packages/alchemy/package.json");
const effectPackagePath = join(root, "repos/effect/packages/effect/package.json");
const effectPlatformBunPackagePath = join(root, "repos/effect/packages/platform-bun/package.json");
const effectPlatformNodePackagePath = join(root, "repos/effect/packages/platform-node/package.json");

const includeEntries = [
  ".env.example",
  "README.md",
  "alchemy.run.ts",
  "package.json",
  "tsconfig.json",
  "vitest.config.ts",
  "src",
  "scripts",
  "tests",
  "examples",
  "favicon_io",
  "orange_droplet.png",
];

const excludedNames = new Set([
  "node_modules",
  "dist",
  ".alchemy",
  ".wrangler",
  "coverage",
  ".DS_Store",
]);

const forbiddenStrings = [
  "workspace:",
  "catalog:",
  "../../repos",
  "../droplet",
  "@whnvr/droplet-auth-app",
  "packages/auth-app",
  "packages/droplet",
];

await rm(templateDir, { recursive: true, force: true });
await mkdir(templateDir, { recursive: true });

for (const entry of includeEntries) {
  await copyEntry(join(sourceDir, entry), join(templateDir, entry));
}

await writeJson(join(templateDir, "package.json"), await makeTemplatePackageJson());
await writeJson(join(templateDir, "tsconfig.json"), makeTemplateTsconfig());
await rewriteReadme();
await validateTemplate();

console.log(`Promoted auth template to ${relative(root, templateDir)}`);

async function copyEntry(from: string, to: string): Promise<void> {
  let entryStat: Awaited<ReturnType<typeof stat>>;
  try {
    entryStat = await stat(from);
  } catch {
    return;
  }

  if (entryStat.isDirectory()) {
    if (excludedNames.has(basename(from))) return;
    await mkdir(to, { recursive: true });
    const entries = (await readdir(from)).sort();
    for (const entry of entries) {
      if (shouldExclude(entry)) continue;
      await copyEntry(join(from, entry), join(to, entry));
    }
    return;
  }

  if (shouldExclude(basename(from))) return;

  await mkdir(dirname(to), { recursive: true });
  const file = Bun.file(from);
  if (isTextFile(from)) {
    const text = await file.text();
    await Bun.write(to, normalizeNewlines(text));
  } else {
    await Bun.write(to, await file.arrayBuffer());
  }
}

function shouldExclude(name: string): boolean {
  if (excludedNames.has(name)) return true;
  if (name === ".env.example") return false;
  if (name === ".env" || name.startsWith(".env.")) return true;
  return false;
}

function isTextFile(path: string): boolean {
  return /\.(css|html|js|json|jsonc|md|mjs|ts|tsx|txt|yml|yaml|toml|webmanifest)$/.test(path) || basename(path).startsWith(".");
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

async function makeTemplatePackageJson(): Promise<Record<string, unknown>> {
  const dropletPackage = await readJson<{ version: string }>(dropletPackagePath);
  const alchemyPackage = await readJson<{ version: string }>(alchemyPackagePath);
  const effectPackage = await readJson<{ version: string }>(effectPackagePath);
  const effectPlatformBunPackage = await readJson<{ version: string }>(effectPlatformBunPackagePath);
  const effectPlatformNodePackage = await readJson<{ version: string }>(effectPlatformNodePackagePath);

  return {
    name: "{{projectName}}",
    private: true,
    type: "module",
    dependencies: {
      "@simplewebauthn/browser": "latest",
      "@simplewebauthn/server": "latest",
      "@whnvr/droplet": dropletPackage.version,
      "@effect/platform-bun": effectPlatformBunPackage.version,
      "@effect/platform-node": effectPlatformNodePackage.version,
      alchemy: alchemyPackage.version,
      effect: effectPackage.version,
      jose: "latest",
    },
    devDependencies: {
      "@cloudflare/vitest-pool-workers": "latest",
      "@cloudflare/workers-types": "latest",
      "@types/bun": "latest",
      "@types/node": "latest",
      typescript: "latest",
      vitest: "latest",
      wrangler: "latest",
    },
    scripts: {
      check: "bunx tsc --noEmit",
      test: "vitest run",
      "generate:key": "bun ./scripts/generate-auth-key.ts",
      "setup:print": "bun ./scripts/print-setup.ts",
      deploy: "bun alchemy deploy ./alchemy.run.ts",
      destroy: "bun alchemy destroy ./alchemy.run.ts",
    },
  };
}

function makeTemplateTsconfig(): Record<string, unknown> {
  return {
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "Bundler",
      lib: ["ES2022", "WebWorker"],
      strict: true,
      skipLibCheck: true,
      allowSyntheticDefaultImports: true,
      forceConsistentCasingInFileNames: true,
      noEmit: true,
      types: ["@cloudflare/workers-types/2023-07-01", "node", "bun"],
      allowImportingTsExtensions: true,
    },
    include: ["alchemy.run.ts", "src/**/*.ts", "tests/**/*.ts", "examples/**/*.ts", "scripts/**/*.ts", "vitest.config.ts"],
  };
}

async function rewriteReadme(): Promise<void> {
  const readmePath = join(templateDir, "README.md");
  const readme = await Bun.file(readmePath).text();
  const rewritten = readme
    .replaceAll("packages/auth-app/.env.example", ".env.example")
    .replaceAll("packages/auth-app/.env", ".env")
    .replaceAll("bun run --cwd packages/auth-app generate:key", "bun run generate:key")
    .replaceAll("bun run --cwd packages/auth-app setup:print", "bun run setup:print")
    .replaceAll("bun run --cwd packages/auth-app deploy", "bun run deploy")
    .replaceAll(
      "bun run --cwd packages/auth-app alchemy deploy ./examples/protected-worker/alchemy.run.ts",
      "bun run --cwd examples/protected-worker alchemy deploy ./alchemy.run.ts",
    );
  await Bun.write(readmePath, normalizeNewlines(rewritten));
}

async function validateTemplate(): Promise<void> {
  const files = await listFiles(templateDir);
  const failures: string[] = [];

  for (const file of files) {
    if (!isTextFile(file)) continue;
    const text = await Bun.file(file).text();
    for (const forbidden of forbiddenStrings) {
      if (text.includes(forbidden)) {
        failures.push(`${relative(root, file)} contains ${JSON.stringify(forbidden)}`);
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(`Generated auth template contains forbidden monorepo references:\n${failures.join("\n")}`);
  }
}

async function listFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(path));
    } else {
      files.push(path);
    }
  }
  return files;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await Bun.file(path).text()) as T;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await Bun.write(path, `${JSON.stringify(value, null, 2)}\n`);
}
