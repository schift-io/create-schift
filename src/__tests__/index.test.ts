import { describe, it, expect, vi, beforeEach } from "vitest";

const collectConfigMock = vi.fn();
const scaffoldMock = vi.fn();
const execSyncMock = vi.fn();

vi.mock("../prompts.js", () => ({
  collectConfig: collectConfigMock,
}));

vi.mock("../scaffold.js", () => ({
  scaffold: scaffoldMock,
}));

vi.mock("node:child_process", () => ({
  execSync: execSyncMock,
}));

describe("runCreateSchift", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs schift deploy only for cs-chatbot template", async () => {
    const { runCreateSchift } = await import("../index.js");

    collectConfigMock.mockResolvedValueOnce({
      name: "support-bot",
      template: "cs-chatbot",
      apiKey: "sch_test123456789012345",
      runOnboardingDeploy: true,
    });
    scaffoldMock.mockResolvedValueOnce(undefined);
    execSyncMock.mockImplementation((command: string) => {
      if (command === "npm view @schift-io/cli version") return undefined;
      if (command === "npx --yes @schift-io/cli deploy") return undefined;
      throw new Error(`unexpected command: ${command}`);
    });

    await runCreateSchift(["--auth=manual"]);

    expect(scaffoldMock).toHaveBeenCalledTimes(1);
    expect(execSyncMock).toHaveBeenCalledWith(
      "npx --yes @schift-io/cli deploy",
      expect.objectContaining({
        stdio: "inherit",
        cwd: expect.stringContaining("support-bot"),
      }),
    );

    collectConfigMock.mockResolvedValueOnce({
      name: "blank-bot",
      template: "blank",
      apiKey: "sch_test123456789012345",
      runOnboardingDeploy: true,
    });
    scaffoldMock.mockResolvedValueOnce(undefined);

    await runCreateSchift(["--auth=manual"]);

    expect(scaffoldMock).toHaveBeenCalledTimes(2);
    expect(
      execSyncMock.mock.calls.filter(([command]) => !String(command).startsWith("npm view")).length,
    ).toBe(1);
  });

  it("does not throw when deploy step fails after scaffold", async () => {
    const { runCreateSchift } = await import("../index.js");

    collectConfigMock.mockResolvedValueOnce({
      name: "support-bot",
      template: "cs-chatbot",
      apiKey: "sch_test123456789012345",
      runOnboardingDeploy: true,
    });
    scaffoldMock.mockResolvedValueOnce(undefined);
    execSyncMock.mockImplementation((command: string) => {
      if (command === "npm view @schift-io/cli version") return undefined;
      if (command === "npx --yes @schift-io/cli deploy") {
        throw new Error("deploy failed");
      }
      throw new Error(`unexpected command: ${command}`);
    });

    await expect(runCreateSchift(["--auth=manual"])).resolves.toBeUndefined();
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

  it("skips onboarding deploy when no CLI package is available", async () => {
    const { runCreateSchift } = await import("../index.js");

    collectConfigMock.mockResolvedValueOnce({
      name: "support-bot",
      template: "cs-chatbot",
      apiKey: "sch_test123456789012345",
      runOnboardingDeploy: true,
    });
    scaffoldMock.mockResolvedValueOnce(undefined);
    execSyncMock.mockImplementation((command: string) => {
      if (command.startsWith("npm view")) {
        throw new Error("E404");
      }
      return undefined;
    });

    await expect(runCreateSchift(["--auth=manual"])).resolves.toBeUndefined();

    expect(execSyncMock).toHaveBeenCalledWith("npm view @schift-io/cli version", expect.any(Object));
    expect(execSyncMock).toHaveBeenCalledWith("npm view schift version", expect.any(Object));
    expect(execSyncMock).not.toHaveBeenCalledWith(
      expect.stringContaining("npx --yes"),
      expect.any(Object),
    );
  });
});
