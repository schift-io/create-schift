import { collectConfig, type AuthMode } from "./prompts.js";
import { scaffold } from "./scaffold.js";

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

async function main() {
  console.log("\n  Welcome to Schift - The AI Agent Framework\n");

  try {
    const options = parseCliOptions(process.argv.slice(2));
    const config = await collectConfig(options);
    await scaffold(config);
  } catch (err) {
    if ((err as Error).name === "ExitPromptError") {
      console.log("\nAborted.");
      process.exit(0);
    }
    console.error("\nError:", (err as Error).message);
    process.exit(1);
  }
}

main();
