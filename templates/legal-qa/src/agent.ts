import "dotenv/config";
import { Schift, Agent, RAG } from "@schift-io/sdk";
import { draftDocument } from "./tools/draft-document.js";

if (!process.env.SCHIFT_API_KEY) {
  throw new Error("SCHIFT_API_KEY is required. Set it in .env");
}

const bucket = process.env.LEGAL_BUCKET_ID || process.env.SCHIFT_BUCKET || "legal-corpus";

const providerApiKey = process.env.SCHIFT_PROVIDER_API_KEY;
const providerEndpointUrl = process.env.SCHIFT_PROVIDER_ENDPOINT_URL;

if ((providerApiKey && !providerEndpointUrl) || (!providerApiKey && providerEndpointUrl)) {
  throw new Error(
    "SCHIFT_PROVIDER_API_KEY and SCHIFT_PROVIDER_ENDPOINT_URL must be set together for BYOK.",
  );
}

const schift = new Schift({
  apiKey: process.env.SCHIFT_API_KEY,
  baseUrl: process.env.SCHIFT_API_URL,
});

const rag = new RAG({ bucket, topK: 6 }, schift.transport);

export const agent = new Agent({
  name: "{{PROJECT_NAME}}",
  instructions: `당신은 한국어 법률 검색 어시스턴트입니다. 다음 원칙을 지키세요.

1. 답변은 반드시 검색된 자료(법령 조문, 판례 요지)만 근거로 삼습니다.
2. 답변 말미에 출처(법령명 + 조항번호, 혹은 판례번호)를 각주식으로 붙입니다.
3. 자료가 불충분하거나 상충될 경우 "자료상 명확하지 않습니다"라고 말합니다.
4. 마지막에 반드시 면책문을 덧붙입니다:
   "※ 본 답변은 일반 정보 제공이며 법률 자문이 아닙니다. 실제 사안은 변호사의 최종 검토가 필요합니다."
5. 사용자가 "소장/의견서/통지서 초안"을 요청하면 draft_document 도구를 사용하세요.`,
  rag,
  tools: [draftDocument],
  model: "gpt-4o-mini",
  ...(providerApiKey && providerEndpointUrl
    ? { apiKey: providerApiKey, baseUrl: providerEndpointUrl }
    : { transport: schift.transport }),
});
