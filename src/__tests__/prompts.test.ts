import { describe, it, expect, vi, beforeEach } from "vitest";

const promptMocks = vi.hoisted(() => ({
  inputMock: vi.fn(),
  selectMock: vi.fn(),
  checkboxMock: vi.fn(),
  confirmMock: vi.fn(),
}));

vi.mock("@inquirer/prompts", () => ({
  input: promptMocks.inputMock,
  select: promptMocks.selectMock,
  checkbox: promptMocks.checkboxMock,
  confirm: promptMocks.confirmMock,
}));

const { inputMock, selectMock, checkboxMock, confirmMock } = promptMocks;

import { resolveApiKey, resolveExistingApiKey, collectConfig } from "../prompts.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveApiKey", () => {
  it("returns manually entered API key", async () => {
    await expect(resolveApiKey("sch_manual1234567890")).resolves.toBe("sch_manual1234567890");
  });

  it("rejects invalid manually entered API key", async () => {
    await expect(resolveApiKey("invalid-key")).rejects.toThrow("should start with 'sch_'");
  });

  it("rejects too-short manually entered API key", async () => {
    await expect(resolveApiKey("sch_short")).rejects.toThrow("API key looks too short.");
  });

  it("uses existing key when input is empty and user confirms", async () => {
    const key = await resolveApiKey("", {
      envKey: () => "sch_env123456789012345",
      configKey: () => null,
      runOAuthLogin: vi.fn(async () => undefined),
      reloadConfigKey: () => null,
      log: vi.fn(),
      confirmUseExisting: vi.fn(async () => true),
    });

    expect(key).toBe("sch_env123456789012345");
  });

  it("starts OAuth when existing key is present but user declines", async () => {
    const runOAuthLogin = vi.fn(async () => undefined);

    const key = await resolveApiKey("", {
      envKey: () => "sch_env123456789012345",
      configKey: () => null,
      runOAuthLogin,
      reloadConfigKey: () => "sch_afteroauth123456789012345",
      log: vi.fn(),
      confirmUseExisting: vi.fn(async () => false),
    });

    expect(runOAuthLogin).toHaveBeenCalledTimes(1);
    expect(key).toBe("sch_afteroauth123456789012345");
  });

  it("forces OAuth when forceOAuth is true", async () => {
    const runOAuthLogin = vi.fn(async () => undefined);

    const key = await resolveApiKey(
      "",
      {
        envKey: () => "sch_env123456789012345",
        configKey: () => "sch_cfg123456789012345",
        runOAuthLogin,
        reloadConfigKey: () => "sch_afteroauth123456789012345",
        log: vi.fn(),
        confirmUseExisting: vi.fn(async () => true),
      },
      { forceOAuth: true },
    );

    expect(runOAuthLogin).toHaveBeenCalledTimes(1);
    expect(key).toBe("sch_afteroauth123456789012345");
  });

  it("runs OAuth login with guidance when no key exists and returns reloaded key", async () => {
    const runOAuthLogin = vi.fn(async () => undefined);
    const logger = vi.fn();

    const key = await resolveApiKey("", {
      envKey: () => undefined,
      configKey: () => null,
      runOAuthLogin,
      reloadConfigKey: () => "sch_afteroauth123456789012345",
      log: logger,
      confirmUseExisting: vi.fn(async () => true),
    });

    expect(runOAuthLogin).toHaveBeenCalledTimes(1);
    expect(logger).toHaveBeenCalledWith("\nNo API key provided. Starting OAuth login with Schift CLI...\n");
    expect(logger).toHaveBeenCalledWith("1) Browser will open for Schift login");
    expect(logger).toHaveBeenCalledWith("2) Complete login and return to this terminal");
    expect(logger).toHaveBeenCalledWith("3) If browser doesn't open, open the URL shown below\n");
    expect(key).toBe("sch_afteroauth123456789012345");
  });

  it("throws when OAuth login does not produce a key", async () => {
    await expect(
      resolveApiKey("", {
        envKey: () => undefined,
        configKey: () => null,
        runOAuthLogin: vi.fn(async () => undefined),
        reloadConfigKey: () => null,
        log: vi.fn(),
        confirmUseExisting: vi.fn(async () => true),
      }),
    ).rejects.toThrow("API key is required. Complete browser login and try again.");
  });
});

