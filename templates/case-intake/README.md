# {{PROJECT_NAME}} — 사건 인테이크 에이전트

> **⚠️ Schift Cloud API key required.** 이 템플릿은 Schift Cloud `/v1/legal/qa` 및
> 템플릿 렌더링을 호출합니다. API key 발급: <https://app.schift.io/api-keys>

의뢰인 초기 인테이크 폼 → 사건 요약·주요 쟁점·적용 법령·권장 다음 단계 자동 정리.

## 빠른 시작

```bash
cp .env.example .env
# SCHIFT_API_KEY 채우기
npm install
npm run dev
# → http://localhost:3803
```

## 환경변수

| 변수 | 필수 | 설명 |
|------|------|------|
| `SCHIFT_API_KEY` | ✅ | Schift Cloud API key |
| `SCHIFT_BUCKET_ID` | — | 법령/판례 bucket (Schift Cloud `legal_public_corpus` 기본 사용 가능) |

## 배포

Vercel / Railway / Render.

## 법적 고지

초기 정리는 참고용입니다. 모든 결과는 담당 변호사의 검토를 거쳐야 합니다.
