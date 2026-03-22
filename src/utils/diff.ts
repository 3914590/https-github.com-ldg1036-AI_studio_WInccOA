import { diffLines, diffWordsWithSpace } from 'diff';

export type DiffPart = {
  text: string;
  type: 'unchanged' | 'added' | 'removed';
};

export type DiffLine = {
  left: { text: string; type: 'unchanged' | 'removed' | 'empty'; parts?: DiffPart[]; lineNumber?: number };
  right: { text: string; type: 'unchanged' | 'added' | 'empty'; parts?: DiffPart[]; lineNumber?: number };
};

export type UnifiedDiffLine = {
  type: 'unchanged' | 'added' | 'removed';
  text: string;
  leftLineNum?: number;
  rightLineNum?: number;
  parts?: DiffPart[];
};

export function getAlignedDiff(original: string, refactored: string): DiffLine[] {
  const chunks = diffLines(original, refactored);
  const lines: DiffLine[] = [];
  
  let leftLineNum = 1;
  let rightLineNum = 1;
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkLines = chunk.value.replace(/\n$/, '').split('\n');
    
    if (chunk.removed) {
      if (i + 1 < chunks.length && chunks[i + 1].added) {
        const addedChunk = chunks[i + 1];
        const addedLines = addedChunk.value.replace(/\n$/, '').split('\n');
        const maxLen = Math.max(chunkLines.length, addedLines.length);
        
        for (let j = 0; j < maxLen; j++) {
          const hasLeft = j < chunkLines.length;
          const hasRight = j < addedLines.length;
          
          const leftText = hasLeft ? chunkLines[j] : '';
          const rightText = hasRight ? addedLines[j] : '';
          
          let leftParts: DiffPart[] | undefined;
          let rightParts: DiffPart[] | undefined;
          
          if (hasLeft && hasRight) {
            const wordDiff = diffWordsWithSpace(leftText, rightText);
            leftParts = wordDiff.filter(p => !p.added).map(p => ({
              text: p.value,
              type: p.removed ? 'removed' : 'unchanged'
            }));
            rightParts = wordDiff.filter(p => !p.removed).map(p => ({
              text: p.value,
              type: p.added ? 'added' : 'unchanged'
            }));
          }
          
          lines.push({
            left: { 
              text: leftText, 
              type: hasLeft ? 'removed' : 'empty',
              parts: leftParts,
              lineNumber: hasLeft ? leftLineNum++ : undefined
            },
            right: { 
              text: rightText, 
              type: hasRight ? 'added' : 'empty',
              parts: rightParts,
              lineNumber: hasRight ? rightLineNum++ : undefined
            }
          });
        }
        i++; // skip next chunk
      } else {
        for (const line of chunkLines) {
          lines.push({
            left: { text: line, type: 'removed', lineNumber: leftLineNum++ },
            right: { text: '', type: 'empty' }
          });
        }
      }
    } else if (chunk.added) {
      for (const line of chunkLines) {
        lines.push({
          left: { text: '', type: 'empty' },
          right: { text: line, type: 'added', lineNumber: rightLineNum++ }
        });
      }
    } else {
      for (const line of chunkLines) {
        lines.push({
          left: { text: line, type: 'unchanged', lineNumber: leftLineNum++ },
          right: { text: line, type: 'unchanged', lineNumber: rightLineNum++ }
        });
      }
    }
  }
  return lines;
}

export function getUnifiedDiff(original: string, refactored: string): UnifiedDiffLine[] {
  const chunks = diffLines(original, refactored);
  const lines: UnifiedDiffLine[] = [];
  
  let leftLineNum = 1;
  let rightLineNum = 1;
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkLines = chunk.value.replace(/\n$/, '').split('\n');
    
    if (chunk.removed) {
      if (i + 1 < chunks.length && chunks[i + 1].added) {
        const addedChunk = chunks[i + 1];
        const addedLines = addedChunk.value.replace(/\n$/, '').split('\n');
        
        // Show removed lines first
        for (let j = 0; j < chunkLines.length; j++) {
          const leftText = chunkLines[j];
          let parts: DiffPart[] | undefined;
          
          // If there's a corresponding added line, do word diff
          if (j < addedLines.length) {
            const rightText = addedLines[j];
            const wordDiff = diffWordsWithSpace(leftText, rightText);
            parts = wordDiff.filter(p => !p.added).map(p => ({
              text: p.value,
              type: p.removed ? 'removed' : 'unchanged'
            }));
          }
          
          lines.push({
            type: 'removed',
            text: leftText,
            leftLineNum: leftLineNum++,
            parts
          });
        }
        
        // Then show added lines
        for (let j = 0; j < addedLines.length; j++) {
          const rightText = addedLines[j];
          let parts: DiffPart[] | undefined;
          
          if (j < chunkLines.length) {
            const leftText = chunkLines[j];
            const wordDiff = diffWordsWithSpace(leftText, rightText);
            parts = wordDiff.filter(p => !p.removed).map(p => ({
              text: p.value,
              type: p.added ? 'added' : 'unchanged'
            }));
          }
          
          lines.push({
            type: 'added',
            text: rightText,
            rightLineNum: rightLineNum++,
            parts
          });
        }
        i++; // skip next chunk
      } else {
        for (const line of chunkLines) {
          lines.push({
            type: 'removed',
            text: line,
            leftLineNum: leftLineNum++
          });
        }
      }
    } else if (chunk.added) {
      for (const line of chunkLines) {
        lines.push({
          type: 'added',
          text: line,
          rightLineNum: rightLineNum++
        });
      }
    } else {
      for (const line of chunkLines) {
        lines.push({
          type: 'unchanged',
          text: line,
          leftLineNum: leftLineNum++,
          rightLineNum: rightLineNum++
        });
      }
    }
  }
  return lines;
}
