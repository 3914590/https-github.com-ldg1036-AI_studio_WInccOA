import React from 'react';
import { Terminal } from 'lucide-react';

export const Header = React.memo(() => {
  return (
    <header className="technical-border bg-white p-4 flex items-center justify-between sticky top-0 z-10">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-black text-white rounded-sm">
          <Terminal size={20} />
        </div>
        <div>
          <h1 className="text-sm font-bold uppercase tracking-widest">WinCC OA 코드 감사 도구</h1>
          <p className="text-[10px] opacity-60 uppercase font-mono">v2.0.0 // 하이브리드 엔진 (규칙 + AI)</p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right hidden sm:block">
          <p className="text-[10px] font-mono opacity-60">시스템 상태</p>
          <p className="text-[10px] font-bold text-emerald-600">정상 작동 중</p>
        </div>
      </div>
    </header>
  );
});
