import React, { useState, useMemo } from 'react';
import { cn } from '../utils/cn';
import { getAlignedDiff, getUnifiedDiff, DiffPart, DiffLine, UnifiedDiffLine } from '../utils/diff';
import { Columns, List } from 'lucide-react';

interface DiffViewerProps {
  originalCode: string;
  refactoredCode: string;
}

const RenderParts = React.memo(({ parts, fallbackText, isLeft }: { parts: DiffPart[] | undefined, fallbackText: string, isLeft: boolean }) => {
  if (!parts) return <>{fallbackText || ' '}</>;
  
  return (
    <>
      {parts.map((part, idx) => {
        if (part.type === 'unchanged') {
          return <span key={idx}>{part.text}</span>;
        }
        
        if (isLeft && part.type === 'removed') {
          return (
            <span key={idx} className="bg-red-400/50 text-red-950 font-bold px-0.5 rounded-sm border-b border-red-600/30">
              {part.text}
            </span>
          );
        }
        
        if (!isLeft && part.type === 'added') {
          return (
            <span key={idx} className="bg-emerald-400/50 text-emerald-950 font-bold px-0.5 rounded-sm border-b border-emerald-600/30">
              {part.text}
            </span>
          );
        }
        
        return <span key={idx}>{part.text}</span>;
      })}
    </>
  );
});

const SplitLine = React.memo(({ line }: { line: DiffLine }) => {
  return (
    <div className="flex group border-b border-neutral-100/50 last:border-0">
      {/* Left Side */}
      <div className={cn(
        "flex-1 flex items-start border-r border-neutral-200 break-words w-0",
        line.left.type === 'removed' ? 'bg-red-50/70' :
        line.left.type === 'empty' ? 'bg-neutral-100/20' :
        'text-neutral-600 hover:bg-neutral-100/30'
      )}>
        <div className="w-8 shrink-0 py-0.5 text-right pr-2 text-[9px] font-mono text-neutral-400 select-none border-r border-neutral-100">
          {line.left.lineNumber}
        </div>
        <div className="flex-1 px-3 py-0.5 whitespace-pre-wrap relative">
          {line.left.type === 'removed' && (
            <span className="absolute left-1 top-0.5 text-red-400 text-[10px] font-bold select-none">-</span>
          )}
          <div className={cn(
            line.left.type === 'removed' ? 'text-red-900' : 'text-neutral-700'
          )}>
            <RenderParts parts={line.left.parts} fallbackText={line.left.text} isLeft={true} />
          </div>
        </div>
      </div>

      {/* Right Side */}
      <div className={cn(
        "flex-1 flex items-start break-words w-0",
        line.right.type === 'added' ? 'bg-emerald-50/70' :
        line.right.type === 'empty' ? 'bg-neutral-100/20' :
        'text-neutral-600 hover:bg-neutral-100/30'
      )}>
        <div className="w-8 shrink-0 py-0.5 text-right pr-2 text-[9px] font-mono text-neutral-400 select-none border-r border-neutral-100">
          {line.right.lineNumber}
        </div>
        <div className="flex-1 px-3 py-0.5 whitespace-pre-wrap relative">
          {line.right.type === 'added' && (
            <span className="absolute left-1 top-0.5 text-emerald-500 text-[10px] font-bold select-none">+</span>
          )}
          <div className={cn(
            line.right.type === 'added' ? 'text-emerald-900' : 'text-neutral-700'
          )}>
            <RenderParts parts={line.right.parts} fallbackText={line.right.text} isLeft={false} />
          </div>
        </div>
      </div>
    </div>
  );
});

