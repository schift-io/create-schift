# {{PROJECT_NAME}} — 계약서 리뷰 초안

> **⚠️ Schift Cloud API key required.** 이 템플릿은 Schift Cloud `/v1/legal/draft`
> 엔드포인트를 호출합니다. 키 없이는 동작하지 않습니다.
> API key 발급: <https://app.schift.io/api-keys>

클라이언트 측 PII 마스킹(`@schift-io/doc-redact`) → Schift Cloud 리뷰 초안 생성.

## 흐름

1. 사용자가 계약서 전문을 붙여넣음
2. `@schift-io/doc-redact`이 브라우저→서버 전송 경로에서 PII 마스킹 (로컬 서버 레이어에서)
3. 마스킹된 텍스트만 Schift Cloud `/v1/legal/draft`로 전송
4. 리뷰 의견 초안 반환

## 빠른 시작

```bash
cp .env.example .env
# SCHIFT_API_KEY 채우기
npm install
npm run dev
# → http://localhost:3802
```

## 환경변수

| 변수 | 필수 | 설명 |
|------|------|------|
| `SCHIFT_API_KEY` | ✅ | Schift Cloud API key |
| `SCHIFT_BUCKET_ID` | — | 로펌 precedent/의견서 bucket |
| `REDACT_POLICY` | — | `default` / `strict` / `loose` |

## 배포

Vercel / Railway / Render. `SCHIFT_API_KEY`를 프로덕션 env에 주입하세요.

## 법적 고지

리뷰는 초안입니다. 외부 송출 전 변호사 최종 검토를 거치세요.
