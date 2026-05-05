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
if (missingEnv.length) {
  console.warn(
    `[{{PROJECT_NAME}}] WARNING missing env: ${missingEnv.join(", ")}. Get a key at https://app.schift.io/api-keys`,
  );
}

const apiBase = process.env.SCHIFT_API_URL || "https://api.schift.io";
const bucketId = process.env.SCHIFT_BUCKET_ID || "";

app.get("/api/health", (_req, res) => {
  res.json({
    status: missingEnv.length === 0 ? "ok" : "setup-required",
    template: "case-intake",
    missingEnv,
    docs: "https://app.schift.io/api-keys",
  });
});

// Intake payload → {summary, issues[], statutes[], next_steps[]}
app.post("/api/intake", async (req, res) => {
  if (missingEnv.length) {
    res.status(503).json({ error: "setup-required", missingEnv });
    return;
  }
  const { clientName, facts, desiredOutcome, urgency } = req.body ?? {};
  if (!facts || typeof facts !== "string") {
    res.status(400).json({ error: "facts is required" });
    return;
  }
  const question = [
    "아래 사건에 대해 ①사건 요약 ②주요 쟁점 3개 ③적용 가능한 법령/조문 ④권장 다음 단계를 정리해줘.",
    `[의뢰인] ${clientName || "(이름 미공개)"}`,
    `[사실관계] ${facts}`,
    desiredOutcome ? `[원하는 결과] ${desiredOutcome}` : "",
    urgency ? `[긴급도] ${urgency}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const resp = await fetch(`${apiBase}/v1/legal/qa`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SCHIFT_API_KEY}`,
      },
      body: JSON.stringify({
        question,
        bucket_id: bucketId || undefined,
        top_k: 8,
      }),
    });
    if (!resp.ok) {
      const detail = await resp.text();
      res.status(resp.status).json({ error: "upstream_error", detail });
      return;
    }
    const data = await resp.json();
    res.json({
      summary: data.answer,
      sources: data.sources ?? [],
      disclaimer: data.disclaimer,
      client: { name: clientName ?? null, urgency: urgency ?? "normal" },
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "intake failed",
    });
  }
});

const PORT = parseInt(process.env.PORT ?? "3803", 10);
app.listen(PORT, () => {
  const label = missingEnv.length ? "Setup screen" : "Case intake";
  console.log(`\n  ${label} at http://localhost:${PORT}\n`);
});