const UnifiedLine = React.memo(({ line }: { line: UnifiedDiffLine }) => {
  return (
    <div 
      className={cn(
        "flex items-start group border-b border-neutral-100/50 last:border-0",
        line.type === 'removed' ? 'bg-red-50/70' :
        line.type === 'added' ? 'bg-emerald-50/70' :
        'text-neutral-600 hover:bg-neutral-100/30'
      )}
    >
      <div className="flex shrink-0 border-r border-neutral-100">
        <div className="w-8 py-0.5 text-right pr-2 text-[9px] font-mono text-neutral-400 select-none border-r border-neutral-50">
          {line.leftLineNum}
        </div>
        <div className="w-8 py-0.5 text-right pr-2 text-[9px] font-mono text-neutral-400 select-none">
          {line.rightLineNum}
        </div>
      </div>
      <div className="flex-1 px-3 py-0.5 whitespace-pre-wrap relative">
        <span className={cn(
          "absolute left-1 top-0.5 text-[10px] font-bold select-none",
          line.type === 'removed' ? 'text-red-400' : 
          line.type === 'added' ? 'text-emerald-500' : 'text-neutral-300'
        )}>
          {line.type === 'removed' ? '-' : line.type === 'added' ? '+' : ' '}
        </span>
        <div className={cn(
          line.type === 'removed' ? 'text-red-900' : 
          line.type === 'added' ? 'text-emerald-900' : 'text-neutral-700'
        )}>
          <RenderParts parts={line.parts} fallbackText={line.text} isLeft={line.type === 'removed'} />
        </div>
      </div>
    </div>
  );
});

export function DiffViewer({ originalCode, refactoredCode }: DiffViewerProps) {
  const [viewMode, setViewMode] = useState<'split' | 'unified'>('split');
  
  const alignedDiff = useMemo(() => getAlignedDiff(originalCode, refactoredCode), [originalCode, refactoredCode]);
  const unifiedDiff = useMemo(() => getUnifiedDiff(originalCode, refactoredCode), [originalCode, refactoredCode]);

  return (
    <div className="flex-1 flex flex-col bg-neutral-50/30 font-mono text-xs overflow-hidden">
      {/* Diff Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-neutral-100 border-b border-neutral-200 shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">비교 모드</span>
          <div className="flex bg-neutral-200 p-0.5 rounded-sm border border-neutral-300">
            <button
              onClick={() => setViewMode('split')}
              className={cn(
                "px-2 py-1 text-[9px] font-bold uppercase flex items-center gap-1 transition-all",
                viewMode === 'split' ? "bg-white text-black shadow-sm" : "text-neutral-500 hover:text-black"
              )}
            >
              <Columns size={10} /> 분할 (Split)
            </button>
            <button
              onClick={() => setViewMode('unified')}
              className={cn(
                "px-2 py-1 text-[9px] font-bold uppercase flex items-center gap-1 transition-all",
                viewMode === 'unified' ? "bg-white text-black shadow-sm" : "text-neutral-500 hover:text-black"
              )}
            >
              <List size={10} /> 통합 (Unified)
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[9px] font-bold uppercase tracking-tighter">
          <div className="flex items-center gap-1 text-red-600">
            <div className="w-2 h-2 bg-red-100 border border-red-300"></div> 삭제됨
          </div>
          <div className="flex items-center gap-1 text-emerald-600">
            <div className="w-2 h-2 bg-emerald-100 border border-emerald-300"></div> 추가됨
          </div>
        </div>
      </div>

      {viewMode === 'split' ? (
        <>
          <div className="flex border-b border-neutral-200 bg-neutral-100 text-neutral-600 font-bold uppercase text-[10px] tracking-wider shrink-0">
            <div className="flex-1 p-2 border-r border-neutral-200 flex items-center gap-2">
              <span className="w-8 text-center opacity-40">#</span>
              원본 코드 (Original)
            </div>
            <div className="flex-1 p-2 flex items-center gap-2">
              <span className="w-8 text-center opacity-40">#</span>
              수정된 코드 (Refactored)
            </div>
          </div>
          <div className="flex-1 overflow-y-auto leading-relaxed">
            {alignedDiff.map((line, i) => (
              <SplitLine key={i} line={line} />
            ))}
          </div>
        </>
      ) : (
        <div className="flex-1 overflow-y-auto leading-relaxed">
          {unifiedDiff.map((line, i) => (
            <UnifiedLine key={i} line={line} />
          ))}
        </div>
      )}
    </div>
  );
}
