import { collectConfig, type AuthMode } from "./prompts.js";
import { scaffold } from "./scaffold.js";
import { execSync } from "node:child_process";
import path from "node:path";

interface CliOptions {
  authMode?: AuthMode;
  forceOAuth?: boolean;
}

function parseCliOptions(argv: string[]): CliOptions {
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
  await scaffold(config);

  if (config.template === "cs-chatbot" && config.runOnboardingDeploy !== false) {
    console.log("\n  Running onboarding deploy for cs-chatbot...\n");
    try {
      execSync("npx --yes @schift-io/cli deploy", {
        stdio: "inherit",
        cwd: path.resolve(process.cwd(), config.name),
      });
    } catch {
      console.error(
        "\n  Deploy step failed. Project scaffold is ready. Run `npx --yes @schift-io/cli deploy` in your project.\n",
      );
    }
  }
}

async function main() {
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

if (!process.env.VITEST) {
  main();
}
