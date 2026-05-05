# create-schift

Scaffold a new Schift AI agent project from a Use-case template.

```bash
npx create-schift@latest
```

> ⚠️ **Schift Cloud API key required.** The generated templates call Schift Cloud
> for RAG, LLM routing, and agent execution. You must provide a
> `SCHIFT_API_KEY` environment variable. Usage is billed according to
> [Schift Cloud Pricing](https://schift.io/pricing). Get a key at
> <https://schift.io/app>.
>
> The Schift engine, API server, worker, and domain services (e.g. models-law)
> are **proprietary** and are not shipped by this CLI. Enterprise customers can
> request an on-prem deployment bundle (Docker Compose + Terraform) under
> contract.

## Available templates

| Template | Purpose | Schift Cloud key required? |
|----------|---------|---------------------------|
| `blank` | minimal TypeScript agent starter | yes (for runtime) |
| `managed-agent` | agent wired to Schift Cloud execution | **yes** |
| `cs-chatbot` | customer-support chatbot over your docs | **yes** |
| `legal-qa` | Korean legal Q&A + drafting starter | **yes** |
| `law-firm-chatbot` | 로펌 의뢰인 1차 상담 + 변호사 배정 | **yes** |
| `contract-review` | 계약서 리뷰 (client-side PII masking + 의견 초안) | **yes** |
| `case-intake` | 사건 인테이크 (요약 · 쟁점 · 적용 법령 자동) | **yes** |
| `compliance-monitor` | 규정 위반 모니터 (금융 · 공공 컴플라이언스) | **yes** |

**All Lawyers use-case templates (`legal-qa`, `law-firm-chatbot`, `contract-review`,
`case-intake`, `compliance-monitor`) are thin scaffolds that call Schift Cloud's
legal API. They do NOT work standalone — a valid `SCHIFT_API_KEY` is mandatory.
Get one at <https://app.schift.io/api-keys>.**

Schift Cloud enforces tier-based quotas on the legal API:
Free 100 / Pro 5,000 / Team 50,000 / Business 500,000 calls per month per org.
See `docs/research/PRICING.md` for current numbers.

## What you get

Each template is a standalone TypeScript project that:

1. Loads your `SCHIFT_API_KEY` from `.env`.
2. Uses the public `@schift-io/sdk` client to call Schift Cloud.
3. Ships with a minimal UI and a sample corpus so you can see a response on day one.

## What you do NOT get

- The Schift Rust engine (sub-300µs vector search, SQ8 compression) — proprietary.
- The Schift API server and worker (RAG orchestration, ingestion pipeline) — proprietary.
- Domain services (legal graph / template store / drafters under `models/law`) — proprietary.

If you need any of the above deployed inside your own infrastructure, contact
sales@schift.io about the Enterprise on-prem bundle.

## License

The `create-schift` CLI is MIT-licensed and safe to fork/vendor.
The generated templates are MIT-licensed reference implementations. The Schift
Cloud services they call, and the `@schift-io/doc-redact` / `@schift-io/local-llm`
client SDKs they may depend on, are proprietary and governed by the
[Schift Terms of Service](https://schift.io/terms).
