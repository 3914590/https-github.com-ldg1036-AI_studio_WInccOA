import { GoogleGenAI, Type } from "@google/genai";
import { CodeReviewResult, ReviewIssue, PerformanceResult } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const SYSTEM_INSTRUCTION = `당신은 지멘스 WinCC OA(Open Architecture) 전문 개발자이자 코드 감사관입니다.
1차 규칙 기반 엔진이 이미 코드를 분석하여 구조적인 문제들을 발견했습니다.

당신의 임무:
1. 규칙 문제 보완 (ENRICH RULE ISSUES): 규칙 엔진이 발견한 각 문제에 대해, 제공된 코드에 맞춘 구체적이고 실행 가능한 코드 수정안(마크다운 코드 블록 사용)을 제공하세요. 'enrichedRuleSuggestions' 배열에 규칙 문제의 'id'와 'line'을 일치시켜 반환하세요.
2. 새로운 문제 발견 (FIND NEW ISSUES): 규칙이 잡아내지 못한 논리적, 성능적, 보안적 문제가 있는지 코드를 별도로 추가 분석하세요. 발견된 문제는 'newAiIssues' 배열에 추가하세요.
3. 요약 및 점수 (SUMMARY & SCORE): 전체적인 코드 품질에 대한 종합 요약과 준수 점수(0-100)를 제공하세요.
4. 리팩토링 코드 (REFACTORED CODE): 제안한 모든 수정사항이 적용된 전체 코드를 'refactoredCode' 필드에 제공하세요.

중요: 모든 출력(summary, description, suggestion 등)은 반드시 **한국어**로 작성해야 합니다.`;

function handleApiError(e: any): never {
  console.error("Gemini API Error:", e);
  const errorMessage = e.message || String(e);
  
  if (
    errorMessage.includes("429") || 
    errorMessage.includes("RESOURCE_EXHAUSTED") || 
    errorMessage.includes("quota")
  ) {
    throw new Error("RATE_LIMIT: 일일 API 사용량 제한(Quota)을 초과했습니다. 잠시 후 다시 시도하거나, Google AI Studio에서 결제 및 할당량을 확인해주세요.");
  }
  
  throw new Error(`API_ERROR: ${errorMessage}`);
}

export async function reviewWinCCOACode(code: string, ruleIssues: ReviewIssue[]): Promise<CodeReviewResult> {
  const model = "gemini-3.1-pro-preview";
  
  const prompt = `
다음은 분석할 WinCC OA CTRL 코드입니다:
\`\`\`
${code}
\`\`\`

1차 규칙 기반 엔진이 이미 다음 문제들을 발견했습니다:
${JSON.stringify(ruleIssues, null, 2)}

전체 요약(summary), 최종 점수(score), 규칙 문제에 대한 구체적인 코드 수정 제안(enrichedRuleSuggestions), AI가 새롭게 발견한 추가 문제(newAiIssues), 그리고 모든 제안이 적용된 전체 리팩토링 코드(refactoredCode)를 한국어로 작성하여 제공해주세요.
  `;

  let response;
  try {
    response = await ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            score: { type: Type.NUMBER },
            enrichedRuleSuggestions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  line: { type: Type.NUMBER },
                  suggestion: { type: Type.STRING }
                },
                required: ["id", "suggestion"]
              }
            },
            newAiIssues: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  severity: { type: Type.STRING, enum: ["critical", "warning", "info"] },
                  line: { type: Type.NUMBER },
                  category: { type: Type.STRING },
                  description: { type: Type.STRING },
                  suggestion: { type: Type.STRING },
                },
                required: ["severity", "category", "description", "suggestion"],
              }
            },
            refactoredCode: { type: Type.STRING }
          },
          required: ["summary", "score", "enrichedRuleSuggestions", "newAiIssues", "refactoredCode"],
        },
      },
    });
  } catch (e: any) {
    handleApiError(e);
  }

  try {
    const aiResult = JSON.parse(response.text || "{}");
    
    // Merge enriched suggestions into rule issues
    const finalRuleIssues = ruleIssues.map(ruleIssue => {
      const enrichment = (aiResult.enrichedRuleSuggestions || []).find(
        (e: any) => e.id === ruleIssue.id && (e.line === ruleIssue.line || !ruleIssue.line)
      );
      if (enrichment && enrichment.suggestion) {
        return { ...ruleIssue, suggestion: enrichment.suggestion };
      }
      return ruleIssue;
    });

    const finalAiIssues: ReviewIssue[] = (aiResult.newAiIssues || []).map((issue: any) => ({
      ...issue,
      source: 'ai',
      id: 'AI-INSIGHT'
    }));

    return {
      summary: aiResult.summary || "분석이 완료되었습니다.",
      score: aiResult.score || 100,
      issues: [...finalRuleIssues, ...finalAiIssues],
      refactoredCode: aiResult.refactoredCode
    };
  } catch (e) {
    console.error("Failed to parse AI response", e);
    throw new Error("PARSE_ERROR: Failed to parse the AI response format.");
  }
}

