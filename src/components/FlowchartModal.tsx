import React, { useEffect, useRef } from 'react';
import { Share2, Download, ZoomIn, ZoomOut } from 'lucide-react';
import mermaid from 'mermaid';

interface FlowchartModalProps {
  mermaidCode: string;
  onClose: () => void;
}

mermaid.initialize({
  startOnLoad: true,
  theme: 'neutral',
  securityLevel: 'loose',
  flowchart: {
    useMaxWidth: false,
    htmlLabels: true,
    curve: 'basis'
  }
});

export function FlowchartModal({ mermaidCode, onClose }: FlowchartModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = React.useState(1);

  useEffect(() => {
    if (containerRef.current && mermaidCode) {
      containerRef.current.innerHTML = `<div class="mermaid">${mermaidCode}</div>`;
      mermaid.contentLoaded();
    }
  }, [mermaidCode]);

  const handleDownload = () => {
    const svg = containerRef.current?.querySelector('svg');
    if (svg) {
      const svgData = new XMLSerializer().serializeToString(svg);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.onload = () => {
        canvas.width = img.width * 2;
        canvas.height = img.height * 2;
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        const pngUrl = canvas.toDataURL('image/png');
        const downloadLink = document.createElement('a');
        downloadLink.href = pngUrl;
        downloadLink.download = 'wincc_oa_flowchart.png';
        downloadLink.click();
      };
      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] max-w-6xl w-full h-[90vh] flex flex-col">
        <div className="p-4 border-b border-black flex justify-between items-center bg-blue-50">
          <div className="flex items-center gap-2 text-blue-900">
            <Share2 size={18} />
            <h2 className="font-bold uppercase tracking-widest text-sm">WinCC OA 로직 시각화 (Flowchart)</h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center bg-white border border-black rounded overflow-hidden">
              <button onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} className="p-1 hover:bg-neutral-100 border-r border-black"><ZoomOut size={14} /></button>
              <span className="px-2 text-[10px] font-bold min-w-[40px] text-center">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom(z => Math.min(2, z + 0.1))} className="p-1 hover:bg-neutral-100 border-l border-black"><ZoomIn size={14} /></button>
            </div>
            <button 
              onClick={handleDownload}
              className="flex items-center gap-1 text-[10px] font-bold uppercase bg-white border border-black px-2 py-1 hover:bg-neutral-50 transition-colors"
            >
              <Download size={12} />
              이미지 저장
            </button>
            <button onClick={onClose} className="text-xl font-bold hover:opacity-50">&times;</button>
          </div>
        </div>
        <div className="flex-1 overflow-auto bg-neutral-50 p-8 flex items-center justify-center">
          <div 
            ref={containerRef} 
            style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}
            className="transition-transform duration-200"
          />
        </div>
        <div className="p-4 border-t border-black bg-white text-[10px] font-bold uppercase text-neutral-500 flex justify-between">
          <span>AI Generated Logic Flow Diagram</span>
          <span>Powered by Mermaid.js</span>
        </div>
      </div>
    </div>
  );
}
