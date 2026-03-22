import React from 'react';
import { FileText, Download, Check } from 'lucide-react';
import Markdown from 'react-markdown';

interface DocumentationModalProps {
  markdown: string;
  onClose: () => void;
}

export function DocumentationModal({ markdown, onClose }: DocumentationModalProps) {
  const [downloaded, setDownloaded] = React.useState(false);

  const handleDownload = () => {
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'wincc_oa_documentation.md';
    a.click();
    URL.revokeObjectURL(url);
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] max-w-4xl w-full max-h-[90vh] flex flex-col">
        <div className="p-4 border-b border-black flex justify-between items-center bg-emerald-50">
          <div className="flex items-center gap-2 text-emerald-900">
            <FileText size={18} />
            <h2 className="font-bold uppercase tracking-widest text-sm">WinCC OA 기술 문서 생성 결과</h2>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={handleDownload}
              className="flex items-center gap-1 text-[10px] font-bold uppercase bg-white border border-black px-2 py-1 hover:bg-neutral-50 transition-colors"
            >
              {downloaded ? <Check size={12} className="text-green-600" /> : <Download size={12} />}
              {downloaded ? '다운로드됨' : '마크다운 다운로드'}
            </button>
            <button onClick={onClose} className="text-xl font-bold hover:opacity-50">&times;</button>
          </div>
        </div>
        <div className="p-10 overflow-y-auto flex-1 bg-white markdown-body">
          <Markdown>{markdown}</Markdown>
        </div>
        <div className="p-4 border-t border-black bg-neutral-50 text-[10px] font-bold uppercase text-neutral-500 flex justify-between">
          <span>AI Generated Technical Documentation</span>
          <span>Markdown Format</span>
        </div>
      </div>
    </div>
  );
}
