# {{PROJECT_NAME}} — Legal Q&A Agent

> ⚠️ **이 템플릿은 Schift Cloud를 호출합니다.** 실행하려면 `SCHIFT_API_KEY` 환경변수가
> 필요하며, 사용량은 [Schift Cloud Pricing](https://schift.io/pricing) 정책을 따릅니다.
> Schift 엔진/API 서버/워커/도메인 서비스(models-law 등)는 **비공개 (proprietary)** 이며,
> 이 템플릿에는 포함되지 않습니다. Enterprise 로펌은 Docker Compose + Terraform 온프레
> 번들로 동일 파이프라인을 자사 인프라에서 운영할 수 있습니다 (NDA 하 소스 감리 가능).

Schift 법률 Q&A + 서면 드래프터 스타터. Legalize.kr의 뼈대와 동일한 구조입니다.

## 5분 셋업

```bash
# 1) 의존성
npm install

# 2) .env 채우기
cp .env.example .env
# - SCHIFT_API_KEY: https://schift.io/app 에서 발급
# - LEGAL_BUCKET_ID: 대시보드에서 bucket 만들고 ID 복사

# 3) 샘플 법령/판례 corpus 업로드 (공공 자료 약 80건)
npm run seed -- --bucket-id <your-bucket-id>

# 4) 로컬 실행
npm run dev
# → http://localhost:3787
```

## 구조

```
src/
  server.ts              Express API + 정적 파일 서빙
  agent.ts               Schift Agent + RAG + tools 와이어링
  seed.ts                data/legal_seed.json → bucket 업로드
  tools/
    draft-document.ts    서면 초안 도구 (소장/의견서/통지서)
data/
  legal_seed.json        공공 법령/판례 샘플 (80+)
public/
  index.html             한국어 챗 UI + 샘플 질문 + 면책문
```

## 환경변수

| 변수 | 필수 | 설명 |
|------|------|------|
| `SCHIFT_API_KEY` | ✅ | Schift Cloud API 키 |
| `LEGAL_BUCKET_ID` | ✅ | 법률 자료 bucket ID |
| `SCHIFT_API_URL` | - | 기본 `https://api.schift.io` |
| `SCHIFT_PROVIDER_API_KEY` | - | BYOK LLM 키 (OpenAI-호환) |
| `SCHIFT_PROVIDER_ENDPOINT_URL` | - | BYOK endpoint base URL |
| `PORT` | - | 기본 3787 |

환경변수가 비어 있으면 서버는 크래시하지 않고 `/` 경로에 **셋업 화면**을 보여줍니다.

## 내 로펌 문서로 바꾸기

1. `data/legal_seed.json` 샘플은 Phase 1 데모용(공공 도메인)입니다.
2. 실제 운영에서는 로펌 내부 판례 DB·의견서·자문 이력을 별도 bucket에 올리세요.
   - 대시보드 업로드 또는 `POST /v1/buckets/{id}/upload` API
   - 지원 형식: PDF, DOCX, TXT, 이미지(OCR)
3. PII/기밀 데이터는 Schift의 Compliance Tier(PII 비식별화, DLP)와 같이 쓰세요.

## 배포

Vercel:
```bash
npx vercel
```
또는 Schift 네이티브:
```bash
npm run deploy   # npx schift deploy
```

## 법적 고지

본 템플릿은 Schift Cloud를 호출하는 공개 Use-case 예제입니다. 이 템플릿으로
만든 서비스의 법적 책임은 운영 주체에 있습니다. 답변은 반드시 **변호사 최종 승인**을
거쳐 외부에 전달하도록 운영하세요. 공공 법령·판례 외 데이터는 저작권·개인정보
보호법을 반드시 준수해야 합니다.

## 참고

- Schift Cloud 대시보드: https://schift.io/app
- 공개 SDK: https://www.npmjs.com/package/@schift-io/sdk
- Docs: https://docs.schift.io
- Legalize 레퍼런스 구현: https://legalize.kr
- Enterprise 온프레 배포 문의: sales@schift.io
