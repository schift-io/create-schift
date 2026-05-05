# {{PROJECT_NAME}} — 컴플라이언스 모니터

> **⚠️ Schift Cloud API key required.** `/v1/legal/qa`를 규정 bucket에 대해 호출합니다.
> API key 발급: <https://app.schift.io/api-keys>

내부 규정 문서(AML/KYC/개인정보보호법/업무규정 등)를 업로드한 후, 신규/의심 거래의
규정 위반 가능성을 챗 형태로 자문받는 컴플라이언스 팀용 에이전트. PII/DLP는 자동.

## 빠른 시작

```bash
cp .env.example .env
# SCHIFT_API_KEY + SCHIFT_BUCKET_ID 채우기
npm install
npm run dev
# → http://localhost:3804
```

## 환경변수

| 변수 | 필수 | 설명 |
|------|------|------|
| `SCHIFT_API_KEY` | ✅ | Schift Cloud API key |
| `SCHIFT_BUCKET_ID` | ✅ | 내부 규정 bucket ID |
| `REDACT_POLICY` | — | `default` / `strict` / `loose` (기본 strict) |

## 배포

Vercel / Railway / Render. `SCHIFT_API_KEY`, `SCHIFT_BUCKET_ID`를 프로덕션 env에 주입.

## 법적 고지

자동 판정은 참고용이며, 최종 판단은 컴플라이언스 담당자/변호사가 수행합니다.
감사 로그는 Schift Cloud `record_audit`에도 동시에 기록됩니다.
