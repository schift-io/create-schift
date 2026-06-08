import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "url";
import { SAMPLE_LEGAL_MEMO, SAMPLE_QUESTIONS } from "./sample.js";
import type {
  AskRequest,
  AskResponse,
  IngestRequest,
  IngestResponse,
  PiiPreset,
  RedactRequest,
  RedactResponse,
  RedactionEntity,
} from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json({ limit: "256kb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

const apiBase = process.env.SCHIFT_API_URL || "https://api.schift.io";
const configuredBucketId = process.env.SCHIFT_BUCKET_ID || "";
const bucketTopic = process.env.SCHIFT_BUCKET_TOPIC || "{{PROJECT_SLUG}}-legal-rag";
const bucketName = process.env.SCHIFT_BUCKET_NAME || deriveBucketName(bucketTopic);
const defaultPreset = parsePreset(process.env.SCHIFT_PII_PRESET || "strong");
const BUCKET_NAME_RE = /^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/;
const missingEnv: string[] = [];
if (!process.env.SCHIFT_API_KEY) missingEnv.push("SCHIFT_API_KEY");
const setupErrors = configuredBucketId ? [] : validateBucketName(bucketName);
let runtimeBucket: { id: string; name: string; created: boolean } | null = configuredBucketId
  ? { id: configuredBucketId, name: bucketName, created: false }
  : null;

if (missingEnv.length || setupErrors.length) {
  console.warn(
    `[{{PROJECT_NAME}}] WARNING setup required. Missing env: ${missingEnv.join(", ") || "none"}. ${setupErrors.join(" ")} Key: https://app.schift.io/api-keys`,
  );
}

type RedactionSession = {
  originalHash: string;
  redactedHash: string;
  redactedText: string;
  entityCount: number;
  createdAt: number;
};

const redactionSessions = new Map<string, RedactionSession>();

function sha256(input: string): string {
  return `sha256:${createHash("sha256").update(input).digest("hex")}`;
}

function shortHash(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 8);
}

function slugifyTopic(input: string): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 54)
    .replace(/^-+|-+$/g, "");
  return slug || "legal-rag";
}

function deriveBucketName(topic: string): string {
  return `${slugifyTopic(topic)}-${shortHash(topic)}`;
}

function validateBucketName(name: string): string[] {
  if (name.length < 3) return ["SCHIFT_BUCKET_NAME must be at least 3 characters."];
  if (name.length > 63) return ["SCHIFT_BUCKET_NAME must be at most 63 characters."];
  if (!BUCKET_NAME_RE.test(name)) {
    return [
      "SCHIFT_BUCKET_NAME must use lowercase letters, numbers, and hyphens only, and start/end with a letter or number.",
    ];
  }
  return [];
}

function parsePreset(value: string): PiiPreset {
  if (value === "default" || value === "full" || value === "strong") return value;
  return "strong";
}

function thresholdForPreset(preset: PiiPreset): number {
  if (preset === "full") return 0.2;
  if (preset === "strong") return 0.35;
  return 0.5;
}

function summarizeEntities(entities: RedactionEntity[]): Record<string, number> {
  return entities.reduce<Record<string, number>>((acc, entity) => {
    acc[entity.type] = (acc[entity.type] ?? 0) + 1;
    return acc;
  }, {});
}

function normalizeEntities(raw: unknown): RedactionEntity[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entity: any) => ({
    type: String(entity.label ?? entity.type ?? "unknown"),
    text: String(entity.word ?? entity.text ?? ""),
    start: Number(entity.start ?? 0),
    end: Number(entity.end ?? 0),
    score: Number(entity.score ?? 0),
  }));
}

function cleanupSessions(): void {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, session] of redactionSessions.entries()) {
    if (session.createdAt < cutoff) redactionSessions.delete(id);
  }
}

function requireSetup(res: express.Response): boolean {
  if (!missingEnv.length && !setupErrors.length) return false;
  res.status(503).json({ error: "setup-required", missingEnv, setupErrors });
  return true;
}

