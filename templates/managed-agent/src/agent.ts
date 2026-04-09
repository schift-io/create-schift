/**
 * Managed Agent -- runs on Schift Cloud, not locally.
 *
 * After `schift deploy`, your agent is live at:
 *   POST /v1/agents/{agentId}/runs
 *
 * This file registers the agent and provides a local dev server
 * that proxies to the cloud agent for testing.
 */
import "dotenv/config";
import { Schift } from "@schift-io/sdk";

if (!process.env.SCHIFT_API_KEY) {
  throw new Error("SCHIFT_API_KEY is required. Set it in .env");
}

export const schift = new Schift({ apiKey: process.env.SCHIFT_API_KEY });

/**
 * Find or create the managed agent on Schift Cloud.
 * Returns the agent ID for creating runs.
 */
export async function getOrCreateAgent(): Promise<string> {
  const name = "{{PROJECT_SLUG}}";

  // Check if agent already exists
  const agents = await schift.agents.list();
  const existing = agents.find((a) => a.name === name);
  if (existing) return existing.id;

  // Create new agent with RAG bucket
  const agent = await schift.agents.create({
    name,
    model: "gemini-2.5-flash-lite",
    instructions: `You are a helpful assistant for {{PROJECT_NAME}}.
Answer questions using the knowledge base. Be concise and accurate.
If you don't know the answer, say so honestly.`,
    ragConfig: {
      bucketId: process.env.SCHIFT_BUCKET || `${name}-docs`,
      topK: 5,
    },
  });

  return agent.id;
}
