import { checkbox, confirm, input, select } from "@inquirer/prompts";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
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
  /** Whether to run onboarding deploy after scaffold (cs-chatbot only) */
  runOnboardingDeploy?: boolean;
}

export type AuthMode = "manual" | "oauth" | "existing";

export interface CollectConfigOptions {
  authMode?: AuthMode;
  forceOAuth?: boolean;
}

export const TEMPLATES = [
  {
    name: "managed-agent  - Cloud-managed agent with RAG (recommended)",
    value: "managed-agent",
  },
  {
    name: "cs-chatbot     - Customer support agent with RAG",
    value: "cs-chatbot",
  },
  { name: "blank          - Empty agent project", value: "blank" },
] as const;

const DATA_SOURCES = [
  {
    name: "Local files  - enter path to your documents folder",
    value: "local",
  },
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

const CONFIG_DIR = path.resolve(homedir(), ".schift");
const CONFIG_PATH = path.resolve(CONFIG_DIR, "config.json");
const DEFAULT_WEB_URL = "https://schift.io";

function readStoredConfigApiKey(): string | null {
  if (!existsSync(CONFIG_PATH)) return null;
  try {
    const parsed = JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as {
      api_key?: string;
    };
    return parsed.api_key ?? null;
  } catch {
    return null;
  }
}

function saveStoredConfigApiKey(apiKey: string): void {
  let config: Record<string, unknown> = {};
  if (existsSync(CONFIG_PATH)) {
    try {
      config = JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as Record<
        string,
        unknown
      >;
    } catch {
      config = {};
    }
  }
  config.api_key = apiKey;
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
  chmodSync(CONFIG_PATH, 0o600);
}

function getWebUrl(): string {
  return process.env.SCHIFT_WEB_URL || DEFAULT_WEB_URL;
}

/* v8 ignore next -- thin browser runtime wiring */
function openBrowser(url: string): void {
  const platform = process.platform;
  if (platform === "darwin") {
    execFileSync("open", [url], { stdio: "ignore" });
    return;
  }
  if (platform === "win32") {
    execFileSync("cmd", ["/c", "start", "", url], { stdio: "ignore" });
    return;
  }
  execFileSync("xdg-open", [url], { stdio: "ignore" });
}

/* v8 ignore next -- browser/server OAuth orchestration */
async function runBuiltInOAuthLogin(): Promise<void> {
  const state = randomBytes(16).toString("hex");
  const webUrl = getWebUrl();

  const apiKey = await new Promise<string>((resolveKey, reject) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const reqUrl = new URL(req.url || "/", `http://127.0.0.1:${port}`);
      if (reqUrl.pathname !== "/callback") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const receivedState = reqUrl.searchParams.get("state");
      const token = reqUrl.searchParams.get("token");
      const error = reqUrl.searchParams.get("error");

      if (error) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          `<html><body><h2>Login failed</h2><p>${error}</p></body></html>`,
        );
        clearTimeout(timeout);
        server.close();
        reject(new Error(error));
        return;
      }

      if (receivedState !== state) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end("<html><body><h2>State mismatch</h2></body></html>");
        return;
      }

      if (!token || !token.startsWith("sch_")) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end("<html><body><h2>Invalid token</h2></body></html>");
        return;
      }

      // Redirect browser back to schift.io (avoids leaving user on localhost)
      const returnUrl = `${webUrl}/auth/cli?status=success`;
      res.writeHead(302, { Location: returnUrl });
      res.end();
      clearTimeout(timeout);
      server.close();
      resolveKey(token);
    });

    const timeout = setTimeout(
      () => {
        server.close();
        reject(new Error("Login timed out after 5 minutes"));
      },
      5 * 60 * 1000,
    );

    let port = 0;
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        clearTimeout(timeout);
        server.close();
        reject(new Error("Could not bind local callback server"));
        return;
      }

      port = address.port;
      const authUrl = `${webUrl}/auth/cli?port=${port}&state=${state}`;
      console.log(`\nOpen this URL if browser does not launch:\n${authUrl}\n`);
      try {
        openBrowser(authUrl);
      } catch {
        // no-op
      }
    });
  });

  saveStoredConfigApiKey(apiKey);
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

/* v8 ignore start */
function defaultApiKeyResolvers(): ApiKeyResolvers {
  return {
    envKey: () => process.env.SCHIFT_API_KEY,
    configKey: () => readStoredConfigApiKey(),
    runOAuthLogin: async () => {
      await runBuiltInOAuthLogin();
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
/* v8 ignore stop */

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
    throw new Error(
      "No existing API key found in SCHIFT_API_KEY or ~/.schift/config.json.",
    );
  }

  const useExisting = await resolvers.confirmUseExisting(maskApiKey(existing));
  if (!useExisting) {
    throw new Error(
      "Existing key use cancelled. Choose another authentication method.",
    );
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
      const useExisting = await resolvers.confirmUseExisting(
        maskApiKey(existing),
      );
      if (useExisting) return existing;
    }
  }

  resolvers.log(
    "\nNo API key provided. Starting OAuth login with Schift CLI...\n",
  );
  resolvers.log("1) Browser will open for Schift login");
  resolvers.log("2) Complete login and return to this terminal");
  resolvers.log("3) If browser doesn't open, open the URL shown below\n");
  await resolvers.runOAuthLogin();

  const refreshed = resolvers.reloadConfigKey();
  if (isValidApiKey(refreshed)) return refreshed;

  throw new Error("API key is required. Complete browser login and try again.");
}

/* v8 ignore next -- interactive prompt wrapper */
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

/* v8 ignore start */
export async function collectConfig(
  options: CollectConfigOptions = {},
): Promise<ProjectConfig> {
  if (options.forceOAuth && options.authMode && options.authMode !== "oauth") {
    throw new Error(
      "Cannot combine --force-oauth with --auth=manual or --auth=existing",
    );
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

  const runOnboardingDeploy = await confirm({
    message: "Run deploy now? (includes smoke test)",
    default: true,
  });

  return {
    name,
    template,
    apiKey,
    localDataDir,
    notionLater,
    gdriveLater,
    runOnboardingDeploy,
  };
}
/* v8 ignore stop */
