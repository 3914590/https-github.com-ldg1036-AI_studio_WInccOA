import React from 'react';
import { TestTube, Copy, Check } from 'lucide-react';

interface UnitTestModalProps {
  code: string;
  onClose: () => void;
}

export function UnitTestModal({ code, onClose }: UnitTestModalProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] max-w-3xl w-full max-h-[90vh] flex flex-col">
        <div className="p-4 border-b border-black flex justify-between items-center bg-indigo-50">
          <div className="flex items-center gap-2 text-indigo-900">
            <TestTube size={18} />
            <h2 className="font-bold uppercase tracking-widest text-sm">WinCC OA 단위 테스트 생성 결과</h2>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={handleCopy}
              className="flex items-center gap-1 text-[10px] font-bold uppercase bg-white border border-black px-2 py-1 hover:bg-neutral-50 transition-colors"
            >
              {copied ? <Check size={12} className="text-green-600" /> : <Copy size={12} />}
              {copied ? '복사됨' : '코드 복사'}
            </button>
            <button onClick={onClose} className="text-xl font-bold hover:opacity-50">&times;</button>
          </div>
        </div>
        <div className="p-0 overflow-y-auto flex-1 bg-neutral-900">
          <pre className="p-6 text-neutral-100 text-sm font-mono leading-relaxed">
            <code>{code}</code>
          </pre>
        </div>
        <div className="p-4 border-t border-black bg-neutral-50 text-[10px] font-bold uppercase text-neutral-500 flex justify-between">
          <span>WinCC OA Unittest Framework 형식</span>
          <span>AI Generated Test Suite</span>
        </div>
      </div>
    </div>
  );
}
