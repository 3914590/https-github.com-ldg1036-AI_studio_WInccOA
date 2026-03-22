/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Loader2, 
  Zap,
  FileCode,
  Sparkles,
  GitCompare,
  Edit3,
  Cpu
} from 'lucide-react';
import { reviewWinCCOACode, analyzePerformanceSnippet, suggestCodeCompletion, formatWinCCOACode, generateWinCCOAUnitTest, generateWinCCOADocumentation, generateWinCCOAFlowchart } from './services/gemini';
import { generateStaticFlowchart } from './services/staticParser';
import { runRuleEngine } from './services/ruleEngine';
import { CodeReviewResult, PerformanceResult } from './types';
import { cn } from './utils/cn';
import { Header } from './components/Header';
import { DiffViewer } from './components/DiffViewer';
import { ReviewResults } from './components/ReviewResults';
import { AlignLeft, TestTube, FileText, Share2, Activity } from 'lucide-react';

const PerformanceModal = React.lazy(() => import('./components/PerformanceModal').then(m => ({ default: m.PerformanceModal })));
const UnitTestModal = React.lazy(() => import('./components/UnitTestModal').then(m => ({ default: m.UnitTestModal })));
const DocumentationModal = React.lazy(() => import('./components/DocumentationModal').then(m => ({ default: m.DocumentationModal })));
const FlowchartModal = React.lazy(() => import('./components/FlowchartModal').then(m => ({ default: m.FlowchartModal })));

const EXAMPLES = [
  {
    name: "기본 예제 (Basic)",
    code: `main()
{
  string dp = "ExampleDP.value";
  float val;
  
  // Potential issue: No error handling for dpGet
  dpGet(dp, val);
  
  if (val > 100)
  {
    // Potential issue: Hardcoded value and no logging
    dpSet("AlarmDP.active", true);
  }
  
  // Potential performance issue: dpGet in a loop
  for(int i=1; i<=10; i++)
  {
    string dpe = "Motor_" + i + ".status";
    int status;
    dpGet(dpe, status); 
  }
}`
  },
  {
    name: "DB 쿼리 및 하드코딩 (DB & Hardcoding)",
    code: `main()
{
  dyn_dyn_anytype result;
  
  // Potential issue: SELECT *.* and _DPT IN
  dpQuery("SELECT '_original.._value' FROM '*.*' WHERE _DPT IN (\\"Valve\\", \\"Motor\\")", result);
  
  // String concatenation for SQL (SQL Injection risk)
  string userName = "admin";
  string query = sprintf("SELECT * FROM users WHERE name = '%s'", userName);
  
  // Hardcoded IP address
  string serverIp = "192.168.1.100";
  dpSet("System1:Config.ServerIP", serverIp);
}`
  },
  {
    name: "성능 저하 패턴 (Performance Issues)",
    code: `main()
{
  dyn_string dps;
  dyn_int values;
  
  // Potential issue: dpSet in a loop without dpSetWait
  for(int i=1; i<=100; i++)
  {
    dpSet("System1:Device_" + i + ".value", i);
    
    // Potential issue: delay inside a loop/callback
    delay(0, 100);
  }
  
  // Potential issue: multiple setValue calls instead of setMultiValue
  setValue("rect1", "backCol", "red");
  setValue("rect2", "backCol", "blue");
  setValue("rect3", "backCol", "green");
  
  // Potential issue: manual aggregation
  float total = 0;
  for(int i=1; i<=dynlen(values); i++) {
    total += values[i];
  }
}`
  },
  {
    name: "예외 처리 및 메모리 누수 (Exceptions & Memory)",
    code: `main()
{
  dyn_string items;
  int dividend = 100;
  int divisor = 0;
  
  // Potential issue: Division by zero without check
  int result = dividend / divisor;
  
  for(int i=0; i<10; i++)
  {
    dynAppend(items, "Item " + i);
  }
  // Potential issue: Missing dynClear(items) at the end
  
  // Potential issue: Unused variable
  int unusedVar = 42;
  
  // Potential issue: Dead code
  return;
  DebugTN("This will never be executed");
}`
  },
  {
    name: "복합 문제 (Complex Scenario)",
    code: `// 복잡한 시나리오: 여러 규칙 위반이 혼합된 코드
main()
{
  dyn_string deviceList;
  dyn_float values;
  string ip = "10.0.0.5"; // 하드코딩된 IP
  
  dpQuery("SELECT '_original.._value' FROM '*.*' WHERE _DPT IN (\\"Sensor\\")", deviceList);
  
  for(int i=1; i<=dynlen(deviceList); i++)
  {
    float val;
    dpGet(deviceList[i], val); // 루프 내 개별 dpGet
    
    if (val > 50.0) {
      dpSet("Alarm.active", true); // 하드코딩된 DP, 에러 처리 누락
      delay(0, 500); // 루프 내 delay
    }
    
    dynAppend(values, val);
  }
  
  // 수동 집계
  float sum = 0;
  for(int j=1; j<=dynlen(values); j++) {
    sum += values[j];
  }
  
  // UI 블로킹 및 다중 setValue
  setValue("txtSum", "text", sum);
  setValue("txtSum", "backCol", "yellow");
  
  // SQL 인젝션 취약점
  string query = sprintf("UPDATE settings SET val=%f WHERE ip='%s'", sum, ip);
  
  // 메모리 해제 누락 (dynClear(deviceList), dynClear(values))
}`
  }
];

