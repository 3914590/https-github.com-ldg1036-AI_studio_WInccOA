# WinCC OA 코드 감사 도구 (WinCC OA Code Auditor) v2.0.0

본 프로그램은 지멘스(Siemens)의 SCADA 시스템인 **WinCC OA**에서 사용하는 **CTRL(Control) 스크립트**를 분석하고 개선하기 위한 하이브리드 감사 도구입니다. 정적 규칙 엔진과 최신 AI(Gemini) 기술을 결합하여 코드의 품질, 보안, 성능을 극대화합니다.

## 🚀 주요 기능

### 1. 하이브리드 코드 리뷰
- **정적 규칙 엔진 (Quick Check):** WinCC OA 개발 표준 및 베스트 프랙티스를 기반으로 한 즉각적인 규칙 검사.
- **AI 정밀 분석 (AI Deep Review):** Gemini AI를 활용하여 로직의 결함, 보안 취약점, 유지보수성 등을 심층적으로 분석.

### 2. 스마트 개발 도구
- **코드 포맷팅 (Formatting):** 일관된 코딩 스타일을 위해 코드를 자동으로 정렬.
- **AI 자동 완성 (Auto-completion):** `Ctrl + Space`를 통해 현재 문맥에 맞는 코드 제안.
- **단위 테스트 생성 (Unit Test):** 분석된 코드를 검증하기 위한 테스트 스크립트 자동 생성.
- **기술 문서 생성 (Documentation):** 코드의 기능과 구조를 설명하는 마크다운 형식의 문서 생성.

### 3. 성능 및 시각화
- **선택 영역 성능 분석:** 특정 코드 블록의 성능 병목 현상을 분석하고 최적화 방안 제시.
- **로직 시각화 (Flowchart):** 복잡한 제어 흐름을 Mermaid 다이어그램으로 시각화 (AI 기반 및 정적 분석 지원).
- **고급 Diff 뷰어:** 원본 코드와 수정된 코드를 '분할(Split)' 또는 '통합(Unified)' 모드로 정밀 비교.

## 🛠 기술 스택
- **Frontend:** React, TypeScript, Tailwind CSS
- **AI Engine:** Google Gemini (via @google/genai)
- **Visualization:** Mermaid.js, Lucide Icons
- **Diff Engine:** jsdiff

## 📋 분석 항목 (주요 규칙)
- **보안:** SQL 인젝션 방지, 하드코딩된 자격 증명/IP 감지.
- **성능:** 루프 내 `dpGet/dpSet` 남용, `delay()` 누락, UI 블로킹 패턴.
- **안정성:** 0으로 나누기 방지, 동적 배열 메모리 누수, 예외 처리 누락.
- **가독성:** 함수 길이 과다, 매직 넘버 사용, 주석 누락.

---
*본 도구는 자동화된 리뷰 시스템으로, 최종 적용 전 전문가의 검토를 권장합니다.*
