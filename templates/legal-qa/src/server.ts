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

// If env is incomplete, serve a friendly setup page instead of crashing.
const missingEnv: string[] = [];
if (!process.env.SCHIFT_API_KEY) missingEnv.push("SCHIFT_API_KEY");
if (!process.env.LEGAL_BUCKET_ID) missingEnv.push("LEGAL_BUCKET_ID");

let agent: any = null;
let agentLoadError: string | null = null;

if (missingEnv.length === 0) {
  try {
    const mod = await import("./agent.js");
    agent = mod.agent;
  } catch (err) {
    agentLoadError = err instanceof Error ? err.message : String(err);
  }
}

app.get("/api/health", (_req, res) => {
  res.json({
    status: agent ? "ok" : "setup-required",
    missingEnv,
    agentLoadError,
  });
});

app.post("/api/legal/qa", async (req, res) => {
  if (!agent) {
    res.status(503).json({
      error: "Agent not ready",
      missingEnv,
      agentLoadError,
      hint: "Fill .env then restart. See README.md for setup.",
    });
    return;
  }
  const { question } = req.body ?? {};
  if (!question || typeof question !== "string") {
    res.status(400).json({ error: "question is required" });
    return;
  }
  try {
    const result = await agent.run(question);
    res.json({
      answer: result.output,
      steps: result.steps,
      durationMs: result.totalDurationMs,
    });
  } catch (err) {
    console.error("QA error:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Agent failed to respond",
    });
  }
});

const PORT = parseInt(process.env.PORT ?? "3787", 10);
app.listen(PORT, () => {
  console.log(`\n  ${agent ? "Legal QA agent" : "Setup screen"} at http://localhost:${PORT}\n`);
  if (missingEnv.length) {
    console.log(`  Missing env: ${missingEnv.join(", ")}`);
    console.log(`  Fill .env then restart. See README.md.\n`);
  }
  if (agentLoadError) {
    console.log(`  Agent load error: ${agentLoadError}\n`);
  }
});