describe("collectConfig", () => {
  it("collects manual blank template config with explicit expectations", async () => {
    inputMock
      .mockResolvedValueOnce("my-agent")
      .mockResolvedValueOnce("sch_manual123456789012345");
    selectMock
      .mockResolvedValueOnce("blank")
      .mockResolvedValueOnce("manual");
    checkboxMock.mockResolvedValueOnce(["skip"]);

    const config = await collectConfig();

    expect(config).toEqual({
      name: "my-agent",
      template: "blank",
      apiKey: "sch_manual123456789012345",
      localDataDir: undefined,
      notionLater: false,
      gdriveLater: false,
      runOnboardingDeploy: undefined,
    });

    const validateName = inputMock.mock.calls[0][0].validate;
    expect(validateName("")).toBe("Project name is required");
    expect(validateName("Bad_Name")).toBe("Use lowercase letters (a-z), numbers, and hyphens only.");
    expect(validateName("good-name")).toBe(true);
  });

  it("collects cs-chatbot config with local/notion/gdrive selections and deploy confirm", async () => {
    inputMock
      .mockResolvedValueOnce("support-bot")
      .mockResolvedValueOnce("sch_manual123456789012345")
      .mockResolvedValueOnce("./docs");
    selectMock.mockResolvedValueOnce("cs-chatbot");
    checkboxMock.mockResolvedValueOnce(["local", "notion", "gdrive"]);
    confirmMock.mockResolvedValueOnce(true);

    const config = await collectConfig({ authMode: "manual" });

    expect(config).toEqual({
      name: "support-bot",
      template: "cs-chatbot",
      apiKey: "sch_manual123456789012345",
      localDataDir: "./docs",
      notionLater: true,
      gdriveLater: true,
      runOnboardingDeploy: true,
    });
  });

  it("collects local data dir without onboarding deploy for blank template", async () => {
    inputMock
      .mockResolvedValueOnce("blank-bot")
      .mockResolvedValueOnce("sch_manual123456789012345")
      .mockResolvedValueOnce("/tmp/docs");
    selectMock.mockResolvedValueOnce("blank");
    checkboxMock.mockResolvedValueOnce(["local"]);

    const config = await collectConfig({ authMode: "manual" });

    expect(config).toEqual({
      name: "blank-bot",
      template: "blank",
      apiKey: "sch_manual123456789012345",
      localDataDir: "/tmp/docs",
      notionLater: false,
      gdriveLater: false,
      runOnboardingDeploy: undefined,
    });
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it("collects cs-chatbot config with deploy confirm false", async () => {
    inputMock
      .mockResolvedValueOnce("support-bot")
      .mockResolvedValueOnce("sch_manual123456789012345");
    selectMock.mockResolvedValueOnce("cs-chatbot");
    checkboxMock.mockResolvedValueOnce(["skip"]);
    confirmMock.mockResolvedValueOnce(false);

    const config = await collectConfig({ authMode: "manual" });

    expect(config.runOnboardingDeploy).toBe(false);
  });

  it("throws for invalid forceOAuth and authMode combination", async () => {
    await expect(
      collectConfig({ forceOAuth: true, authMode: "manual" }),
    ).rejects.toThrow("Cannot combine --force-oauth with --auth=manual or --auth=existing");
  });

  it("retries auth selection after non-explicit auth failure", async () => {
    inputMock
      .mockResolvedValueOnce("retry-bot")
      .mockResolvedValueOnce("sch_manual123456789012345");
    selectMock
      .mockResolvedValueOnce("blank")
      .mockResolvedValueOnce("existing")
      .mockResolvedValueOnce("manual");
    checkboxMock.mockResolvedValueOnce(["skip"]);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const config = await collectConfig();

    expect(config.apiKey).toBe("sch_manual123456789012345");
    expect(logSpy).toHaveBeenCalledWith(
      "\nExisting key use cancelled. Choose another authentication method.\n",
    );

    logSpy.mockRestore();
  });
});

describe("resolveExistingApiKey", () => {
  it("returns existing env/config key when user confirms", async () => {
    const key = await resolveExistingApiKey({
      envKey: () => "sch_env123456789012345",
      configKey: () => null,
      runOAuthLogin: vi.fn(async () => undefined),
      reloadConfigKey: () => null,
      log: vi.fn(),
      confirmUseExisting: vi.fn(async () => true),
    });

    expect(key).toBe("sch_env123456789012345");
  });

  it("falls back to config key when env key is invalid", async () => {
    const key = await resolveExistingApiKey({
      envKey: () => "bad",
      configKey: () => "sch_cfg123456789012345",
      runOAuthLogin: vi.fn(async () => undefined),
      reloadConfigKey: () => null,
      log: vi.fn(),
      confirmUseExisting: vi.fn(async () => true),
    });

    expect(key).toBe("sch_cfg123456789012345");
  });

  it("throws when no existing key is found", async () => {
    await expect(
      resolveExistingApiKey({
        envKey: () => undefined,
        configKey: () => null,
        runOAuthLogin: vi.fn(async () => undefined),
        reloadConfigKey: () => null,
        log: vi.fn(),
        confirmUseExisting: vi.fn(async () => true),
      }),
    ).rejects.toThrow("No existing API key found");
  });

  it("throws when user declines existing key", async () => {
    await expect(
      resolveExistingApiKey({
        envKey: () => "sch_env123456789012345",
        configKey: () => null,
        runOAuthLogin: vi.fn(async () => undefined),
        reloadConfigKey: () => null,
        log: vi.fn(),
        confirmUseExisting: vi.fn(async () => false),
      }),
    ).rejects.toThrow("Existing key use cancelled");
  });
});
