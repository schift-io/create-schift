import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { agent } from "./agent.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

app.post("/api/chat", async (req, res) => {
  const { message } = req.body;

  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "message is required" });
    return;
  }

  try {
    const result = await agent.run(message);
    res.json({
      answer: result.output,
      steps: result.steps,
      durationMs: result.totalDurationMs,
    });
  } catch (err) {
    console.error("Agent error:", err);
    res.status(500).json({ error: "Agent failed to respond" });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", agent: agent.name });
});

const PORT = parseInt(process.env.PORT ?? "3787", 10);
app.listen(PORT, () => {
  console.log(`\n  Agent "${agent.name}" running at http://localhost:${PORT}`);
  console.log(`  Chat UI at http://localhost:${PORT}`);
  console.log(`  API at http://localhost:${PORT}/api/chat\n`);
  console.log("  Watching for changes...\n");
});
