import { collectConfig, type AuthMode } from "./prompts.js";
import { scaffold } from "./scaffold.js";
import { execSync } from "node:child_process";
import path from "node:path";

interface CliOptions {
  authMode?: AuthMode;
  forceOAuth?: boolean;
}

export function parseCliOptions(argv: string[]): CliOptions {
  let authMode: AuthMode | undefined;
  let forceOAuth = false;

  for (const arg of argv) {
    if (arg === "--force-oauth") {
      forceOAuth = true;
      continue;
    }

    if (arg.startsWith("--auth=")) {
      const raw = arg.slice("--auth=".length);
      if (raw === "manual" || raw === "oauth" || raw === "existing") {
        authMode = raw;
      } else {
        throw new Error(`Invalid --auth value: ${raw}. Use manual|oauth|existing.`);
      }
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      console.log("\nUsage: npx create-schift [--auth=manual|oauth|existing] [--force-oauth]\n");
      process.exit(0);
    }
  }

  if (forceOAuth && authMode && authMode !== "oauth") {
    throw new Error("Cannot combine --force-oauth with --auth=manual or --auth=existing");
  }

  return { authMode, forceOAuth };
}

export async function runCreateSchift(argv: string[]) {
  const options = parseCliOptions(argv);
  const config = await collectConfig(options);
  const targetDir = path.resolve(process.cwd(), config.name);
  await scaffold(config, { targetDir });

  if (config.template === "cs-chatbot" && config.runOnboardingDeploy !== false) {
    console.log("\n  Running onboarding deploy for cs-chatbot...\n");
    try {
      execSync("npm run deploy", { cwd: targetDir, stdio: "inherit" });
    } catch {
      console.error("\n  Deploy step failed. Project scaffold is ready. Run `npm run deploy` manually in your project.\n");
    }
  }
}

export async function main() {
  console.log("\n  Welcome to Schift - The AI Agent Framework\n");

  try {
    await runCreateSchift(process.argv.slice(2));
  } catch (err) {
    if ((err as Error).name === "ExitPromptError") {
      console.log("\nAborted.");
      process.exit(0);
    }
    console.error("\nError:", (err as Error).message);
    process.exit(1);
  }
}

