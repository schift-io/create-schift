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

// SCHIFT_API_KEY boot gate — render friendly setup page instead of crashing.
const missingEnv: string[] = [];
if (!process.env.SCHIFT_API_KEY) missingEnv.push("SCHIFT_API_KEY");

if (missingEnv.length) {
  console.warn(
    `[{{PROJECT_NAME}}] WARNING: missing env vars: ${missingEnv.join(", ")} — serving setup page.`,
  );
  console.warn(
    `[{{PROJECT_NAME}}] Get your Schift Cloud API key at https://app.schift.io/api-keys`,
  );
}

const apiBase = process.env.SCHIFT_API_URL || "https://api.schift.io";
const bucketId = process.env.SCHIFT_BUCKET_ID || "";

app.get("/api/health", (_req, res) => {
  res.json({
    status: missingEnv.length === 0 ? "ok" : "setup-required",
    template: "law-firm-chatbot",
    missingEnv,
    docs: "https://app.schift.io/api-keys",
  });
});

app.post("/api/consult", async (req, res) => {
  if (missingEnv.length) {
    res.status(503).json({
      error: "setup-required",
      missingEnv,
      hint: "Fill .env with SCHIFT_API_KEY then restart. See README.",
    });
    return;
  }
  const { question, clientName } = req.body ?? {};
  if (!question || typeof question !== "string") {
    res.status(400).json({ error: "question is required" });
    return;
  }
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
      answer: data.answer,
      sources: data.sources ?? [],
      disclaimer: data.disclaimer,
      intake: {
        clientName: clientName ?? null,
        assignmentRecommended: (data.confidence ?? 0) < 0.6,
      },
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "request failed",
    });
  }
});

app.post("/api/assign", async (req, res) => {
  if (missingEnv.length) {
    res.status(503).json({ error: "setup-required", missingEnv });
    return;
  }
  const { clientName, matter, urgency } = req.body ?? {};
  const webhook = process.env.ASSIGN_WEBHOOK_URL;
  if (webhook) {
    try {
      await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientName, matter, urgency, at: new Date().toISOString() }),
      });
    } catch {
      // Best effort — still acknowledge.
    }
  }
  res.json({ assigned: true, clientName, matter, urgency });
});

const PORT = parseInt(process.env.PORT ?? "3801", 10);
app.listen(PORT, () => {
  const label = missingEnv.length ? "Setup screen" : "Law-firm chatbot";
  console.log(`\n  ${label} at http://localhost:${PORT}\n`);
});
