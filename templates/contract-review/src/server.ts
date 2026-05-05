import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json({ limit: "8mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

// SCHIFT_API_KEY boot gate.
const missingEnv: string[] = [];
if (!process.env.SCHIFT_API_KEY) missingEnv.push("SCHIFT_API_KEY");
if (missingEnv.length) {
  console.warn(
    `[{{PROJECT_NAME}}] WARNING: missing env: ${missingEnv.join(", ")}. Get a key at https://app.schift.io/api-keys`,
  );
}

const apiBase = process.env.SCHIFT_API_URL || "https://api.schift.io";
const policy = process.env.REDACT_POLICY || "default";

// Lazy import so missing-key setup still serves the page.
let redactor: any = null;
async function getRedactor() {
  if (redactor) return redactor;
  try {
    const mod: any = await import("@schift-io/doc-redact");
    redactor = mod.createRedactor
      ? mod.createRedactor({ policy })
      : { redact: (t: string) => ({ text: t, entities: [] }) };
  } catch {
    // doc-redact not installed — degrade to passthrough with a warning.
    redactor = {
      redact: (t: string) => ({ text: t, entities: [], warning: "doc-redact unavailable" }),
    };
  }
  return redactor;
}

app.get("/api/health", (_req, res) => {
  res.json({
    status: missingEnv.length === 0 ? "ok" : "setup-required",
    template: "contract-review",
    missingEnv,
    docs: "https://app.schift.io/api-keys",
  });
});

app.post("/api/review", async (req, res) => {
  if (missingEnv.length) {
    res.status(503).json({ error: "setup-required", missingEnv });
    return;
  }
  const { contractText, templateId } = req.body ?? {};
  if (!contractText || typeof contractText !== "string") {
    res.status(400).json({ error: "contractText is required" });
    return;
  }

  // Step 1: client-side PII masking BEFORE the doc leaves our process.
  const r = await getRedactor();
  const masked = r.redact(contractText);

  // Step 2: ask Schift Cloud /v1/legal/draft to generate a review memo.
  try {
    const resp = await fetch(`${apiBase}/v1/legal/draft`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SCHIFT_API_KEY}`,
      },
      body: JSON.stringify({
        template_id: templateId || "contract-review-memo",
        parameters: { contract_excerpt: masked.text.slice(0, 8000) },
        refine: true,
        situation: masked.text.slice(0, 4000),
      }),
    });
    if (!resp.ok) {
      const detail = await resp.text();
      res.status(resp.status).json({ error: "upstream_error", detail });
      return;
    }
    const data = await resp.json();
    res.json({
      review: data.content_md ?? data.content_text,
      disclaimer: data.disclaimer,
      redaction: {
        entityCount: masked.entities?.length ?? 0,
        policy,
        warning: masked.warning ?? null,
      },
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "review failed",
    });
  }
});

const PORT = parseInt(process.env.PORT ?? "3802", 10);
app.listen(PORT, () => {
  const label = missingEnv.length ? "Setup screen" : "Contract review";
  console.log(`\n  ${label} at http://localhost:${PORT}\n`);
});
