import React from 'react';
import { Zap } from 'lucide-react';
import { PerformanceResult } from '../types';

interface PerformanceModalProps {
  result: PerformanceResult;
  onClose: () => void;
}

export function PerformanceModal({ result, onClose }: PerformanceModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="p-4 border-b border-black flex justify-between items-center bg-amber-50">
          <div className="flex items-center gap-2 text-amber-900">
            <Zap size={18} />
            <h2 className="font-bold uppercase tracking-widest text-sm">성능 최적화 분석 결과</h2>
          </div>
          <button onClick={onClose} className="text-xl font-bold hover:opacity-50">&times;</button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">
          <p className="text-sm mb-6 leading-relaxed">{result.summary}</p>
          
          <h3 className="font-bold text-xs uppercase tracking-widest mb-3 text-neutral-500">발견된 병목 현상</h3>
          <div className="space-y-4 mb-6">
            {result.bottlenecks.map((b, i) => (
              <div key={i} className="p-4 bg-red-50 border border-red-100 flex flex-col gap-2">
                <div className="flex items-start justify-between">
                  <p className="text-sm font-bold text-red-900">{b.description}</p>
                  {b.line && (
                    <span className="text-[10px] font-mono bg-red-100 text-red-800 px-2 py-0.5 rounded border border-red-200 shrink-0">
                      Line: {b.line}
                    </span>
                  )}
                </div>
                {b.codeSnippet && (
                  <pre className="bg-red-900/10 p-2 rounded text-xs font-mono text-red-900 overflow-x-auto border border-red-900/20">
                    <code>{b.codeSnippet}</code>
                  </pre>
                )}
                <div className="mt-2 text-xs text-red-800 bg-white/50 p-3 border-l-2 border-red-400">
                  <span className="font-bold block mb-1">최적화 제안:</span>
                  {b.suggestion}
                </div>
              </div>
            ))}
          </div>

          <h3 className="font-bold text-xs uppercase tracking-widest mb-3 text-neutral-500">최적화된 코드 제안</h3>
          <pre className="p-4 bg-neutral-900 text-neutral-100 text-sm font-mono overflow-x-auto">
            <code>{result.optimizedCode}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}
