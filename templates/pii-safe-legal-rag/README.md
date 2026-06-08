# {{PROJECT_NAME}} — PII-Safe Legal RAG

> **Schift Cloud API key required.** This starter calls Schift Cloud for PII
> redaction, redacted document ingest, and citation-backed legal RAG.
> Get a key at <https://app.schift.io/api-keys>.

Paste a Korean legal memo, 상담 기록, or contract excerpt. The starter redacts
PII first, uploads only the redacted text to a Schift bucket, then asks questions
against that bucket with sources.

## Quick Start

```bash
cp .env.example .env
# Fill SCHIFT_API_KEY. SCHIFT_BUCKET_ID is optional; the starter can create a demo bucket.
npm install
npm run dev
# http://localhost:3805
```

## Environment

| Variable | Required | Description |
|---|---:|---|
| `SCHIFT_API_KEY` | yes | Schift Cloud API key |
| `SCHIFT_API_URL` | no | Defaults to `https://api.schift.io` |
| `SCHIFT_BUCKET_ID` | no | Existing bucket override. If empty, the starter creates/reuses a demo bucket |
| `SCHIFT_BUCKET_TOPIC` | no | Topic used to derive the auto bucket name |
| `SCHIFT_BUCKET_NAME` | no | Explicit bucket name override. If empty, uses `<topic-slug>-<topic-hash>` |
| `SCHIFT_PII_PRESET` | no | `strong`, `default`, or `full`; default `strong` |
| `PORT` | no | Local server port, default `3805` |

## Pipeline

```text
legal text
  -> /api/redact
  -> Schift /v1/pii/redact
  -> review redacted text
  -> /api/ingest
  -> Schift /v1/buckets/{bucket_id}/upload
  -> /api/ask
  -> Schift /v2/buckets/{bucket_id}/search
  -> retrieval answer + sources
```

## Security Model

- The starter refuses to ingest text unless it matches a current redaction
  session.
- If `SCHIFT_BUCKET_ID` is empty, the starter creates or reuses a Schift bucket
  named by `SCHIFT_BUCKET_NAME`, or `<topic-slug>-<topic-hash>` when no explicit
  bucket name is provided.
- Auto bucket names follow the dashboard rule: lowercase letters, numbers, and
  hyphens only; 3-63 characters.
- Raw text is not written to local audit logs.
- Redacted text is uploaded as a `.txt` document with metadata:
  `redacted_before_ingest=true`.
- Schift Cloud receives text for redaction unless you replace the redaction
  adapter with a local-only redactor.

Redaction reduces risk; it is not a guarantee of perfect anonymization. Review
the redacted preview before ingesting.

## API Surface

Local endpoints:

- `GET /api/health`
- `POST /api/redact`
- `POST /api/ingest`
- `POST /api/ask`

## Legal Notice

This starter is for document search, safety review, and draft analysis. It does
not provide legal advice. All outputs should be reviewed by a qualified lawyer.
