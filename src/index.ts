import { collectConfig } from "./prompts.js";
import { scaffold } from "./scaffold.js";

async function main() {
  console.log("\n  Welcome to Schift - The AI Agent Framework\n");

  try {
    const config = await collectConfig();
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
