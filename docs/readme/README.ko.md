# Banana Batch Studio

> 하나의 프롬프트로 여러 이미지를 일괄 처리하는 로컬 BANANA/Gemini 이미지 생성 데스크톱 앱입니다.

**언어**: [中文](../../README.md) | [繁體中文](README.zh-Hant.md) | [English](README.en.md) | [日本語](README.ja.md) | 한국어

현재 릴리스: `v2.0.2`

![macOS](https://img.shields.io/badge/macOS-12%2B-black)
![Windows](https://img.shields.io/badge/Windows-x64-blue)
![React](https://img.shields.io/badge/React-19-61dafb)
![Bun](https://img.shields.io/badge/Bun-runtime-f5f0e8)
![License](https://img.shields.io/badge/license-ISC-lightgrey)

Banana Batch Studio는 **동일한 프롬프트와 동일한 참조 이미지 세트를 여러 원본 이미지에 적용하고 병렬로 결과를 생성하는** 로컬 데스크톱 앱입니다.

전자상거래, 디자인, 영상, 숏폼 콘텐츠, AI 이미지 워크플로에 적합합니다. 원본 이미지를 추가하고, 필요하면 참조 이미지를 추가한 뒤, 공통 프롬프트와 모델 설정을 선택해 결과를 생성할 수 있습니다. 이미지는 사용자의 컴퓨터에서 설정한 Google Gemini API 또는 호환 릴레이 API로 직접 전송되며, 별도의 타사 앱 서버를 거치지 않습니다.

![Banana Batch Studio interface](../images/banana-batch-studio-interface.png)

> 현재 데스크톱 인터페이스.

![Banana Batch Studio concept](../images/banana-batch-studio-concept.png)

> 제품 콘셉트 이미지.

## 다운로드

최신 데스크톱 빌드는 GitHub Releases에서 받을 수 있습니다.

[Banana Batch Studio v2.0.2 다운로드](https://github.com/bleeeet/banana-batch-studio/releases/tag/v2.0.2)

| 플랫폼 | 패키지 | 참고 |
|---|---|---|
| macOS Apple Silicon | `Banana Batch Studio (Apple Silicon).app` | M1/M2/M3/M4 Mac용 |
| macOS Intel | `Banana Batch Studio (Intel).app` | Intel Mac용 |
| Windows x64 | `BananaBatchStudio-Windows-x64/` | `start.bat` 실행 |

## 기능

| 기능 | 설명 |
|---|---|
| 다중 이미지 추가 | 여러 이미지를 드래그하거나 이미지 / 폴더 선택 |
| 스택 미리보기 | 업로드 후 실제 썸네일을 겹친 카드 형태로 표시 |
| 참조 이미지 | 동일한 참조 이미지 세트를 모든 원본 이미지에 적용 |
| 실시간 병렬 처리 | 기본 최대 동시 처리 수 10, 최대 100까지 조정 가능 |
| Batch 모드 | Gemini Batch Job 지원, 대량 작업에 적합 |
| API 공급자 | Google 공식 API와 Gemini 호환 릴레이 API 지원 |
| 프리셋 | 프롬프트와 모델 설정을 JSON으로 저장, 가져오기, 내보내기 |
| 폴더 내보내기 | 성공한 결과를 다운로드 폴더의 일반 폴더로 일괄 저장 |
| 다국어 UI | 간체 중국어, 번체 중국어, English, 日本語, 한국어 |
| 로컬 실행 | 로컬 서비스는 `127.0.0.1:4178`에서 실행 |

## 빠른 시작

1. GitHub Releases에서 앱을 다운로드합니다.
2. `Banana Batch Studio (Apple Silicon).app` 또는 `Banana Batch Studio (Intel).app`을 엽니다.
3. Google 공식 API 또는 Gemini 호환 릴레이 API를 선택합니다.
4. API key를 저장합니다.
5. 이미지를 드래그하거나 이미지 / 폴더 선택 버튼을 클릭합니다.
6. 선택 사항: 참조 이미지 버튼으로 참조 이미지를 추가합니다.
7. 공통 프롬프트를 입력합니다.
8. 모델, 비율, 이미지 크기, Temperature, 요청 간격, 동시 처리 수를 선택합니다.
9. 생성 시작 버튼을 클릭합니다.
10. 개별 이미지 다운로드, 실패 항목 재시도, 저장된 작업 프롬프트 편집, 작업 재생성, 결과 폴더 내보내기를 할 수 있습니다.

macOS에서 개발자를 확인할 수 없다는 메시지가 나오면 Finder에서 앱을 우클릭하고 `Open`을 선택한 뒤 다시 확인하세요.

## API 공급자

| 공급자 | 적합한 경우 |
|---|---|
| Google 공식 API | Google AI Studio / Gemini API key 직접 사용 |
| Gemini 호환 릴레이 API | 호환 릴레이 서비스, 사용자 지정 API URL, 모델 목록 사용 |

앱에는 API key가 포함되어 있지 않습니다. 자신의 Google Gemini API key 또는 릴레이 API key가 필요합니다.

## 데이터와 개인정보

Banana Batch Studio는 로컬에서 실행됩니다. 작업 기록과 생성 파일은 사용자의 컴퓨터에 저장됩니다.

**Mac App 데이터 경로:**

```text
~/Library/Application Support/BananaBatchStudio/
  uploads/       업로드한 원본 이미지 복사본
  outputs/       생성 결과
  batch/         Batch 모드 요청 파일
  zips/          이전 ZIP 내보내기 캐시
  jobs.json      작업 기록
  api-keys.json  API key, 로컬 JSON으로 저장
```

**Windows 데이터 경로:**

```text
%APPDATA%\BananaBatchStudio\
```

공개 릴리스 패키지에는 개인 API key나 저장된 개인 프리셋이 포함되지 않습니다. API key와 프리셋은 사용자의 로컬 설정 디렉터리에 저장됩니다.

## 개발과 패키징

```bash
npm install
npm run dev
npm run package:mac
npm run package:windows
```

GitHub에는 소스 코드만 커밋하고, `.app` 및 Windows 패키지는 GitHub Releases에 업로드합니다.

## 사용 기술

- [Google Gemini / Google AI API](https://ai.google.dev/): 이미지 생성 모델 접근.
- [Bun](https://bun.sh/): 번들 로컬 런타임.
- [React](https://react.dev/): 데스크톱 Web UI.
- [Vite](https://vite.dev/): 프론트엔드 개발 및 프로덕션 빌드.

## License

ISC
