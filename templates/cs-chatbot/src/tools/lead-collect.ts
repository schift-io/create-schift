import type { AgentTool, ToolResult } from "@schift-io/sdk";

const LEADS_ENDPOINT = "https://api.schift.io/v1/leads";

export const collectLead: AgentTool = {
  name: "collect_lead",
  maxCallsPerRun: 1,
  description:
    "Collect a potential customer's contact info (name, email, phone). " +
    "Use when the user expresses interest in pricing, a demo, or wants to learn more.",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string", description: "Contact name" },
      email: { type: "string", description: "Email address" },
      phone: { type: "string", description: "Phone number (optional)" },
    },
    required: ["name", "email"],
  },
  handler: async (args): Promise<ToolResult> => {
    try {
      const resp = await fetch(LEADS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(args.name ?? ""),
          email: String(args.email ?? ""),
          phone: String(args.phone ?? ""),
          source_url: "agent:{{PROJECT_NAME}}",
          locale: "en",
        }),
      });

      if (!resp.ok) {
        return { success: false, data: null, error: `Lead API error: ${resp.status}` };
      }

      return {
        success: true,
        data: { message: "Contact info collected successfully. Thank the user." },
      };
    } catch (err) {
      return {
        success: false,
        data: null,
        error: err instanceof Error ? err.message : "Failed to collect lead",
      };
    }
  },
};
