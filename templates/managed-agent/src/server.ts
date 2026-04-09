/**
 * Dev server that proxies to your Managed Agent on Schift Cloud.
 *
 * In production, call the Managed Agent API directly:
 *   POST https://api.schift.io/v1/agents/{agentId}/runs
 *
 * This server is for local development and testing only.
 */
import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { schift, getOrCreateAgent } from "./agent.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

let agentId: string | null = null;

app.post("/api/chat", async (req, res) => {
  const { message } = req.body;

  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "message is required" });
    return;
  }

  try {
    // Lazy init: find or create the managed agent
    if (!agentId) {
      agentId = await getOrCreateAgent();
    }

    // Start a run on Schift Cloud
    const runs = schift.agents.runs(agentId);
    const run = await runs.create({ message });

    // Poll for completion
    let result = run;
    for (let i = 0; i < 60; i++) {
      if (result.status !== "pending" && result.status !== "running") break;
      await new Promise((r) => setTimeout(r, 1000));
      result = await runs.get(run.id);
    }

    if (result.status === "success") {
      res.json({
        answer: result.outputText,
        agentId,
        runId: run.id,
        tokensUsed: result.tokensUsed,
        durationMs: result.durationMs,
      });
    } else {
      res.status(500).json({ error: result.error || "Agent run failed" });
    }
  } catch (err) {
    console.error("Agent error:", err);
    res.status(500).json({ error: "Agent failed to respond" });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", agentId });
});

const PORT = parseInt(process.env.PORT ?? "3787", 10);
app.listen(PORT, async () => {
  try {
    agentId = await getOrCreateAgent();
    console.log(`\n  Managed Agent "${agentId}" connected`);
  } catch (err) {
    console.log(`\n  Warning: Could not connect to agent (${(err as Error).message})`);
    console.log("  Run 'npm run deploy' first to create the agent.\n");
  }
  console.log(`  Dev server at http://localhost:${PORT}`);
  console.log(`  Chat API at http://localhost:${PORT}/api/chat\n`);
});
