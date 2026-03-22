/**
 * Static Flowchart Parser for WinCC OA CTRL Script
 * Generates Mermaid.js syntax without AI calls.
 */

interface ParserNode {
  id: string;
  label: string;
  type: 'start' | 'end' | 'action' | 'condition' | 'loop' | 'join';
  next?: string;
  nextTrue?: string;
  nextFalse?: string;
}

export function generateStaticFlowchart(code: string): string {
  const lines = code.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  let nodeId = 0;
  const getNextId = () => `node_${nodeId++}`;

  const mermaidLines: string[] = ['graph TD'];
  const nodeMap: Map<string, ParserNode> = new Map();

  // Helper to add nodes to mermaid
  const renderNode = (node: ParserNode) => {
    const label = node.label.replace(/"/g, "'").replace(/[{}()]/g, ' ');
    switch (node.type) {
      case 'start': return `${node.id}(["${label}"])`;
      case 'end': return `${node.id}(["${label}"])`;
      case 'condition': return `${node.id}{"${label}"}`;
      case 'loop': return `${node.id}{{"${label}"}}`;
      default: return `${node.id}["${label}"]`;
    }
  };

  // Simplified parsing logic using a stack for blocks
  let currentId = getNextId();
  mermaidLines.push(`${currentId}(["Start"])`);

  const stack: { id: string; type: string; exitId?: string; trueBranchId?: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Handle Function Declaration
    if (line.match(/^(void|int|float|string|bool|main)\s+\w+\s*\(/)) {
      const funcName = line.split('(')[0].trim();
      const nextId = getNextId();
      mermaidLines.push(`${currentId} --> ${nextId}[["${funcName}"]]`);
      currentId = nextId;
      continue;
    }

    // Handle IF
    const ifMatch = line.match(/^if\s*\((.*)\)/);
    if (ifMatch) {
      const condition = ifMatch[1];
      const condId = getNextId();
      const trueId = getNextId();
      const exitId = getNextId(); // Join point after if/else

      mermaidLines.push(`${currentId} --> ${condId}{"${condition}"}`);
      mermaidLines.push(`${condId} -- "True" --> ${trueId}`);
      
      stack.push({ id: condId, type: 'if', exitId });
      currentId = trueId;
      continue;
    }

    // Handle ELSE
    if (line.startsWith('else')) {
      const top = stack[stack.length - 1];
      if (top && top.type === 'if') {
        const falseId = getNextId();
        // Connect previous branch to exit
        mermaidLines.push(`${currentId} --> ${top.exitId}`);
        // Start false branch
        mermaidLines.push(`${top.id} -- "False" --> ${falseId}`);
        currentId = falseId;
      }
      continue;
    }

    // Handle WHILE / FOR
    const loopMatch = line.match(/^(while|for)\s*\((.*)\)/);
    if (loopMatch) {
      const loopType = loopMatch[1];
      const condition = loopMatch[2];
      const loopId = getNextId();
      const bodyId = getNextId();
      const exitId = getNextId();

      mermaidLines.push(`${currentId} --> ${loopId}{{"${loopType}: ${condition}"}}`);
      mermaidLines.push(`${loopId} -- "Loop" --> ${bodyId}`);
      
      stack.push({ id: loopId, type: 'loop', exitId });
      currentId = bodyId;
      continue;
    }

    // Handle Block End
    if (line.includes('}')) {
      const top = stack.pop();
      if (top) {
        if (top.type === 'if') {
          mermaidLines.push(`${currentId} --> ${top.exitId}`);
          currentId = top.exitId!;
        } else if (top.type === 'loop') {
          // Back edge
          mermaidLines.push(`${currentId} --> ${top.id}`);
          // Exit edge
          mermaidLines.push(`${top.id} -- "Exit" --> ${top.exitId}`);
          currentId = top.exitId!;
        }
      }
      continue;
    }

    // Handle simple actions (assignments, function calls)
    if (line.includes('=') || line.includes('(')) {
      const actionId = getNextId();
      const cleanLine = line.replace(/;/g, '').trim();
      if (cleanLine.length > 0) {
        mermaidLines.push(`${currentId} --> ${actionId}["${cleanLine}"]`);
        currentId = actionId;
      }
    }
  }

  const endId = getNextId();
  mermaidLines.push(`${currentId} --> ${endId}(["End"])`);

  return mermaidLines.join('\n');
}
