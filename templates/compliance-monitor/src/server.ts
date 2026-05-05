import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

const missingEnv: string[] = [];
if (!process.env.SCHIFT_API_KEY) missingEnv.push("SCHIFT_API_KEY");
if (!process.env.SCHIFT_BUCKET_ID) missingEnv.push("SCHIFT_BUCKET_ID");
if (missingEnv.length) {
  console.warn(
    `[{{PROJECT_NAME}}] WARNING missing env: ${missingEnv.join(", ")}. Key: https://app.schift.io/api-keys`,
  );
}

const apiBase = process.env.SCHIFT_API_URL || "https://api.schift.io";
const bucketId = process.env.SCHIFT_BUCKET_ID || "";
const policy = process.env.REDACT_POLICY || "strict";

let redactor: any = null;
async function getRedactor() {
  if (redactor) return redactor;
  try {
    const mod: any = await import("@schift-io/doc-redact");
    redactor = mod.createRedactor
      ? mod.createRedactor({ policy })
      : { redact: (t: string) => ({ text: t, entities: [] }) };
  } catch {
    redactor = {
      redact: (t: string) => ({ text: t, entities: [], warning: "doc-redact unavailable" }),
    };
  }
  return redactor;
}

const auditLog: Array<{ at: string; query: string; redactedCount: number }> = [];

app.get("/api/health", (_req, res) => {
  res.json({
    status: missingEnv.length === 0 ? "ok" : "setup-required",
    template: "compliance-monitor",
    missingEnv,
    docs: "https://app.schift.io/api-keys",
  });
});

app.get("/api/audit", (_req, res) => {
  res.json({ records: auditLog.slice(-200) });
});

app.post("/api/monitor", async (req, res) => {
  if (missingEnv.length) {
    res.status(503).json({ error: "setup-required", missingEnv });
    return;
  }
  const { transaction, question } = req.body ?? {};
  if (!transaction || typeof transaction !== "string") {
    res.status(400).json({ error: "transaction description is required" });
    return;
  }

  // PII/DLP on outbound (before leaving our process).
  const r = await getRedactor();
  const masked = r.redact(transaction);
  auditLog.push({
    at: new Date().toISOString(),
    query: (question || "").slice(0, 200),
    redactedCount: masked.entities?.length ?? 0,
  });

  const promptQuestion =
    (question?.trim() ||
      "아래 거래가 내부 규정(AML/KYC/개인정보보호법 등) 어느 조항에 저촉될 가능성이 있는지 분석하고 근거 조문을 인용해줘.") +
    "\n\n[거래 설명]\n" +
    masked.text.slice(0, 4000);

  try {
    const resp = await fetch(`${apiBase}/v1/legal/qa`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SCHIFT_API_KEY}`,
      },
      body: JSON.stringify({
        question: promptQuestion,
        bucket_id: bucketId,
        top_k: 6,
      }),
    });
    if (!resp.ok) {
      const detail = await resp.text();
      res.status(resp.status).json({ error: "upstream_error", detail });
      return;
    }
    const data = await resp.json();
    res.json({
      verdict: data.answer,
      sources: data.sources ?? [],
      disclaimer: data.disclaimer,
      redaction: { entityCount: masked.entities?.length ?? 0, policy },
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "monitor failed" });
  }
});

const PORT = parseInt(process.env.PORT ?? "3804", 10);
app.listen(PORT, () => {
  const label = missingEnv.length ? "Setup screen" : "Compliance monitor";
  console.log(`\n  ${label} at http://localhost:${PORT}\n`);
});
