import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs-extra";
import path from "path";
import os from "os";
import { scaffold } from "../scaffold.js";

describe("scaffold", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "create-schift-test-"));
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  it("creates project directory with template files", async () => {
    const projectDir = path.join(tmpDir, "test-agent");
    await scaffold(
      { name: "test-agent", template: "blank", apiKey: "sch_test123" },
      { targetDir: projectDir, skipInstall: true },
    );

    expect(await fs.pathExists(path.join(projectDir, "package.json"))).toBe(true);
    expect(await fs.pathExists(path.join(projectDir, "tsconfig.json"))).toBe(true);
    expect(await fs.pathExists(path.join(projectDir, "src", "agent.ts"))).toBe(true);
    expect(await fs.pathExists(path.join(projectDir, "src", "server.ts"))).toBe(true);
    expect(await fs.pathExists(path.join(projectDir, ".env"))).toBe(true);
  });

  it("replaces placeholder variables in files", async () => {
    const projectDir = path.join(tmpDir, "my-bot");
    await scaffold(
      { name: "my-bot", template: "blank", apiKey: "sch_abc123" },
      { targetDir: projectDir, skipInstall: true },
    );

    const pkg = await fs.readJson(path.join(projectDir, "package.json"));
    expect(pkg.name).toBe("my-bot");

    const env = await fs.readFile(path.join(projectDir, ".env"), "utf-8");
    expect(env).toContain("sch_abc123");
  });

  it("creates .env from .env.example with API key and BYOK placeholders", async () => {
    const projectDir = path.join(tmpDir, "test-agent");
    await scaffold(
      { name: "test-agent", template: "blank", apiKey: "sch_xyz" },
      { targetDir: projectDir, skipInstall: true },
    );

    const env = await fs.readFile(path.join(projectDir, ".env"), "utf-8");
    expect(env).toContain("SCHIFT_API_KEY=sch_xyz");
    expect(env).toContain("SCHIFT_PROVIDER_API_KEY=");
    expect(env).toContain("SCHIFT_PROVIDER_ENDPOINT_URL=");
  });

  it("throws if target directory already exists", async () => {
    const projectDir = path.join(tmpDir, "existing");
    await fs.mkdir(projectDir);
    await fs.writeFile(path.join(projectDir, "file.txt"), "x");

    await expect(
      scaffold(
        { name: "existing", template: "blank", apiKey: "sch_test" },
        { targetDir: projectDir, skipInstall: true },
      ),
    ).rejects.toThrow("already exists");
  });

  it("preserves .env.example with placeholders (no API key leak)", async () => {
    const projectDir = path.join(tmpDir, "leak-test");
    await scaffold(
      { name: "leak-test", template: "blank", apiKey: "sch_secret999" },
      { targetDir: projectDir, skipInstall: true },
    );

    const envExample = await fs.readFile(path.join(projectDir, ".env.example"), "utf-8");
    expect(envExample).toContain("{{API_KEY}}");
    expect(envExample).not.toContain("sch_secret999");
  });

  it("scaffolds cs-chatbot template with lead tool and chat UI", async () => {
    const projectDir = path.join(tmpDir, "support-bot");
    await scaffold(
      { name: "support-bot", template: "cs-chatbot", apiKey: "sch_cs123" },
      { targetDir: projectDir, skipInstall: true },
    );

    expect(await fs.pathExists(path.join(projectDir, "src", "tools", "lead-collect.ts"))).toBe(true);
    expect(await fs.pathExists(path.join(projectDir, "public", "index.html"))).toBe(true);
    expect(await fs.pathExists(path.join(projectDir, "src", "agent.ts"))).toBe(true);

    const html = await fs.readFile(path.join(projectDir, "public", "index.html"), "utf-8");
    expect(html).toContain("support-bot");
    expect(html).not.toContain("{{PROJECT_NAME}}");

    const agent = await fs.readFile(path.join(projectDir, "src", "agent.ts"), "utf-8");
    expect(agent).toContain('"support-bot"');
    expect(agent).toContain("SCHIFT_PROVIDER_API_KEY");
    expect(agent).toContain("SCHIFT_PROVIDER_ENDPOINT_URL");

    const env = await fs.readFile(path.join(projectDir, ".env"), "utf-8");
    expect(env).toContain("SCHIFT_PROVIDER_API_KEY=");
    expect(env).toContain("SCHIFT_PROVIDER_ENDPOINT_URL=");

    const pkg = await fs.readJson(path.join(projectDir, "package.json"));
    expect(pkg.scripts.dev).toBe("npx tsx src/server.ts");
    expect(pkg.scripts.deploy).toBe("npx schift deploy");
    expect(pkg.dependencies.express).toBe("^5.1.0");
    expect(pkg.dependencies.cors).toBe("^2.8.5");
    expect(pkg.dependencies.dotenv).toBe("^16.0.0");
    expect(pkg.devDependencies["@types/express"]).toBe("^5.0.0");
    expect(pkg.devDependencies["@types/cors"]).toBe("^2.8.0");
    expect(pkg.devDependencies["@schift-io/cli"]).toBe("^0.1.0");
  });

  it("throws for invalid template name", async () => {
    const projectDir = path.join(tmpDir, "bad-template");
    await expect(
      scaffold(
        { name: "bad-template", template: "nonexistent", apiKey: "sch_test" },
        { targetDir: projectDir, skipInstall: true },
      ),
    ).rejects.toThrow("not found");
  });

  it("scaffolded agent validates incomplete BYOK configuration", async () => {
    const projectDir = path.join(tmpDir, "byok-agent");
    await scaffold(
      { name: "byok-agent", template: "blank", apiKey: "sch_test123" },
      { targetDir: projectDir, skipInstall: true },
    );

    const agent = await fs.readFile(path.join(projectDir, "src", "agent.ts"), "utf-8");
    expect(agent).toContain(
      "SCHIFT_PROVIDER_API_KEY and SCHIFT_PROVIDER_ENDPOINT_URL must be set together",
    );
  });

  // ── Scenario #50: .gitignore includes .env ──
  it("scaffolded project has .gitignore with .env", async () => {
    const projectDir = path.join(tmpDir, "gitignore-test");
    await scaffold(
      { name: "gitignore-test", template: "blank", apiKey: "sch_test123456789012" },
      { targetDir: projectDir, skipInstall: true },
    );

    const gitignore = await fs.readFile(path.join(projectDir, ".gitignore"), "utf-8");
    expect(gitignore).toContain(".env");
    expect(gitignore).toContain("node_modules");
  });

  it("scaffolded project includes deploy script and local CLI dependency", async () => {
    for (const template of ["blank", "cs-chatbot"]) {
      const projectDir = path.join(tmpDir, `deploy-${template}`);
      await scaffold(
        { name: `deploy-${template}`, template, apiKey: "sch_test123456789012" },
        { targetDir: projectDir, skipInstall: true },
      );

      const pkg = await fs.readJson(path.join(projectDir, "package.json"));
      expect(pkg.scripts.deploy).toBe("npx schift deploy");
      if (template === "cs-chatbot") {
        expect(pkg.scripts.dev).toBe("npx tsx src/server.ts");
      }
      expect(pkg.devDependencies["@schift-io/cli"]).toBe("^0.1.0");
    }
  });
});