export default function App() {
  const [code, setCode] = useState(EXAMPLES[0].code);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<CodeReviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [viewMode, setViewMode] = useState<'edit' | 'diff'>('edit');
  const [selectedText, setSelectedText] = useState('');
  const [isAnalyzingPerformance, setIsAnalyzingPerformance] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isFormatting, setIsFormatting] = useState(false);
  const [isGeneratingTest, setIsGeneratingTest] = useState(false);
  const [isGeneratingDocs, setIsGeneratingDocs] = useState(false);
  const [isVisualizing, setIsVisualizing] = useState(false);
  const [performanceResult, setPerformanceResult] = useState<PerformanceResult | null>(null);
  const [testCode, setTestCode] = useState<string | null>(null);
  const [documentation, setDocumentation] = useState<string | null>(null);
  const [mermaidCode, setMermaidCode] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSelectionChange = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const text = textarea.value.substring(textarea.selectionStart, textarea.selectionEnd);
    setSelectedText(text.trim());
  };

  const handleTextareaClick = (e: React.MouseEvent<HTMLTextAreaElement>) => {
    if (!e.ctrlKey && !e.metaKey) return;
    
    const textarea = textareaRef.current;
    if (!textarea) return;

    const pos = textarea.selectionStart;
    const text = textarea.value;
    
    let start = pos;
    let end = pos;
    
    // Find word boundaries
    while (start > 0 && /[\w_]/.test(text[start - 1])) start--;
    while (end < text.length && /[\w_]/.test(text[end])) end++;
    
    const word = text.slice(start, end);
    if (!word || !/[\w_]+/.test(word)) return;

    const regex = new RegExp(`\\b${word}\\b`, 'g');
    let match;
    const occurrences: number[] = [];
    while ((match = regex.exec(text)) !== null) {
      occurrences.push(match.index);
    }

    if (occurrences.length === 0) return;

    // WinCC OA Data Types
    const types = ['int', 'float', 'string', 'bool', 'dyn_string', 'dyn_int', 'dyn_float', 'dyn_bool', 'mapping', 'mixed', 'anytype', 'void', 'time'];
    let targetIndex = -1;

    // 1. Try to find explicit declaration (e.g., "int myVar")
    for (const index of occurrences) {
      const lastNewline = text.lastIndexOf('\n', index);
      const lineStart = lastNewline === -1 ? 0 : lastNewline + 1;
      const linePrefix = text.substring(lineStart, index);
      
      const hasType = types.some(t => new RegExp(`\\b${t}\\b`).test(linePrefix));
      if (hasType) {
        targetIndex = index;
        break;
      }
    }

    // 2. Fallback: Try to find first assignment (e.g., "myVar = ...")
    if (targetIndex === -1) {
      for (const index of occurrences) {
        const afterWord = text.substring(index + word.length);
        if (/^\s*=/.test(afterWord)) {
          targetIndex = index;
          break;
        }
      }
    }

    // 3. Fallback: Just the very first occurrence in the script
    if (targetIndex === -1 && occurrences[0] !== start) {
      targetIndex = occurrences[0];
    }

    if (targetIndex !== -1) {
      textarea.focus();
      textarea.setSelectionRange(targetIndex, targetIndex + word.length);
      
      // Scroll into view (approximate line height 21px for text-sm)
      const lines = text.substring(0, targetIndex).split('\n');
      const lineNumber = lines.length;
      const lineHeight = 21; 
      textarea.scrollTop = Math.max(0, (lineNumber - 1) * lineHeight - (textarea.clientHeight / 2));
    }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isAnalyzing) {
      interval = setInterval(() => {
        setProgress(p => {
          if (p >= 90 && p < 100) return 90;
          if (p >= 100) return 100;
          return p + (Math.random() * 8 + 2);
        });
      }, 500);
    }
    return () => clearInterval(interval);
  }, [isAnalyzing]);

  useEffect(() => {
    if (progress < 15) setProgressText('코드 구조 분석 및 파싱...');
    else if (progress < 30) setProgressText('정적 규칙 엔진 검사 중...');
    else if (progress < 85) setProgressText('Gemini AI 심층 코드 리뷰 및 개선안 생성 중...');
    else if (progress < 100) setProgressText('최종 리포트 생성 중...');
    else setProgressText('분석 완료!');
  }, [progress]);

  const handleJumpToLine = React.useCallback((lineNumber: number) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Ensure we are in edit mode to see the textarea
    setViewMode('edit');

    const text = code;
    const lines = text.split('\n');
    
    if (lineNumber < 1 || lineNumber > lines.length) return;

    // Calculate character position
    let charPos = 0;
    for (let i = 0; i < lineNumber - 1; i++) {
      charPos += lines[i].length + 1; // +1 for newline
    }

    // Focus and select the line
    textarea.focus();
    const lineEnd = charPos + lines[lineNumber - 1].length;
    
    // Use a small timeout to ensure focus and viewMode change are processed
    setTimeout(() => {
      textarea.setSelectionRange(charPos, lineEnd);
      
      // Scroll into view
      const lineHeight = 21; 
      textarea.scrollTop = Math.max(0, (lineNumber - 1) * lineHeight - (textarea.clientHeight / 2));
    }, 10);
  }, [code]);

  const handleQuickCheck = () => {
    if (!code.trim()) return;
    setIsAnalyzing(true);
    setError(null);
    setResult(null);
    setProgress(0);
    setViewMode('edit');

    // Simulate progress for local check
    setProgress(20);
    setProgressText('로컬 규칙 엔진 가동 중...');

    setTimeout(() => {
      const ruleIssues = runRuleEngine(code);
      
      // Calculate a basic score based on severity of rule issues
      const criticalCount = ruleIssues.filter(i => i.severity === 'critical').length;
      const warningCount = ruleIssues.filter(i => i.severity === 'warning').length;
      const baseScore = Math.max(0, 100 - (criticalCount * 15) - (warningCount * 5));

      setResult({
        summary: "로컬 규칙 엔진에 의한 빠른 분석 결과입니다. 더 깊은 분석과 코드 개선안을 원하시면 'AI 정밀 분석'을 실행하세요.",
        score: baseScore,
        issues: ruleIssues
      });
      
      setProgress(100);
      setProgressText('분석 완료!');
      setIsAnalyzing(false);
    }, 800);
  };

  const handleAiReview = React.useCallback(async () => {
    if (!code.trim()) return;
    setIsAnalyzing(true);
    setError(null);
    // Keep existing result if we are upgrading from quick check
    const currentIssues = result?.issues.filter(i => i.source === 'rule') || runRuleEngine(code);
    
    setProgress(0);
    setViewMode('edit');
    try {
      const review = await reviewWinCCOACode(code, currentIssues);
      
      setProgress(100);
      setTimeout(() => {
        setResult(review);
        setIsAnalyzing(false);
      }, 600);
    } catch (err) {
      let errorMessage = '알 수 없는 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
      if (err instanceof Error) {
        errorMessage = err.message;
      }
      setError(errorMessage);
      setIsAnalyzing(false);
    }
  }, [code, result]);

  const handleFormat = async () => {
    if (!code.trim()) return;
    setIsFormatting(true);
    try {
      const formatted = await formatWinCCOACode(code);
      if (formatted) {
        setCode(formatted);
      }
    } catch (err: any) {
      console.error(err);
      alert("코드 포맷팅 중 오류가 발생했습니다.");
    } finally {
      setIsFormatting(false);
    }
  };

  const handleGenerateTest = async () => {
    if (!code.trim()) return;
    setIsGeneratingTest(true);
    try {
      const test = await generateWinCCOAUnitTest(code);
      if (test) {
        setTestCode(test);
      }
    } catch (err: any) {
      console.error(err);
      alert("단위 테스트 생성 중 오류가 발생했습니다.");
    } finally {
      setIsGeneratingTest(false);
    }
  };

  const handleGenerateDocs = async () => {
    if (!code.trim()) return;
    setIsGeneratingDocs(true);
    try {
      const docs = await generateWinCCOADocumentation(code);
      if (docs) {
        setDocumentation(docs);
      }
    } catch (err: any) {
      console.error(err);
      alert("기술 문서 생성 중 오류가 발생했습니다.");
    } finally {
      setIsGeneratingDocs(false);
    }
  };

  const handleVisualize = async () => {
    if (!code.trim()) return;
    setIsVisualizing(true);
    try {
      const mermaid = await generateWinCCOAFlowchart(code);
      if (mermaid) {
        setMermaidCode(mermaid);
      }
    } catch (err: any) {
      console.error(err);
      alert("AI 로직 시각화 중 오류가 발생했습니다.");
    } finally {
      setIsVisualizing(false);
    }
  };

  const handleStaticVisualize = () => {
    if (!code.trim()) return;
    try {
      const mermaid = generateStaticFlowchart(code);
      if (mermaid) {
        setMermaidCode(mermaid);
      }
    } catch (err: any) {
      console.error(err);
      alert("정적 로직 시각화 중 오류가 발생했습니다.");
    }
  };

  const handleCompletion = async () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const pos = textarea.selectionStart;
    const prefix = code.substring(0, pos);
    const suffix = code.substring(textarea.selectionEnd);

    setIsCompleting(true);
    try {
      const completion = await suggestCodeCompletion(prefix, suffix);
      if (completion) {
        const newCode = prefix + completion + suffix;
        setCode(newCode);
        
        // Set cursor position after completion
        setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(pos + completion.length, pos + completion.length);
        }, 0);
      }
    } catch (err: any) {
      console.error(err);
      const msg = err.message ? err.message.replace(/^(RATE_LIMIT|API_ERROR|PARSE_ERROR):\s*/, '') : "코드 자동 완성 중 오류가 발생했습니다.";
      alert(`오류: ${msg}`);
    } finally {
      setIsCompleting(false);
    }
  };

  const handlePerformanceAnalysis = async () => {
    if (!selectedText) return;
    setIsAnalyzingPerformance(true);
    try {
      const result = await analyzePerformanceSnippet(selectedText);
      setPerformanceResult(result);
    } catch (err: any) {
      console.error(err);
      const msg = err.message ? err.message.replace(/^(RATE_LIMIT|API_ERROR|PARSE_ERROR):\s*/, '') : "성능 분석 중 오류가 발생했습니다.";
      alert(`오류: ${msg}`);
    } finally {
      setIsAnalyzingPerformance(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.ctrlKey && e.code === 'Space') {
      e.preventDefault();
      handleCompletion();
    }
  };

  return (
    <div className="min-h-screen lg:h-screen flex flex-col lg:overflow-hidden">
      <Header />

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-0 lg:overflow-hidden">
        {/* Input Section */}
        <div className="technical-border bg-white flex flex-col min-h-[400px] lg:min-h-0 lg:h-full lg:overflow-hidden">
          <div className="p-3 bg-neutral-50 border-b border-black flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileCode size={14} />
              <span className="col-header">소스 제어 스크립트 (.ctl)</span>
              <select 
                className="ml-4 text-[10px] font-bold uppercase border border-neutral-300 bg-white px-2 py-1 outline-none focus:border-black"
                onChange={(e) => {
                  const selected = EXAMPLES.find(ex => ex.name === e.target.value);
                  if (selected) {
                    setCode(selected.code);
                    setViewMode('edit');
                    setResult(null);
                  }
                }}
              >
                {EXAMPLES.map((ex, idx) => (
                  <option key={idx} value={ex.name}>{ex.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-4">
              {selectedText && viewMode === 'edit' && (
                <button
                  onClick={handlePerformanceAnalysis}
                  disabled={isAnalyzingPerformance || isCompleting}
                  className="px-3 py-1 bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold uppercase flex items-center gap-1 hover:bg-amber-200 transition-colors"
                >
                  {isAnalyzingPerformance ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                  선택 영역 성능 분석
                </button>
              )}
              {viewMode === 'edit' && (
                <button
                  onClick={handleFormat}
                  disabled={isFormatting || isCompleting || isAnalyzingPerformance || isGeneratingTest || isGeneratingDocs}
                  className="px-3 py-1 bg-neutral-100 text-neutral-900 border border-neutral-300 text-[10px] font-bold uppercase flex items-center gap-1 hover:bg-neutral-200 transition-colors"
                >
                  {isFormatting ? <Loader2 size={12} className="animate-spin" /> : <AlignLeft size={12} />}
                  코드 포맷팅
                </button>
              )}
              {viewMode === 'edit' && (
                <button
                  onClick={handleGenerateTest}
                  disabled={isFormatting || isCompleting || isAnalyzingPerformance || isGeneratingTest || isGeneratingDocs}
                  className="px-3 py-1 bg-indigo-50 text-indigo-900 border border-indigo-200 text-[10px] font-bold uppercase flex items-center gap-1 hover:bg-indigo-100 transition-colors"
                >
                  {isGeneratingTest ? <Loader2 size={12} className="animate-spin" /> : <TestTube size={12} />}
                  단위 테스트 생성
                </button>
              )}
              {viewMode === 'edit' && (
                <button
                  onClick={handleGenerateDocs}
                  disabled={isFormatting || isCompleting || isAnalyzingPerformance || isGeneratingTest || isGeneratingDocs}
                  className="px-3 py-1 bg-emerald-50 text-emerald-900 border border-emerald-200 text-[10px] font-bold uppercase flex items-center gap-1 hover:bg-emerald-100 transition-colors"
                >
                  {isGeneratingDocs ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
                  기술 문서 생성
                </button>
              )}
              {viewMode === 'edit' && (
                <div className="flex gap-1">
                  <button
                    onClick={handleVisualize}
                    disabled={isFormatting || isCompleting || isAnalyzingPerformance || isGeneratingTest || isGeneratingDocs || isVisualizing}
                    className="px-3 py-1 bg-blue-50 text-blue-900 border border-blue-200 text-[10px] font-bold uppercase flex items-center gap-1 hover:bg-blue-100 transition-colors"
                    title="AI를 사용하여 로직을 분석하고 시각화합니다."
                  >
                    {isVisualizing ? <Loader2 size={12} className="animate-spin" /> : <Share2 size={12} />}
                    AI 시각화
                  </button>
                  <button
                    onClick={handleStaticVisualize}
                    disabled={isFormatting || isCompleting || isAnalyzingPerformance || isGeneratingTest || isGeneratingDocs || isVisualizing}
                    className="px-3 py-1 bg-neutral-100 text-neutral-900 border border-neutral-300 text-[10px] font-bold uppercase flex items-center gap-1 hover:bg-neutral-200 transition-colors"
                    title="AI 없이 정적 분석으로 로직을 시각화합니다. (빠름)"
                  >
                    <Activity size={12} />
                    정적 시각화
                  </button>
                </div>
              )}
              {viewMode === 'edit' && (
                <button
                  onClick={handleCompletion}
                  disabled={isCompleting || isAnalyzingPerformance || isFormatting || isGeneratingTest || isGeneratingDocs || isVisualizing}
                  className="px-3 py-1 bg-indigo-100 text-indigo-900 border border-indigo-300 text-[10px] font-bold uppercase flex items-center gap-1 hover:bg-indigo-200 transition-colors"
                  title="Ctrl + Space"
                >
                  {isCompleting ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  AI 자동 완성
                </button>
              )}
              {result?.refactoredCode && (
                <div className="flex bg-neutral-200 p-0.5 rounded-sm border border-black">
                  <button
                    onClick={() => setViewMode('edit')}
                    className={cn("px-2 py-1 text-[10px] font-bold uppercase flex items-center gap-1", viewMode === 'edit' ? "bg-white shadow-sm" : "text-neutral-500 hover:text-black")}
                  >
                    <Edit3 size={12} /> 편집
                  </button>
                  <button
                    onClick={() => setViewMode('diff')}
                    className={cn("px-2 py-1 text-[10px] font-bold uppercase flex items-center gap-1", viewMode === 'diff' ? "bg-black text-white shadow-sm" : "text-neutral-500 hover:text-black")}
                  >
                    <GitCompare size={12} /> 비교 (Diff)
                  </button>
                </div>
              )}
              {viewMode === 'edit' && (
                <span className="text-[10px] text-neutral-500 font-mono hidden sm:inline-block">
                  💡 Ctrl+Click으로 정의로 이동
                </span>
              )}
              <button 
                onClick={() => { setCode(''); setViewMode('edit'); setResult(null); }}
                className="text-[10px] uppercase font-bold hover:underline"
              >
                초기화
              </button>
            </div>
          </div>
          {viewMode === 'edit' ? (
            <textarea
              ref={textareaRef}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onClick={handleTextareaClick}
              onSelect={handleSelectionChange}
              onKeyUp={handleSelectionChange}
              onKeyDown={handleKeyDown}
              className="flex-1 p-6 font-mono text-sm resize-none focus:outline-none bg-neutral-50/30"
              placeholder="// 여기에 WinCC OA CTRL 코드를 붙여넣으세요..."
              spellCheck={false}
            />
          ) : (
            <DiffViewer originalCode={code} refactoredCode={result?.refactoredCode || ''} />
          )}
          <div className="p-4 border-t border-black bg-white flex justify-between items-center gap-2">
            <button
              onClick={handleQuickCheck}
              disabled={isAnalyzing || !code.trim()}
              className={cn(
                "flex-1 px-4 py-2 bg-white text-black border border-black text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all",
                (isAnalyzing || !code.trim()) ? "opacity-50 cursor-not-allowed" : "hover:bg-neutral-100 active:scale-95"
              )}
            >
              <Cpu size={14} />
              빠른 규칙 검사
            </button>
            <button
              onClick={handleAiReview}
              disabled={isAnalyzing || !code.trim()}
              className={cn(
                "flex-1 px-4 py-2 bg-black text-white text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all",
                (isAnalyzing || !code.trim()) ? "opacity-50 cursor-not-allowed" : "hover:bg-neutral-800 active:scale-95"
              )}
            >
              {isAnalyzing ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  AI 분석 중...
                </>
              ) : (
                <>
                  <Sparkles size={14} />
                  AI 정밀 분석
                </>
              )}
            </button>
          </div>
        </div>

        {/* Results Section */}
        <ReviewResults 
          result={result}
          isAnalyzing={isAnalyzing}
          error={error}
          progress={progress}
          progressText={progressText}
          onRetry={handleAiReview}
          onIssueClick={handleJumpToLine}
        />
      </main>

      {/* Footer */}
      <footer className="technical-border bg-white p-3 flex items-center justify-between text-[9px] uppercase font-bold tracking-widest opacity-60">
        <div className="flex gap-6">
          <span>지멘스 WinCC OA 규정 준수 엔진</span>
          <span>하이브리드 규칙 + AI 분석</span>
        </div>
        <div>
          &copy; 2026 AI Studio Build // 자동화된 리뷰 시스템
        </div>
      </footer>

      {/* Modals with Suspense */}
      <React.Suspense fallback={null}>
        {performanceResult && (
          <PerformanceModal 
            result={performanceResult} 
            onClose={() => setPerformanceResult(null)} 
          />
        )}

        {testCode && (
          <UnitTestModal 
            code={testCode} 
            onClose={() => setTestCode(null)} 
          />
        )}

        {documentation && (
          <DocumentationModal 
            markdown={documentation} 
            onClose={() => setDocumentation(null)} 
          />
        )}

        {mermaidCode && (
          <FlowchartModal 
            mermaidCode={mermaidCode} 
            onClose={() => setMermaidCode(null)} 
          />
        )}
      </React.Suspense>
    </div>
  );
}

