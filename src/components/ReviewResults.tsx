import React, { useState } from 'react';
import { 
  Code2, 
  AlertCircle, 
  CheckCircle2, 
  Info, 
  Loader2, 
  ShieldAlert,
  Zap,
  Cpu,
  Sparkles,
  Bug
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { CodeReviewResult } from '../types';
import { cn } from '../utils/cn';

interface ReviewResultsProps {
  result: CodeReviewResult | null;
  isAnalyzing: boolean;
  error: string | null;
  progress: number;
  progressText: string;
  onRetry: () => void;
  onIssueClick?: (line: number) => void;
}

export const ReviewResults = React.memo(({ 
  result, 
  isAnalyzing, 
  error, 
  progress, 
  progressText, 
  onRetry,
  onIssueClick
}: ReviewResultsProps) => {
  const [activeTab, setActiveTab] = useState<'summary' | 'issues' | 'code'>('summary');

  return (
    <div className="technical-border bg-neutral-100 flex flex-col lg:overflow-hidden lg:h-full">
      {!result && !isAnalyzing && !error && (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center opacity-40">
          <Code2 size={48} strokeWidth={1} />
          <p className="mt-4 uppercase tracking-widest text-xs font-bold">분석 준비 완료</p>
          <p className="mt-2 text-[10px] max-w-xs">WinCC OA Control 스크립트를 입력하여 AI 인사이트가 포함된 자동화된 규칙 기반 리뷰를 시작하세요.</p>
        </div>
      )}

      {isAnalyzing && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 bg-neutral-100">
          <div className="w-full max-w-md p-8 bg-white border border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex items-center gap-3 mb-6 border-b border-black pb-4">
              <Cpu size={24} className={progress < 100 ? "animate-pulse" : ""} />
              <div>
                <h3 className="font-bold uppercase tracking-widest text-sm">시스템 분석 가동 중</h3>
                <p className="text-[10px] font-mono opacity-60">엔진 동기화 및 데이터 처리</p>
              </div>
            </div>
            
            <div className="mb-2 flex justify-between items-end">
              <span className="text-xs font-bold uppercase tracking-widest animate-pulse">{progressText}</span>
              <span className="text-xs font-mono font-bold">{Math.round(progress)}%</span>
            </div>
            
            <div className="h-3 w-full bg-neutral-100 border border-black overflow-hidden relative">
              <div 
                className="h-full bg-black transition-all duration-300 ease-out relative"
                style={{ width: `${progress}%` }}
              >
                <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, #fff 10px, #fff 20px)' }}></div>
              </div>
            </div>
            
            <div className="mt-8 grid grid-cols-4 gap-2">
              {[
                { label: '파싱', threshold: 0 },
                { label: '규칙 검사', threshold: 15 },
                { label: 'AI 분석', threshold: 30 },
                { label: '리포트', threshold: 85 }
              ].map((step, i) => {
                const nextThreshold = i === 3 ? 100 : [15, 30, 85, 100][i + 1];
                const isActive = progress >= step.threshold && progress < nextThreshold;
                const isPast = progress >= nextThreshold;
                
                return (
                  <div key={i} className="flex flex-col items-center gap-2">
                    <div className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors duration-300 border",
                      isActive ? "bg-black text-white border-black" : 
                      isPast ? "bg-black text-white border-black" : "bg-white text-neutral-300 border-neutral-200"
                    )}>
                      {isActive ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : isPast ? (
                        <CheckCircle2 size={12} />
                      ) : (
                        i + 1
                      )}
                    </div>
                    <span className={cn(
                      "text-[9px] uppercase font-bold tracking-wider text-center transition-colors duration-300",
                      (isActive || isPast) ? "text-black" : "text-neutral-400"
                    )}>{step.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="flex-1 p-8 flex flex-col items-center justify-center text-red-600 bg-red-50/30">
          <div className="p-4 bg-red-100 rounded-full mb-4">
            <ShieldAlert size={32} className="text-red-600" />
          </div>
          <h3 className="font-bold uppercase text-lg tracking-tight text-red-800">
            {error.startsWith('RATE_LIMIT:') ? 'API 할당량 초과' : 
             error.startsWith('API_ERROR:') ? 'API 통신 오류' : 
             error.startsWith('PARSE_ERROR:') ? '데이터 파싱 오류' : '분석 시스템 오류'}
          </h3>
          <p className="mt-2 text-sm text-center max-w-md text-red-600/80 leading-relaxed">
            {error.replace(/^(RATE_LIMIT|API_ERROR|PARSE_ERROR):\s*/, '')}
          </p>
          
          <div className="mt-8 flex items-center gap-4">
            <button 
              onClick={onRetry}
              className="px-6 py-2 bg-red-600 text-white text-[10px] font-bold uppercase tracking-widest hover:bg-red-700 transition-colors flex items-center gap-2"
            >
              <Zap size={14} />
              다시 시도
            </button>
            <button 
              onClick={() => window.open('mailto:support@example.com?subject=WinCC OA Auditor Error Report')}
              className="px-6 py-2 border border-red-200 text-red-700 bg-white text-[10px] font-bold uppercase tracking-widest hover:bg-red-50 transition-colors flex items-center gap-2"
            >
              <Bug size={14} />
              문제 신고
            </button>
          </div>
        </div>
      )}

      {result && !isAnalyzing && (
        <div className="flex-1 flex flex-col overflow-hidden p-0">
          {/* Score Header */}
          <div className="p-8 bg-white border-b border-black flex items-center justify-between shrink-0">
            <div>
              <h2 className="text-2xl font-bold tracking-tighter">하이브리드 감사 리포트</h2>
              <p className="text-[10px] uppercase font-mono opacity-60">규칙 + AI 인사이트</p>
            </div>
            <div className="text-right">
              <div className="text-4xl font-bold tracking-tighter">{result.score}%</div>
              <div className="text-[10px] font-bold uppercase opacity-60">준수 점수</div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-black bg-neutral-100 shrink-0 overflow-x-auto">
            <button
              onClick={() => setActiveTab('summary')}
              className={cn("px-6 py-3 text-xs font-bold uppercase tracking-widest border-r border-black transition-colors whitespace-nowrap", activeTab === 'summary' ? "bg-white" : "hover:bg-neutral-200")}
            >
              요약 (Summary)
            </button>
            <button
              onClick={() => setActiveTab('issues')}
              className={cn("px-6 py-3 text-xs font-bold uppercase tracking-widest border-r border-black transition-colors flex items-center gap-2 whitespace-nowrap", activeTab === 'issues' ? "bg-white" : "hover:bg-neutral-200")}
            >
              이슈 (Issues)
              <span className="bg-black text-white px-2 py-0.5 rounded-full text-[10px]">{result.issues.length}</span>
            </button>
            <button
              onClick={() => setActiveTab('code')}
              className={cn("px-6 py-3 text-xs font-bold uppercase tracking-widest border-r border-black transition-colors whitespace-nowrap", activeTab === 'code' ? "bg-white" : "hover:bg-neutral-200")}
            >
              수정된 코드 (Refactored)
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto bg-white">
            {activeTab === 'summary' && (
              <div className="p-8">
                <span className="col-header block mb-4">종합 요약</span>
                <div className="prose prose-sm max-w-none text-sm leading-relaxed">
                  <ReactMarkdown>{result.summary}</ReactMarkdown>
                </div>
              </div>
            )}

            {activeTab === 'issues' && (
              <div className="p-0">
                <div className="px-8 py-4 bg-neutral-200 border-b border-black flex items-center justify-between">
                  <span className="col-header">발견된 문제 ({result.issues.length})</span>
                </div>
                {result.issues.map((issue, idx) => (
                  <div 
                    key={idx} 
                    className={cn(
                      "data-row bg-white p-8 transition-colors group border-b border-black/5 last:border-0",
                      issue.line && "cursor-pointer hover:bg-neutral-50"
                    )}
                    onClick={() => issue.line && onIssueClick?.(issue.line)}
                  >
                    <div className="flex items-start gap-4">
                      <div className={cn(
                        "mt-1",
                        issue.severity === 'critical' ? "text-red-600" : 
                        issue.severity === 'warning' ? "text-amber-600" : "text-blue-600"
                      )}>
                        {issue.severity === 'critical' ? <ShieldAlert size={18} /> : 
                         issue.severity === 'warning' ? <AlertCircle size={18} /> : <Info size={18} />}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 border",
                              issue.severity === 'critical' ? "border-red-600 text-red-600 bg-red-50" : 
                              issue.severity === 'warning' ? "border-amber-600 text-amber-600 bg-amber-50" : 
                              "border-blue-600 text-blue-600 bg-blue-50"
                            )}>
                              {issue.severity}
                            </span>
                            <span className={cn(
                              "text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 flex items-center gap-1",
                              issue.source === 'rule' ? "bg-black text-white" : "bg-indigo-100 text-indigo-800 border border-indigo-200"
                            )}>
                              {issue.source === 'rule' ? <Cpu size={10} /> : <Sparkles size={10} />}
                              {issue.source === 'rule' ? `규칙: ${issue.id}` : 'AI 분석'}
                            </span>
                          </div>
                          {issue.line && (
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono opacity-40">라인: {issue.line}</span>
                              <span className="text-[9px] font-bold uppercase tracking-tighter text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity">
                                클릭하여 이동 &rarr;
                              </span>
                            </div>
                          )}
                        </div>
                        <h3 className="font-bold text-sm mb-2 uppercase tracking-tight">{issue.category}</h3>
                        <p className="text-sm opacity-80 mb-4 leading-relaxed">{issue.description}</p>
                        <div className="bg-neutral-50 p-4 border-l-2 border-black">
                          <div className="flex items-center gap-2 mb-2">
                            <CheckCircle2 size={12} className="text-emerald-600" />
                            <span className="text-[10px] font-bold uppercase tracking-widest">개선 권고사항</span>
                          </div>
                          <div className="text-xs font-mono leading-relaxed prose prose-sm max-w-none prose-pre:bg-neutral-800 prose-pre:text-neutral-100 prose-pre:p-3 prose-pre:rounded-md">
                            <ReactMarkdown>{issue.suggestion}</ReactMarkdown>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'code' && (
              <div className="h-full flex flex-col p-0">
                <pre className="flex-1 p-6 bg-neutral-900 text-neutral-100 font-mono text-sm overflow-auto m-0">
                  <code>{result.refactoredCode || '// 수정된 코드가 없습니다.'}</code>
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
