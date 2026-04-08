import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const collectConfigMock = vi.fn();
const scaffoldMock = vi.fn();
const execSyncMock = vi.fn();
const exitMock = vi.fn();
const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

vi.mock("../prompts.js", () => ({
  collectConfig: collectConfigMock,
}));

vi.mock("../scaffold.js", () => ({
  scaffold: scaffoldMock,
}));

vi.mock("node:child_process", () => ({
  execSync: execSyncMock,
}));

describe("parseCliOptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    exitMock.mockImplementation((code: number) => {
      throw new Error(`EXIT:${code}`);
    });
    vi.stubGlobal("process", { ...process, exit: exitMock });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses auth and force-oauth flags", async () => {
    const { parseCliOptions } = await import("../index.js");
    expect(parseCliOptions(["--auth=oauth"])).toEqual({ authMode: "oauth", forceOAuth: false });
    expect(parseCliOptions(["--auth=existing"])).toEqual({ authMode: "existing", forceOAuth: false });
    expect(parseCliOptions(["--force-oauth"])).toEqual({ authMode: undefined, forceOAuth: true });
  });

  it("throws for invalid auth values and invalid combinations", async () => {
    const { parseCliOptions } = await import("../index.js");
    expect(() => parseCliOptions(["--auth=wat"])).toThrow("Invalid --auth value: wat");
    expect(() => parseCliOptions(["--force-oauth", "--auth=manual"])).toThrow(
      "Cannot combine --force-oauth with --auth=manual or --auth=existing",
    );
  });

  it("prints help and exits 0", async () => {
    const { parseCliOptions } = await import("../index.js");
    expect(() => parseCliOptions(["--help"])).toThrow("EXIT:0");
    expect(logSpy).toHaveBeenCalledWith("\nUsage: npx create-schift [--auth=manual|oauth|existing] [--force-oauth]\n");
  });
});

describe("runCreateSchift", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    exitMock.mockImplementation((code: number) => {
      throw new Error(`EXIT:${code}`);
    });
    vi.stubGlobal("process", { ...process, exit: exitMock });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes parsed options into collectConfig and runs onboarding deploy only for cs-chatbot", async () => {
    const { runCreateSchift } = await import("../index.js");

    collectConfigMock.mockResolvedValueOnce({
      name: "support-bot",
      template: "cs-chatbot",
      apiKey: "sch_test123456789012345",
      runOnboardingDeploy: true,
    });
    scaffoldMock.mockResolvedValueOnce(undefined);
    execSyncMock.mockReturnValueOnce(undefined);

    await runCreateSchift(["--auth=manual"]);

    expect(collectConfigMock).toHaveBeenCalledWith({ authMode: "manual", forceOAuth: false });
    expect(scaffoldMock).toHaveBeenCalledTimes(1);
    expect(execSyncMock).toHaveBeenCalledWith("npm run deploy", {
      cwd: expect.stringMatching(/support-bot$/),
      stdio: "inherit",
    });

    collectConfigMock.mockResolvedValueOnce({
      name: "blank-bot",
      template: "blank",
      apiKey: "sch_test123456789012345",
      runOnboardingDeploy: true,
    });
    scaffoldMock.mockResolvedValueOnce(undefined);

    await runCreateSchift(["--auth=manual"]);

    expect(scaffoldMock).toHaveBeenCalledTimes(2);
    expect(execSyncMock).toHaveBeenCalledTimes(1);
  });

  it("does not throw when deploy step fails after scaffold and logs recovery", async () => {
    const { runCreateSchift } = await import("../index.js");

    collectConfigMock.mockResolvedValueOnce({
      name: "support-bot",
      template: "cs-chatbot",
      apiKey: "sch_test123456789012345",
      runOnboardingDeploy: true,
    });
    scaffoldMock.mockResolvedValueOnce(undefined);
    execSyncMock.mockImplementationOnce(() => {
      throw new Error("deploy failed");
    });

    await expect(runCreateSchift(["--auth=manual"])).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      "\n  Deploy step failed. Project scaffold is ready. Run `npm run deploy` manually in your project.\n",
    );
  });

  it("skips deploy when cs-chatbot onboarding deploy is disabled", async () => {
    const { runCreateSchift } = await import("../index.js");

    collectConfigMock.mockResolvedValueOnce({
      name: "support-bot",
      template: "cs-chatbot",
      apiKey: "sch_test123456789012345",
      runOnboardingDeploy: false,
    });
    scaffoldMock.mockResolvedValueOnce(undefined);

    await runCreateSchift(["--auth=manual"]);

    expect(execSyncMock).not.toHaveBeenCalled();
  });
});

describe("main", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    exitMock.mockImplementation((code: number) => {
      throw new Error(`EXIT:${code}`);
    });
    vi.stubGlobal("process", { ...process, exit: exitMock, argv: ["node", "index.js"] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prints welcome banner on success", async () => {
    const mod = await import("../index.js");
    collectConfigMock.mockResolvedValueOnce({
      name: "plain-bot",
      template: "blank",
      apiKey: "sch_test123456789012345",
    });
    scaffoldMock.mockResolvedValueOnce(undefined);

    await mod.main();

    expect(logSpy).toHaveBeenCalledWith("\n  Welcome to Schift - The AI Agent Framework\n");
  });

  it("prints aborted and exits 0 on ExitPromptError", async () => {
    const mod = await import("../index.js");
    collectConfigMock.mockRejectedValueOnce({ name: "ExitPromptError" });

    await expect(mod.main()).rejects.toThrow("EXIT:0");
    expect(logSpy).toHaveBeenCalledWith("\nAborted.");
  });

  it("prints generic error and exits 1", async () => {
    const mod = await import("../index.js");
    collectConfigMock.mockRejectedValueOnce(new Error("boom"));

    await expect(mod.main()).rejects.toThrow("EXIT:1");
    expect(errorSpy).toHaveBeenCalledWith("\nError:", "boom");
  });
});