export async function suggestCodeCompletion(prefix: string, suffix: string): Promise<string> {
  const model = "gemini-3.1-pro-preview";
  
  const prompt = `You are an AI code completion tool for Siemens WinCC OA CTRL script.
Provide the missing code that connects the PREFIX and SUFFIX.
Return ONLY the raw code to be inserted. Do not include markdown formatting like \`\`\`c or \`\`\`.
Do not include explanations.

PREFIX:
${prefix}

SUFFIX:
${suffix}`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        systemInstruction: "You are a WinCC OA CTRL script expert. Return only the exact code snippet to insert.",
        temperature: 0.2,
      },
    });
    
    let completion = response.text || "";
    // Clean up markdown formatting if the AI still includes it
    completion = completion.replace(/^```[a-zA-Z]*\n/i, '').replace(/\n```$/i, '');
    return completion;
  } catch (e: any) {
    handleApiError(e);
  }
}

export async function formatWinCCOACode(code: string): Promise<string> {
  const model = "gemini-3.1-pro-preview";
  
  const prompt = `지멘스 WinCC OA CTRL 스크립트 전문가로서 다음 코드를 가독성 있게 리포맷팅하고 변수 명명 규칙을 표준화해주세요.
- 들여쓰기: 2 spaces
- 변수명: camelCase (예: iCount, sName, bActive)
- 함수명: PascalCase (예: Main, ProcessData)
- 연산자 주변 공백 추가
- 중괄호 위치 통일 (Allman style 또는 K&R style 중 하나로 통일)
- DP 이름은 큰따옴표로 감싸기

원본 코드:
\`\`\`
${code}
\`\`\`

리포맷팅된 전체 코드만 반환하세요. 마크다운 기호(\`\`\`)는 제외하고 순수 코드만 반환하세요.`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        systemInstruction: "당신은 WinCC OA CTRL 코드 포맷터입니다. 오직 포맷팅된 코드만 반환하세요.",
        temperature: 0.1,
      },
    });
    
    let formatted = response.text || code;
    formatted = formatted.replace(/^```[a-zA-Z]*\n/i, '').replace(/\n```$/i, '');
    return formatted;
  } catch (e: any) {
    handleApiError(e);
  }
}

export async function generateWinCCOAUnitTest(code: string): Promise<string> {
  const model = "gemini-3.1-pro-preview";
  
  const prompt = `지멘스 WinCC OA CTRL 스크립트 전문가로서 다음 코드에 대한 단위 테스트 코드를 작성해주세요.
- WinCC OA의 'unittest' 프레임워크 형식을 사용하세요.
- 주요 함수들에 대해 다양한 입력값(정상, 경계값, 에러 케이스)을 테스트하는 케이스를 포함하세요.
- 'assert' 함수들을 적절히 사용하세요.
- 테스트 스크립트의 구조를 명확히 하세요.

원본 코드:
\`\`\`
${code}
\`\`\`

생성된 단위 테스트 코드만 반환하세요. 마크다운 기호(\`\`\`)는 제외하고 순수 코드만 반환하세요.`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        systemInstruction: "당신은 WinCC OA 단위 테스트 전문가입니다. 오직 테스트 코드만 반환하세요.",
        temperature: 0.2,
      },
    });
    
    let testCode = response.text || "";
    testCode = testCode.replace(/^```[a-zA-Z]*\n/i, '').replace(/\n```$/i, '');
    return testCode;
  } catch (e: any) {
    handleApiError(e);
  }
}

