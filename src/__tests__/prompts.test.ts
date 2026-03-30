import { describe, it, expect, vi } from "vitest";
import { resolveApiKey, resolveExistingApiKey } from "../prompts.js";

describe("resolveApiKey", () => {
  it("returns manually entered API key", async () => {
    await expect(resolveApiKey("sch_manual1234567890")).resolves.toBe("sch_manual1234567890");
  });

  it("rejects invalid manually entered API key", async () => {
    await expect(resolveApiKey("invalid-key")).rejects.toThrow("should start with 'sch_'");
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
