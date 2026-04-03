import "dotenv/config";
import { Schift, Agent, RAG } from "@schift-io/sdk";
import { collectLead } from "./tools/lead-collect.js";

if (!process.env.SCHIFT_API_KEY) {
  throw new Error("SCHIFT_API_KEY is required. Set it in .env");
}

const providerApiKey = process.env.SCHIFT_PROVIDER_API_KEY;
const providerEndpointUrl = process.env.SCHIFT_PROVIDER_ENDPOINT_URL;

if ((providerApiKey && !providerEndpointUrl) || (!providerApiKey && providerEndpointUrl)) {
  throw new Error(
    "SCHIFT_PROVIDER_API_KEY and SCHIFT_PROVIDER_ENDPOINT_URL must be set together for BYOK response generation.",
  );
}

const schift = new Schift({ apiKey: process.env.SCHIFT_API_KEY });

const bucket = process.env.SCHIFT_BUCKET ?? "support-docs";

const rag = new RAG({ bucket, topK: 5 }, schift.transport);

export const agent = new Agent({
  name: "{{PROJECT_NAME}}",
  instructions: `You are a helpful customer support agent.
Answer questions using the knowledge base. Be concise and accurate.
Always cite sources when possible.

If the user asks about pricing, features, or wants a demo, offer to collect
their contact information using the collect_lead tool.

If you don't know the answer, say so honestly. Don't make things up.`,
  rag,
  tools: [collectLead],
  model: "gpt-4o-mini",
  ...(providerApiKey && providerEndpointUrl
    ? { apiKey: providerApiKey, baseUrl: providerEndpointUrl }
    : { transport: schift.transport }),
});
