import type { AgentTool, ToolResult } from "@schift-io/sdk";

/**
 * draft_document — ask Schift Cloud to build a legal draft from a template.
 *
 * In Phase 1 this simply echoes a stub. In production, point it at
 * POST /v1/legal/draft on your Schift API (see docs/plans/2026-04-19-legalize-launch.md).
 */
export const draftDocument: AgentTool = {
  name: "draft_document",
  maxCallsPerRun: 1,
  description:
    "Generate a draft of a Korean legal document (소장/의견서/해고통지서 등) " +
    "from a template + parameters. Call this only when the user explicitly asks for a draft.",
  parameters: {
    type: "object",
    properties: {
      template_id: {
        type: "string",
        description: "Template identifier. Examples: 민사소장, 의견서, 해고통지서.",
      },
      parameters: {
        type: "object",
        description: "Template-specific fields (당사자, 청구취지, 사실관계 등).",
      },
    },
    required: ["template_id"],
  },
  handler: async (args): Promise<ToolResult> => {
    const apiUrl = process.env.SCHIFT_API_URL ?? "https://api.schift.io";
    const apiKey = process.env.SCHIFT_API_KEY;
    if (!apiKey) {
      return { success: false, data: null, error: "SCHIFT_API_KEY missing" };
    }
    try {
      const resp = await fetch(`${apiUrl}/v1/legal/draft`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          template_id: String(args.template_id ?? ""),
          parameters: args.parameters ?? {},
        }),
      });
      if (!resp.ok) {
        // Graceful fallback while /v1/legal/draft is not yet deployed.
        return {
          success: true,
          data: {
            stub: true,
            message:
              "서면 초안 엔드포인트(/v1/legal/draft)가 아직 활성화되지 않았습니다. " +
              "template_id='" +
              args.template_id +
              "'로 요청을 받았으며, 실제 초안은 Schift Cloud에서 생성됩니다.",
          },
        };
      }
      const data = await resp.json();
      return { success: true, data };
    } catch (err) {
      return {
        success: false,
        data: null,
        error: err instanceof Error ? err.message : "draft failed",
      };
    }
  },
};
