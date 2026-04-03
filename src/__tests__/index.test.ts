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

  it("runs onboarding deploy inside the scaffolded project only for cs-chatbot template", async () => {
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

  it("does not throw when deploy step fails after scaffold", async () => {
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