export async function generateWinCCOADocumentation(code: string): Promise<string> {
  const model = "gemini-3.1-pro-preview";
  
  const prompt = `지멘스 WinCC OA CTRL 스크립트 전문가로서 다음 코드에 대한 상세 기술 문서를 작성해주세요.
- 문서 형식: Markdown
- 포함 내용:
  1. 스크립트 개요 (Overview)
  2. 주요 함수 설명 (인자, 반환값, 기능)
  3. 사용된 Data Point(DP) 목록 및 용도
  4. 주요 로직 흐름 (Logic Flow)
  5. 주의 사항 및 개선 제안
- 언어: 한국어

원본 코드:
\`\`\`
${code}
\`\`\`

마크다운 형식의 문서 내용만 반환하세요.`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        systemInstruction: "당신은 WinCC OA 기술 문서 작성 전문가입니다. 상세하고 전문적인 마크다운 문서를 작성하세요.",
        temperature: 0.3,
      },
    });
    
    return response.text || "문서 생성에 실패했습니다.";
  } catch (e: any) {
    handleApiError(e);
  }
}

export async function generateWinCCOAFlowchart(code: string): Promise<string> {
  const model = "gemini-3.1-pro-preview";
  
  const prompt = `지멘스 WinCC OA CTRL 스크립트 전문가로서 다음 코드의 로직 흐름을 분석하여 Mermaid.js 순서도(Flowchart) 코드를 생성해주세요.
- 다이어그램 유형: graph TD (Top Down)
- 노드 종류:
  - 시작/종료: ([Start]), ([End])
  - 프로세스: [Action]
  - 조건문: {Condition}
  - 반복문: {{Loop}}
  - 함수 호출: [[Function Call]]
- 화살표 라벨: Yes/No, True/False 등을 적절히 사용하세요.
- 복잡한 로직은 서브그래프(subgraph)를 사용하여 구조화하세요.
- 노드 텍스트는 한국어로 작성하세요.

원본 코드:
\`\`\`
${code}
\`\`\`

생성된 Mermaid 코드만 반환하세요. 마크다운 기호(\`\`\`mermaid 또는 \`\`\`)는 제외하고 순수 Mermaid 문법만 반환하세요.`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        systemInstruction: "당신은 WinCC OA 로직 시각화 전문가입니다. 오직 Mermaid.js 문법만 반환하세요.",
        temperature: 0.2,
      },
    });
    
    let mermaidCode = response.text || "";
    mermaidCode = mermaidCode.replace(/^```[a-zA-Z]*\n/i, '').replace(/\n```$/i, '');
    return mermaidCode;
  } catch (e: any) {
    handleApiError(e);
  }
}

export async function analyzePerformanceSnippet(snippet: string): Promise<PerformanceResult> {
  const model = "gemini-3.1-pro-preview";
  
  const prompt = `
다음은 성능 병목 현상을 분석할 WinCC OA CTRL 코드 스니펫입니다:
\`\`\`
${snippet}
\`\`\`

이 코드의 성능 병목 현상(예: 불필요한 중복 계산, 비효율적인 루프, WinCC OA 특화 비효율성 등)을 세밀하게 분석하고 구체적인 최적화 방안을 제시하세요.
특히 병목을 유발하는 특정 코드 라인(line)과 해당 코드 스니펫(codeSnippet)을 명시하고, 일반적인 조언을 넘어선 구체적이고 타겟팅된 최적화 제안(suggestion)을 제공해야 합니다.
모든 출력은 한국어로 작성해야 합니다.
  `;

  let response;
  try {
    response = await ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        systemInstruction: "당신은 WinCC OA 성능 최적화 전문가입니다. 코드의 성능 병목을 정확한 라인과 함께 찾아내고, 구체적이고 타겟팅된 최적화된 코드와 제안을 제공하세요.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            bottlenecks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  line: { type: Type.NUMBER },
                  codeSnippet: { type: Type.STRING },
                  description: { type: Type.STRING },
                  suggestion: { type: Type.STRING }
                },
                required: ["description", "suggestion"]
              }
            },
            optimizedCode: { type: Type.STRING }
          },
          required: ["summary", "bottlenecks", "optimizedCode"],
        },
      },
    });
  } catch (e: any) {
    handleApiError(e);
  }

  try {
    const result = JSON.parse(response.text || "{}");
    return {
      summary: result.summary || "성능 분석이 완료되었습니다.",
      bottlenecks: result.bottlenecks || [],
      optimizedCode: result.optimizedCode || snippet
    };
  } catch (e) {
    console.error("Failed to parse AI response", e);
    throw new Error("PARSE_ERROR: Failed to parse the AI response format.");
  }
}