async function ensureBucket(): Promise<{ id: string; name: string; created: boolean }> {
  if (runtimeBucket) return runtimeBucket;

  const createResp = await fetch(`${apiBase}/v1/buckets`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.SCHIFT_API_KEY}`,
    },
    body: JSON.stringify({
      name: bucketName,
      description: "PII-safe legal RAG demo bucket created by create-schift.",
    }),
  });

  if (createResp.ok) {
    const data = await createResp.json();
    runtimeBucket = { id: data.id, name: data.name ?? bucketName, created: true };
    return runtimeBucket;
  }

  if (createResp.status === 409) {
    const listResp = await fetch(`${apiBase}/v1/buckets`, {
      headers: { Authorization: `Bearer ${process.env.SCHIFT_API_KEY}` },
    });
    if (!listResp.ok) {
      const detail = await listResp.text();
      throw new Error(`Bucket exists but lookup failed (${listResp.status}): ${detail}`);
    }
    const buckets = await listResp.json();
    const existing = Array.isArray(buckets)
      ? buckets.find((bucket: any) => bucket?.name === bucketName)
      : null;
    if (!existing?.id) {
      throw new Error(`Bucket '${bucketName}' already exists but was not visible in /v1/buckets`);
    }
    runtimeBucket = { id: existing.id, name: existing.name ?? bucketName, created: false };
    return runtimeBucket;
  }

  const detail = await createResp.text();
  throw new Error(`Bucket create failed (${createResp.status}): ${detail}`);
}

async function redactWithSchift(input: RedactRequest): Promise<{
  redactedText: string;
  entities: RedactionEntity[];
  dataUse: string | null;
}> {
  const preset = parsePreset(input.preset || defaultPreset);
  const resp = await fetch(`${apiBase}/v1/pii/redact`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.SCHIFT_API_KEY}`,
    },
    body: JSON.stringify({
      text: input.text,
      return: "both",
      score_threshold: thresholdForPreset(preset),
    }),
  });

  if (!resp.ok) {
    const detail = await resp.text();
    throw new Error(`PII redaction failed (${resp.status}): ${detail}`);
  }

  const data = await resp.json();
  return {
    redactedText: data.masked ?? input.text,
    entities: normalizeEntities(data.entities),
    dataUse: resp.headers.get("x-schift-data-use"),
  };
}

async function ingestRedactedText(input: {
  redactedText: string;
  title: string;
  sessionId: string;
  entityCount: number;
}): Promise<IngestResponse> {
  const bucket = await ensureBucket();
  const filename = `${deriveBucketName(input.title || "redacted-legal-memo")}.txt`;
  const body = [
    `title: ${input.title}`,
    "redacted_before_ingest: true",
    `redaction_session_id: ${input.sessionId}`,
    `pii_entities_removed: ${input.entityCount}`,
    "",
    input.redactedText,
  ].join("\n");

  const form = new FormData();
  form.append(
    "files",
    new Blob([body], { type: "text/plain" }),
    filename,
  );
  form.append(
    "metadata",
    JSON.stringify({
      template: "pii-safe-legal-rag",
      redacted_before_ingest: true,
      redaction_session_id: input.sessionId,
      pii_entities_removed: input.entityCount,
      schift_source_kind: "paste",
    }),
  );

  const resp = await fetch(`${apiBase}/v1/buckets/${bucket.id}/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.SCHIFT_API_KEY}` },
    body: form,
  });

  if (!resp.ok) {
    const detail = await resp.text();
    throw new Error(`Bucket ingest failed (${resp.status}): ${detail}`);
  }

  const data = await resp.json();
  return {
    bucketId: bucket.id,
    bucketName: bucket.name,
    bucketCreated: bucket.created,
    jobs: data.jobs ?? [],
    safetyTrace: {
      redactedBeforeIngest: true,
      redactionSessionId: input.sessionId,
      entityCount: input.entityCount,
    },
  };
}

async function askLegalRag(input: AskRequest, latestSessionId: string | null): Promise<AskResponse> {
  const bucket = input.bucketId ? { id: input.bucketId } : await ensureBucket();
  const targetBucket = bucket.id;
  const question = input.question?.trim();
  if (!question) throw new Error("question is required");

  const resp = await fetch(`${apiBase}/v2/buckets/${targetBucket}/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.SCHIFT_API_KEY}`,
    },
    body: JSON.stringify({
      query: question,
      top_k: 6,
      options: {
        rerank: { enabled: true },
        instructions: { task: "question_answering" },
      },
    }),
  });

  if (!resp.ok) {
    const detail = await resp.text();
    throw new Error(`Bucket search failed (${resp.status}): ${detail}`);
  }

  const data = await resp.json();
  const sources = normalizeSearchSources(data);
  return {
    answer: buildRetrievalAnswer(question, sources),
    sources,
    disclaimer: "검색 기반 요약이며 법률 자문이 아닙니다. 변호사 검토가 필요합니다.",
    safetyTrace: {
      bucketContainsRedactedTextOnly: true,
      redactionSessionId: latestSessionId,
    },
  };
}

function normalizeSearchSources(searchResponse: unknown): Array<{
  title: string;
  excerpt: string;
  score: number;
  chunkId: string;
}> {
  const response = searchResponse as any;
  const results = Array.isArray(response?.results)
    ? response.results
    : Array.isArray(response?.citations)
      ? response.citations.map((citation: any) => ({
          id: citation.chunk_id ?? citation.document_id ?? citation.source_id,
          text: response.context,
          score: 1,
          metadata: citation,
          citation: citation.title ?? citation.source_url,
        }))
      : [];
  if (!Array.isArray(results)) return [];
  return results.slice(0, 6).map((result: any, index) => ({
    title: String(
      result?.metadata?.file_name ??
        result?.metadata?.title ??
        result?.citation ??
        `source-${index + 1}`,
    ),
    excerpt: String(result?.text ?? "").slice(0, 700),
    score: Number(result?.score ?? 0),
    chunkId: String(result?.id ?? result?.metadata?.chunk_id ?? ""),
  }));
}

