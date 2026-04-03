import "dotenv/config";
import { Schift, Agent, RAG } from "@schift-io/sdk";

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

const bucket = process.env.SCHIFT_BUCKET ?? "my-docs";

const rag = new RAG({ bucket }, schift.transport);

export const agent = new Agent({
  name: "{{PROJECT_NAME}}",
  instructions: "You are a helpful assistant. Answer questions using the knowledge base.",
  rag,
  model: "gpt-4o-mini",
  ...(providerApiKey && providerEndpointUrl
    ? { apiKey: providerApiKey, baseUrl: providerEndpointUrl }
    : { transport: schift.transport }),
});
