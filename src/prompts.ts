import { checkbox, confirm, input, select } from "@inquirer/prompts";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export interface ProjectConfig {
  name: string;
  template: string;
  apiKey: string;
  /** Absolute path to local data directory, if user chose local files */
  localDataDir?: string;
  /** Whether user wants to connect Notion later */
  notionLater?: boolean;
  /** Whether user wants to connect Google Drive later */
  gdriveLater?: boolean;
}

export type AuthMode = "manual" | "oauth" | "existing";

export interface CollectConfigOptions {
  authMode?: AuthMode;
  forceOAuth?: boolean;
}

export const TEMPLATES = [
  { name: "cs-chatbot     - Customer support agent with RAG", value: "cs-chatbot" },
  { name: "blank          - Empty agent project", value: "blank" },
] as const;

const DATA_SOURCES = [
  { name: "Local files  - enter path to your documents folder", value: "local" },
  { name: "Notion       - connect at dashboard after deploy", value: "notion" },
  { name: "Google Drive - connect at dashboard after deploy", value: "gdrive" },
  { name: "I'll do it myself later", value: "skip" },
] as const;

interface ApiKeyResolvers {
  envKey: () => string | undefined;
  configKey: () => string | null;
  runOAuthLogin: () => Promise<void>;
  reloadConfigKey: () => string | null;
  log: (message: string) => void;
  confirmUseExisting: (preview: string) => Promise<boolean>;
}

function readStoredConfigApiKey(): string | null {
  const configPath = path.resolve(homedir(), ".schift", "config.json");
  if (!existsSync(configPath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf-8")) as { api_key?: string };
    return parsed.api_key ?? null;
  } catch {
    return null;
  }
}

function isValidApiKey(key: string | null | undefined): key is string {
  return !!key && key.startsWith("sch_") && key.length >= 20;
}

function maskApiKey(key: string): string {
  if (key.length <= 14) return `${key.slice(0, 6)}...`;
  return `${key.slice(0, 10)}...${key.slice(-4)}`;
}

function validateManualApiKey(trimmed: string): string | true {
  if (!trimmed.startsWith("sch_")) return "API key should start with 'sch_'";
  if (trimmed.length < 20) return "API key looks too short.";
  return true;
}

function defaultApiKeyResolvers(): ApiKeyResolvers {
  return {
    envKey: () => process.env.SCHIFT_API_KEY,
    configKey: () => readStoredConfigApiKey(),
    runOAuthLogin: async () => {
      execSync("npx schift auth login", { stdio: "inherit" });
    },
    reloadConfigKey: () => readStoredConfigApiKey(),
    log: (message: string) => console.log(message),
    confirmUseExisting: async (preview: string) => {
      return confirm({
        message: `Found existing key (${preview}). Use this key?`,
        default: true,
      });
    },
  };
}

function getExistingApiKey(resolvers: ApiKeyResolvers): string | null {
  const envKey = resolvers.envKey();
  if (isValidApiKey(envKey)) return envKey;

  const cfgKey = resolvers.configKey();
  if (isValidApiKey(cfgKey)) return cfgKey;

  return null;
}

export async function resolveExistingApiKey(
  resolvers: ApiKeyResolvers = defaultApiKeyResolvers(),
): Promise<string> {
  const existing = getExistingApiKey(resolvers);
  if (!existing) {
    throw new Error("No existing API key found in SCHIFT_API_KEY or ~/.schift/config.json.");
  }

  const useExisting = await resolvers.confirmUseExisting(maskApiKey(existing));
  if (!useExisting) {
    throw new Error("Existing key use cancelled. Choose another authentication method.");
  }

  return existing;
}

export async function resolveApiKey(
  enteredKey: string,
  resolvers: ApiKeyResolvers = defaultApiKeyResolvers(),
  options: { forceOAuth?: boolean } = {},
): Promise<string> {
  const trimmed = enteredKey.trim();
  if (trimmed) {
    const valid = validateManualApiKey(trimmed);
    if (valid !== true) throw new Error(valid);
    return trimmed;
  }

  if (!options.forceOAuth) {
    const existing = getExistingApiKey(resolvers);
    if (existing) {
      const useExisting = await resolvers.confirmUseExisting(maskApiKey(existing));
      if (useExisting) return existing;
    }
  }

  resolvers.log("\nNo API key provided. Starting OAuth login with Schift CLI...\n");
  resolvers.log("1) Browser will open for Schift login");
  resolvers.log("2) Complete login and return to this terminal");
  resolvers.log("3) If browser doesn't open, run: npx schift auth login\n");
  await resolvers.runOAuthLogin();

  const refreshed = resolvers.reloadConfigKey();
  if (isValidApiKey(refreshed)) return refreshed;

  throw new Error('API key is required. Run "schift auth login" and try again.');
}

async function chooseAuthMode(hasExisting: boolean): Promise<AuthMode> {
  return select({
    message: "Authentication method:",
    choices: [
      { name: "Enter API key manually", value: "manual" },
      { name: "Login with OAuth (opens browser)", value: "oauth" },
      {
        name: hasExisting
          ? "Use existing key from environment/config"
          : "Use existing key from environment/config (none found)",
        value: "existing",
      },
    ],
  });
}

export async function collectConfig(options: CollectConfigOptions = {}): Promise<ProjectConfig> {
  if (options.forceOAuth && options.authMode && options.authMode !== "oauth") {
    throw new Error("Cannot combine --force-oauth with --auth=manual or --auth=existing");
  }

  const name = await input({
    message: "Project name:",
    default: "my-agent",
    validate: (v) => {
      if (!v.trim()) return "Project name is required";
      if (!/^[a-z0-9][a-z0-9-]*$/.test(v))
        return "Use lowercase letters (a-z), numbers, and hyphens only.";
      return true;
    },
  });

  const template = await select({
    message: "Template:",
    choices: [...TEMPLATES],
  });

  const resolvers = defaultApiKeyResolvers();
  let selectedAuthMode: AuthMode | undefined = options.forceOAuth
    ? "oauth"
    : options.authMode;

  let apiKey = "";
  while (!apiKey) {
    const hasExisting = !!getExistingApiKey(resolvers);
    const authMode = selectedAuthMode ?? (await chooseAuthMode(hasExisting));

    try {
      if (authMode === "existing") {
        apiKey = await resolveExistingApiKey(resolvers);
      } else if (authMode === "oauth") {
        apiKey = await resolveApiKey("", resolvers, { forceOAuth: true });
      } else {
        const enteredApiKey = await input({
          message: "Schift API key (leave blank to login with OAuth):",
          validate: (v) => {
            const t = v.trim();
            if (!t) return true;
            return validateManualApiKey(t);
          },
        });
        apiKey = await resolveApiKey(enteredApiKey, resolvers);
      }
    } catch (err) {
      if (selectedAuthMode) throw err;
      console.log(`\n${(err as Error).message}\n`);
      selectedAuthMode = undefined;
    }
  }

  const sources = await checkbox({
    message: "Bring your data?",
    choices: [...DATA_SOURCES],
  });

  let localDataDir: string | undefined;
  const notionLater = sources.includes("notion");
  const gdriveLater = sources.includes("gdrive");

  if (sources.includes("local")) {
    localDataDir = await input({
      message: "Path to your documents folder:",
      default: "./data",
    });
  }

  return { name, template, apiKey, localDataDir, notionLater, gdriveLater };
}
