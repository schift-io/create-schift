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
  // In published package: dist/index.js -> ../templates/
  // In dev: src/scaffold.ts -> ../templates/
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

export async function scaffold(
  config: ProjectConfig,
  options: ScaffoldOptions = {},
): Promise<void> {
  const targetDir = options.targetDir ?? path.resolve(process.cwd(), config.name);

  // Check if directory already exists and has contents
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

  // Create .env from .env.example (before global replacement, so .env.example keeps placeholders)
  const envExample = path.join(targetDir, ".env.example");
  const envFile = path.join(targetDir, ".env");
  if (await fs.pathExists(envExample)) {
    const envContent = await fs.readFile(envExample, "utf-8");
    const envProcessed = replacePlaceholders(envContent, vars);
    await fs.writeFile(envFile, envProcessed);
  }

  // Process all files: replace placeholders (skip .env.example to avoid leaking API key)
  const allFiles = await getAllFiles(targetDir);
  for (const filePath of allFiles) {
    if (path.basename(filePath) === ".env.example") continue;
    const content = await fs.readFile(filePath, "utf-8");
    const processed = replacePlaceholders(content, vars);
    if (processed !== content) {
      await fs.writeFile(filePath, processed);
    }
  }

  // Install dependencies
  if (!options.skipInstall) {
    console.log("\n  Installing dependencies...\n");
    execSync("npm install", { cwd: targetDir, stdio: "inherit" });
  }

  console.log(`
  Done! Next steps:
    cd ${config.name}
    npm run dev       # Start local dev server
`);
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
