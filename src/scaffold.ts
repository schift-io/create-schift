import fs from "fs-extra";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import type { ProjectConfig } from "./prompts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface ScaffoldOptions {
  targetDir?: string;
  skipInstall?: boolean;
}

/** Resolve templates directory (works in both dev and published mode). */
function getTemplatesDir(): string {
  const fromDist = path.resolve(__dirname, "..", "templates");
  const fromSrc = path.resolve(__dirname, "..", "..", "templates");
  if (fs.existsSync(fromDist)) return fromDist;
  if (fs.existsSync(fromSrc)) return fromSrc;
  throw new Error("Templates directory not found");
}

/** Replace all {{VAR}} placeholders in a string. */
function replacePlaceholders(
  content: string,
  vars: Record<string, string>,
): string {
  let result = content;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

function writeSchiftConfig(targetDir: string, config: ProjectConfig): void {
  const schiftConfig: Record<string, unknown> = {
    name: config.name,
    agent: {
      name: config.name,
      model: "gpt-4o-mini",
      instructions: "You are a helpful AI assistant.",
    },
  };

  if (config.localDataDir) {
    schiftConfig.rag = {
      bucket: `${config.name}-docs`,
      dataDir: config.localDataDir,
    };
  }

  const integrations: Record<string, string> = {};
  if (config.notionLater) integrations.notion = "pending";
  if (config.gdriveLater) integrations["google-drive"] = "pending";
  if (Object.keys(integrations).length > 0) {
    schiftConfig.integrations = integrations;
  }

  fs.writeJsonSync(
    path.join(targetDir, "schift.config.json"),
    schiftConfig,
    { spaces: 2 },
  );
}

export async function scaffold(
  config: ProjectConfig,
  options: ScaffoldOptions = {},
): Promise<void> {
  const targetDir = options.targetDir ?? path.resolve(process.cwd(), config.name);

  if (await fs.pathExists(targetDir)) {
    const files = await fs.readdir(targetDir);
    if (files.length > 0) {
      throw new Error(`Directory "${config.name}" already exists and is not empty`);
    }
  }

  const templatesDir = getTemplatesDir();
  const templateDir = path.join(templatesDir, config.template);

  if (!(await fs.pathExists(templateDir))) {
    throw new Error(`Template "${config.template}" not found`);
  }

  const vars: Record<string, string> = {
    PROJECT_NAME: config.name,
    API_KEY: config.apiKey,
  };

  // Copy template to target
  await fs.copy(templateDir, targetDir);

  // Create .env from .env.example
  const envExample = path.join(targetDir, ".env.example");
  const envFile = path.join(targetDir, ".env");
  if (await fs.pathExists(envExample)) {
    const envContent = await fs.readFile(envExample, "utf-8");
    const envProcessed = replacePlaceholders(envContent, vars);
    await fs.writeFile(envFile, envProcessed);
  }

  // Process all files: replace placeholders (skip .env.example)
  const allFiles = await getAllFiles(targetDir);
  for (const filePath of allFiles) {
    if (path.basename(filePath) === ".env.example") continue;
    const content = await fs.readFile(filePath, "utf-8");
    const processed = replacePlaceholders(content, vars);
    if (processed !== content) {
      await fs.writeFile(filePath, processed);
    }
  }

  // Write schift.config.json (for `schift deploy`)
  writeSchiftConfig(targetDir, config);

  // Create data dir if specified and doesn't exist
  if (config.localDataDir) {
    const absDataDir = path.isAbsolute(config.localDataDir)
      ? config.localDataDir
      : path.resolve(targetDir, config.localDataDir);
    if (!fs.existsSync(absDataDir)) {
      await fs.ensureDir(absDataDir);
      await fs.writeFile(
        path.join(absDataDir, ".gitkeep"),
        "Place your documents here. Schift will upload them on deploy.\n",
      );
    }
  }

  // Install dependencies
  if (!options.skipInstall) {
    console.log("\n  Installing dependencies...\n");
    try {
      execSync("npm install", { cwd: targetDir, stdio: "inherit" });
    } catch {
      console.error(`
  npm install failed. The project was scaffolded at:
    ${targetDir}

  To retry manually:
    cd ${config.name}
    npm install
`);
      return;
    }
  }

  // Next steps
  console.log(`
  Done! Next steps:

    cd ${config.name}`);

  if (config.localDataDir) {
    console.log(`    # Add your documents to ${config.localDataDir}/`);
    console.log(`    schift deploy          # uploads data & deploys agent`);
  } else {
    console.log(`    npm run dev            # start local dev server`);
    console.log(`    schift deploy          # deploy to Schift Cloud`);
  }

  if (config.notionLater || config.gdriveLater) {
    console.log(`\n  Connect data sources at: https://schift.io/app`);
    if (config.notionLater) console.log(`    - Notion`);
    if (config.gdriveLater) console.log(`    - Google Drive`);
  }

  console.log();
}

/** Recursively get all file paths in a directory. */
async function getAllFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    if (entry.isDirectory()) {
      files.push(...(await getAllFiles(fullPath)));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}