function buildRetrievalAnswer(
  question: string,
  sources: Array<{ excerpt: string; title: string }>,
): string {
  if (!sources.length) {
    return `아직 검색 가능한 chunk가 없습니다. 업로드 job 처리가 끝난 뒤 다시 질문하세요: "${question}"`;
  }
  const bullets = sources
    .slice(0, 3)
    .map((source, index) => `${index + 1}. ${source.excerpt || source.title}`)
    .join("\n");
  return `질문: ${question}\n\n관련 근거:\n${bullets}`;
}

app.get("/api/health", (_req, res) => {
  const isReady = missingEnv.length === 0 && setupErrors.length === 0;
  res.json({
    status: isReady ? "ok" : "setup-required",
    template: "pii-safe-legal-rag",
    missingEnv,
    setupErrors,
    docs: "https://app.schift.io/api-keys",
    capabilities: {
      redact: Boolean(process.env.SCHIFT_API_KEY),
      ingest: isReady,
      ask: isReady,
    },
    apiBase,
    bucket: runtimeBucket ?? {
      id: configuredBucketId || null,
      name: bucketName,
      topic: bucketTopic,
      mode: configuredBucketId ? "configured" : "auto-create",
    },
    sample: {
      memo: SAMPLE_LEGAL_MEMO,
      questions: SAMPLE_QUESTIONS,
    },
  });
});

app.post("/api/redact", async (req, res) => {
  if (requireSetup(res)) return;
  cleanupSessions();

  const { text, preset } = req.body as RedactRequest;
  if (!text || typeof text !== "string" || !text.trim()) {
    res.status(400).json({ error: "text is required" });
    return;
  }
  if (text.trim().length < 20) {
    res.status(400).json({ error: "text must be at least 20 characters" });
    return;
  }
  if (text.length > 8192) {
    res.status(413).json({ error: "text exceeds 8192 character PII beta limit" });
    return;
  }

  try {
    const redacted = await redactWithSchift({ text, preset });
    const redactionSessionId = `rs_${randomUUID().replaceAll("-", "")}`;
    const originalHash = sha256(text);
    const redactedHash = sha256(redacted.redactedText);
    redactionSessions.set(redactionSessionId, {
      originalHash,
      redactedHash,
      redactedText: redacted.redactedText,
      entityCount: redacted.entities.length,
      createdAt: Date.now(),
    });

    const response: RedactResponse = {
      redactionSessionId,
      originalHash,
      redactedHash,
      redactedText: redacted.redactedText,
      entities: redacted.entities,
      summary: summarizeEntities(redacted.entities),
      canIngest: true,
      dataUse: redacted.dataUse,
    };
    res.json(response);
  } catch (err) {
    res.status(502).json({
      error: "redaction_failed",
      detail: err instanceof Error ? err.message : "unknown error",
    });
  }
});

app.post("/api/ingest", async (req, res) => {
  if (requireSetup(res)) return;
  cleanupSessions();

  const { redactionSessionId, redactedText, title } = req.body as IngestRequest;
  const session = redactionSessionId ? redactionSessions.get(redactionSessionId) : null;
  if (!session) {
    res.status(400).json({ error: "valid redactionSessionId is required" });
    return;
  }
  if (!redactedText || sha256(redactedText) !== session.redactedHash) {
    res.status(400).json({ error: "redactedText does not match the redaction session" });
    return;
  }
  if (sha256(redactedText) === session.originalHash) {
    res.status(400).json({ error: "refusing to ingest text that matches original input" });
    return;
  }

  try {
    const result = await ingestRedactedText({
      redactedText,
      title: title?.trim() || "redacted-legal-memo",
      sessionId: redactionSessionId,
      entityCount: session.entityCount,
    });
    res.json(result);
  } catch (err) {
    res.status(502).json({
      error: "ingest_failed",
      detail: err instanceof Error ? err.message : "unknown error",
    });
  }
});

app.post("/api/ask", async (req, res) => {
  if (requireSetup(res)) return;
  try {
    const latestSessionId = Array.from(redactionSessions.keys()).at(-1) ?? null;
    const result = await askLegalRag(req.body as AskRequest, latestSessionId);
    res.json(result);
  } catch (err) {
    res.status(502).json({
      error: "ask_failed",
      detail: err instanceof Error ? err.message : "unknown error",
    });
  }
});

const PORT = parseInt(process.env.PORT ?? "3805", 10);
app.listen(PORT, () => {
  const label = missingEnv.length || setupErrors.length ? "Setup screen" : "PII-Safe Legal RAG";
  console.log(`\n  ${label} at http://localhost:${PORT}\n`);
});
