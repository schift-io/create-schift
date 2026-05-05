# {{PROJECT_NAME}} — 로펌 챗봇 (의뢰인 1차 상담)

> **⚠️ Schift Cloud API key required.** 이 템플릿은 Schift Cloud의 `/v1/legal/qa`
> 엔드포인트를 호출합니다. 키 없이는 동작하지 않습니다.
> API key 발급: <https://app.schift.io/api-keys>

로펌/사내법무팀용 의뢰인 1차 응대 + 변호사 배정 흐름.

## 빠른 시작

```bash
cp .env.example .env
# SCHIFT_API_KEY 채우기
npm install
npm run dev
# → http://localhost:3801
```

## 환경변수

| 변수 | 필수 | 설명 |
|------|------|------|
| `SCHIFT_API_KEY` | ✅ | Schift Cloud API key (app.schift.io/api-keys) |
| `SCHIFT_API_URL` | — | default `https://api.schift.io` |
| `SCHIFT_BUCKET_ID` | — | 로펌 내부 지식 bucket (사내 매뉴얼, FAQ) |
| `ASSIGN_WEBHOOK_URL` | — | 변호사 배정 알림을 보낼 Slack/이메일 webhook |

## 배포

- Vercel: `npx vercel`
- Railway: `railway up`
- Render: connect repo, use `npm run build` / `npm start`

## 법적 고지

1차 응대 AI는 법률 자문이 아닙니다. 외부 송출 전 반드시 변호사 최종 검토를 거치세요.
