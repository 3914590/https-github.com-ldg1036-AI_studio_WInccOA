import rulesData from '../rules.json';
import { ReviewIssue } from '../types';

interface EngineContext {
  code: string;
  lines: string[];
}

interface MatchResult {
  line: number;
  text: string;
}

function evaluateCondition(condition: any, context: EngineContext): MatchResult[] {
  const handler = CONDITION_HANDLERS[condition.kind];
  if (handler) {
    return handler(condition, context);
  }
  return [];
}

// --- Condition Handlers ---

function evalRegex(condition: any, context: EngineContext): MatchResult[] {
  const { code } = context;
  const results: MatchResult[] = [];
  try {
    // Map custom flag names (e.g., from JSON) to standard RegExp flag characters
    const flagMap: Record<string, string> = {
      'DOTALL': 's',
      'MULTILINE': 'm',
      'IGNORECASE': 'i',
      'GLOBAL': 'g'
    };
    const mappedFlags = new Set<string>();
    (condition.flags || []).forEach((f: string) => {
      if (flagMap[f]) mappedFlags.add(flagMap[f]);
      else if (f.length === 1) mappedFlags.add(f);
    });
    mappedFlags.add('g');
    const flags = Array.from(mappedFlags).join('');
    
    const regex = new RegExp(condition.pattern, flags);
    let match;
    while ((match = regex.exec(code)) !== null) {
      results.push({
        line: getLineNumber(code, match.index),
        text: match[0]
      });
      if (!regex.global) break;
    }
  } catch (e) {
    console.error("Invalid regex in condition:", condition.pattern, e);
  }
  return results;
}

function evalAnd(condition: any, context: EngineContext): MatchResult[] {
  if (!condition.conditions || condition.conditions.length === 0) return [];
  
  let currentMatches = evaluateCondition(condition.conditions[0], context);
  
  for (let i = 1; i < condition.conditions.length; i++) {
    const nextMatches = evaluateCondition(condition.conditions[i], context);
    if (nextMatches.length === 0) return [];
  }
  
  return currentMatches;
}

function evalOr(condition: any, context: EngineContext): MatchResult[] {
  const allMatches: MatchResult[] = [];
  for (const cond of (condition.conditions || [])) {
    allMatches.push(...evaluateCondition(cond, context));
  }
  const uniqueLines = new Set();
  return allMatches.filter(m => {
    if (uniqueLines.has(m.line)) return false;
    uniqueLines.add(m.line);
    return true;
  });
}

function evalNot(condition: any, context: EngineContext): MatchResult[] {
  const matches = evaluateCondition(condition.condition, context);
  return matches.length === 0 ? [{ line: 1, text: 'NOT condition met' }] : [];
}

function evalScope(condition: any, context: EngineContext): MatchResult[] {
  const outerMatches = evaluateCondition(condition.outer, context);
  const results: MatchResult[] = [];
  
  outerMatches.forEach(outer => {
    const subContext: EngineContext = { 
      code: outer.text, 
      lines: outer.text.split('\n') 
    };
    const innerMatches = evaluateCondition(condition.inner, subContext);
    if (innerMatches.length > 0) {
      innerMatches.forEach(inner => {
        results.push({
          line: outer.line + inner.line - 1,
          text: inner.text
        });
      });
    }
  });
  return results;
}

function evalIf(condition: any, context: EngineContext): MatchResult[] {
  const testMatches = evaluateCondition(condition.test, context);
  if (testMatches.length > 0) {
    return evaluateCondition(condition.then, context);
  } else if (condition.else) {
    return evaluateCondition(condition.else, context);
  }
  return [];
}

function evalExists(condition: any, context: EngineContext): MatchResult[] {
  const matches = evaluateCondition(condition.condition, context);
  return matches.length > 0 ? [{ line: 1, text: 'Exists' }] : [];
}

function evalNearby(condition: any, context: EngineContext): MatchResult[] {
  const { lines } = context;
  const anchorMatches = evaluateCondition(condition.anchor, context);
  const results: MatchResult[] = [];
  const distance = condition.distance || 5;

  anchorMatches.forEach(anchor => {
    const startLine = Math.max(1, anchor.line - distance);
    const endLine = Math.min(lines.length, anchor.line + distance);
    const nearbyLines = lines.slice(startLine - 1, endLine);
    const nearbyCode = nearbyLines.join('\n');
    
    const subContext: EngineContext = { code: nearbyCode, lines: nearbyLines };
    const targetMatches = evaluateCondition(condition.target, subContext);
    
    if (targetMatches.length > 0) {
      results.push(anchor);
    }
  });
  return results;
}

function evalContains(condition: any, context: EngineContext): MatchResult[] {
  const { code } = context;
  const results: MatchResult[] = [];
  let pos = code.indexOf(condition.text);
  while (pos !== -1) {
    results.push({
      line: getLineNumber(code, pos),
      text: condition.text
    });
    pos = code.indexOf(condition.text, pos + 1);
  }
  return results;
}

function evalLineRepeat(condition: any, context: EngineContext): MatchResult[] {
  const { lines } = context;
  const threshold = condition.threshold || 3;
  const minLength = condition.min_line_length || 8;
  const lineCounts: { [key: string]: number[] } = {};
  
  lines.forEach((line, idx) => {
    let trimmed = line.trim();
    if (condition.ignore_comments) {
      trimmed = trimmed.replace(/\/\/.*$/, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
    }
    if (condition.ignore_braces_only && (trimmed === '{' || trimmed === '}')) return;
    if (trimmed.length < minLength) return;
    
    if (!lineCounts[trimmed]) lineCounts[trimmed] = [];
    lineCounts[trimmed].push(idx + 1);
  });

  const results: MatchResult[] = [];
  Object.entries(lineCounts).forEach(([line, lineNums]) => {
    if (lineNums.length >= threshold) {
      lineNums.forEach(ln => results.push({ line: ln, text: line }));
    }
  });
  return results;
}

function evalFunction(condition: any, context: EngineContext): MatchResult[] {
  const handler = FUNCTION_HANDLERS[condition.name];
  if (handler) {
    return handler(condition, context);
  }
  return [];
}

// --- Function Handlers ---

function checkComplexity(condition: any, context: EngineContext): MatchResult[] {
  const maxLines = condition.args?.maxLines || 500;
  return context.lines.length > maxLines ? [{ line: 1, text: `Lines: ${context.lines.length}` }] : [];
}

function checkUnusedVariables(condition: any, context: EngineContext): MatchResult[] {
  const { code } = context;
  const issues: MatchResult[] = [];
  const varRegex = /\b(?:int|float|string|bool|dyn_\w+)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*[;=]/gm;
  let match;
  while ((match = varRegex.exec(code)) !== null) {
    const varName = match[1];
    const usageRegex = new RegExp(`\\b${varName}\\b`, 'g');
    const usages = code.match(usageRegex);
    if (usages && usages.length <= 1) {
      issues.push({ line: getLineNumber(code, match.index), text: varName });
    }
  }
  return issues;
}

function checkSqlInjection(condition: any, context: EngineContext): MatchResult[] {
  const { code } = context;
  const sprintfRegex = /sprintf\s*\([^,]+,\s*[^)]*%s[^)]*\)/g;
  const sqlKeywords = /\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE)\b/i;
  const results: MatchResult[] = [];
  let match;
  while ((match = sprintfRegex.exec(code)) !== null) {
    if (sqlKeywords.test(match[0])) {
      results.push({ line: getLineNumber(code, match.index), text: match[0] });
    }
  }
  return results;
}

const CONDITION_HANDLERS: Record<string, (condition: any, context: EngineContext) => MatchResult[]> = {
  'regex': evalRegex,
  'and': evalAnd,
  'or': evalOr,
  'not': evalNot,
  'scope': evalScope,
  'if': evalIf,
  'exists': evalExists,
  'nearby': evalNearby,
  'contains': evalContains,
  'line_repeat': evalLineRepeat,
  'function': evalFunction,
};

const FUNCTION_HANDLERS: Record<string, (condition: any, context: EngineContext) => MatchResult[]> = {
  'checkComplexity': checkComplexity,
  'checkUnusedVariables': checkUnusedVariables,
  'checkSqlInjection': checkSqlInjection,
};

// --- Legacy Rule Handlers ---

function handleSqlInjection(rule: any, context: EngineContext, issues: ReviewIssue[], ruleId: string, severity: any) {
  if (
    rule.detector.sprintf_pattern && rule.detector.sql_keywords_pattern &&
    new RegExp(rule.detector.sprintf_pattern, 'gm').test(context.code) &&
    new RegExp(rule.detector.sql_keywords_pattern, 'gm').test(context.code)
  ) {
    addIssue(issues, {
      id: ruleId,
      source: 'rule',
      severity,
      category: rule.item,
      description: rule.finding.message,
      suggestion: 'sprintf 대신 바인딩 변수를 사용하는 안전한 SQL 쿼리 코드로 수정하세요.\n```c\n// AS-IS\nstring q = sprintf("SELECT * FROM t WHERE id=%d", id);\n// TO-BE\nstring q = "SELECT * FROM t WHERE id=:1";\ndbExecuteCommand(db, q, makeDynAnytype(id));\n```'
    });
  }
}

function handleComplexity(rule: any, context: EngineContext, issues: ReviewIssue[], ruleId: string, severity: any) {
  if (context.lines.length > (rule.detector.max_lines || 500)) {
    addIssue(issues, {
      id: rule.detector.line_rule_id || ruleId,
      source: 'rule',
      severity: mapSeverity(rule.detector.line_severity || 'Medium'),
      category: rule.detector.line_rule_item || rule.item,
      description: `${rule.detector.line_message_prefix || '함수 길이 과다'}: ${context.lines.length} lines`,
      suggestion: '함수를 논리적 단위로 분리하는 리팩토링을 진행하세요.\n```c\n// TO-BE\nvoid processAll() {\n  initTask();\n  processTask();\n  cleanupTask();\n}\n```'
    });
  }
}

function handleDivisionZeroGuard(rule: any, context: EngineContext, issues: ReviewIssue[], ruleId: string, severity: any) {
  const divRegex = /([a-zA-Z0-9_]+)\s*=\s*([^/]+)\s*\/\s*([^;]+)/gm;
  let match;
  while ((match = divRegex.exec(context.code)) !== null) {
    const lineNum = getLineNumber(context.code, match.index);
    const lineText = context.lines[lineNum - 1] || '';
    const divisor = match[3].trim();
    
    const hasGuard = lineText.includes(`${divisor} != 0`) || 
                     lineText.includes(`${divisor} > 0`) ||
                     (lineNum > 1 && context.lines[lineNum - 2].includes(`${divisor}`));
    
    if (!hasGuard) {
      addIssue(issues, {
        id: ruleId,
        source: 'rule',
        severity,
        line: lineNum,
        category: rule.item,
        description: rule.finding.message,
        suggestion: `나눗셈 연산 전에 분모(${divisor})가 0인지 확인하는 방어 코드를 추가하세요.\n\`\`\`c\n// TO-BE\nif (${divisor} != 0) {\n  ${match[0].trim()}\n} else {\n  DebugTN("Division by zero error");\n}\n\`\`\``
      });
    }
  }
}

function handleWhileDelayPolicy(rule: any, context: EngineContext, issues: ReviewIssue[], ruleId: string, severity: any) {
  const whileRegex = /while\s*\([^)]*\)\s*\{([^}]*)\}/gm;
  let match;
  while ((match = whileRegex.exec(context.code)) !== null) {
    const body = match[1];
    if (!body.includes('delay(')) {
      const lineNum = getLineNumber(context.code, match.index);
      addIssue(issues, {
        id: ruleId,
        source: 'rule',
        severity,
        line: lineNum,
        category: rule.item,
        description: rule.finding.message,
        suggestion: '무한 루프나 긴 루프 내에서는 시스템 부하를 방지하기 위해 반드시 delay()를 호출해야 합니다.\n```c\n// TO-BE\nwhile(condition) {\n  // ... logic\n  delay(0, 100); // 100ms 대기\n}\n```'
      });
    }
  }
}

function handleWhileDelayOutsideActive(rule: any, context: EngineContext, issues: ReviewIssue[], ruleId: string, severity: any) {
  const whileRegex = /while\s*\([^)]*\)\s*\{([^}]*)\}/gm;
  let match;
  while ((match = whileRegex.exec(context.code)) !== null) {
    const body = match[1];
    const activeGuard = rule.detector.active_guard_pattern || 'isActive';
    if (body.includes('delay(') && body.includes(activeGuard)) {
      const delayPos = body.indexOf('delay(');
      const guardPos = body.indexOf(activeGuard);
      if (delayPos > guardPos) {
        const lineNum = getLineNumber(context.code, match.index);
        addIssue(issues, {
          id: ruleId,
          source: 'rule',
          severity,
          line: lineNum,
          category: rule.item,
          description: rule.finding.message,
          suggestion: 'delay()는 스크립트 활성화 여부(isActive)와 상관없이 루프 내에서 항상 호출되어야 합니다.\n```c\n// TO-BE\nwhile(true) {\n  if (isActive()) {\n    // logic\n  }\n  delay(0, 100); // Guard 밖에서 호출\n}\n```'
        });
      }
    }
  }
}

function handleMemoryLeaks(rule: any, context: EngineContext, issues: ReviewIssue[], ruleId: string, severity: any) {
  if (rule.detector.loop_dyn_ops_pattern && rule.detector.cleanup_pattern) {
    const loopRegex = new RegExp(rule.detector.loop_dyn_ops_pattern, 'gm');
    const cleanupRegex = new RegExp(rule.detector.cleanup_pattern, 'gm');
    let match;
    while ((match = loopRegex.exec(context.code)) !== null) {
      if (!cleanupRegex.test(context.code)) {
        const lineNum = getLineNumber(context.code, match.index);
        const matchedText = match[0].split('\n').pop()?.trim() || 'dynAppend(items, val);';
        const dynVarMatch = matchedText.match(/dyn(?:Append|Insert|MapInsert)\s*\(\s*([^,]+)/);
        const dynVar = dynVarMatch ? dynVarMatch[1] : 'items';
        addIssue(issues, {
          id: ruleId,
          source: 'rule',
          severity,
          line: lineNum,
          category: rule.item,
          description: rule.finding.message,
          suggestion: `루프 내에서 동적 배열(${dynVar})을 사용할 때 메모리 누수를 방지하기 위해 루프 종료 후 dynClear를 사용하세요.\n\`\`\`c\n// AS-IS\n// for(...) {\n//   ${matchedText}\n// }\n\n// TO-BE\nfor(...) {\n  ${matchedText}\n}\ndynClear(${dynVar}); // 메모리 해제\n\`\`\``
        });
      }
    }
  }
}

function handleUnusedVariables(rule: any, context: EngineContext, issues: ReviewIssue[], ruleId: string, severity: any) {
  const varRegex = /\b(?:int|float|string|bool|dyn_\w+)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*[;=]/gm;
  let match;
  while ((match = varRegex.exec(context.code)) !== null) {
    const varName = match[1];
    if (rule.detector.exception_vars?.includes(varName)) continue;
    if (rule.detector.exception_prefixes?.some((p: string) => varName.startsWith(p))) continue;

    const usageRegex = new RegExp(`\\b${varName}\\b`, 'g');
    const usages = context.code.match(usageRegex);
    if (usages && usages.length <= (rule.detector.usage_threshold || 1)) {
      const lineNum = getLineNumber(context.code, match.index);
      addIssue(issues, {
        id: ruleId,
        source: 'rule',
        severity,
        line: lineNum,
        category: rule.item,
        description: `${rule.detector.message_prefix || '미사용 변수'}: ${varName}`,
        suggestion: `사용되지 않는 변수 '${varName}'를 제거하여 코드를 깔끔하게 유지하세요.`
      });
    }
  }
}

function handleLoggingPolicy(rule: any, context: EngineContext, issues: ReviewIssue[], ruleId: string, severity: any) {
  if (rule.detector.trigger_pattern && rule.detector.log_pattern) {
    const triggerRegex = new RegExp(rule.detector.trigger_pattern, 'gm');
    const logRegex = new RegExp(rule.detector.log_pattern, 'gm');
    let match;
    while ((match = triggerRegex.exec(context.code)) !== null) {
      if (!logRegex.test(context.code)) {
        const lineNum = getLineNumber(context.code, match.index);
        const matchedText = match[0].trim();
        addIssue(issues, {
          id: ruleId,
          source: 'rule',
          severity,
          line: lineNum,
          category: rule.item,
          description: rule.finding.message,
          suggestion: `예외나 오류가 발생하는 부분에 적절한 디버깅 로그를 추가하세요.\n\`\`\`c\n// AS-IS\n${matchedText}\n\n// TO-BE\n${matchedText} {\n  DebugTN("Error occurred during operation: " + getLastError());\n}\n\`\`\``
        });
      }
    }
  }
}

function handleScriptActiveCheck(rule: any, context: EngineContext, issues: ReviewIssue[], ruleId: string, severity: any) {
  if (rule.detector.mutating_pattern && rule.detector.active_guard_pattern) {
    const mutatingRegex = new RegExp(rule.detector.mutating_pattern, 'gm');
    const guardRegex = new RegExp(rule.detector.active_guard_pattern, 'gm');
    let match;
    while ((match = mutatingRegex.exec(context.code)) !== null) {
      if (!guardRegex.test(context.code)) {
        const lineNum = getLineNumber(context.code, match.index);
        const matchedText = match[0].trim();
        addIssue(issues, {
          id: ruleId,
          source: 'rule',
          severity,
          line: lineNum,
          category: rule.item,
          description: rule.finding.message,
          suggestion: `상태를 변경하는 코드 실행 전에 스크립트가 활성화 상태인지 확인하세요.\n\`\`\`c\n// AS-IS\n${matchedText}\n\n// TO-BE\nif (!isActive()) return;\n${matchedText}\n\`\`\``
        });
      }
    }
  }
}

function handleStyleHeaderRules(rule: any, context: EngineContext, issues: ReviewIssue[], ruleId: string, severity: any) {
  const funcRegex = /void\s+([a-zA-Z_]\w*)\s*\(/gm;
  let match;
  while ((match = funcRegex.exec(context.code)) !== null) {
    const lineNum = getLineNumber(context.code, match.index);
    const prevLines = context.lines.slice(Math.max(0, lineNum - 5), lineNum - 1).join('\n');
    if (!prevLines.includes('/**') && !prevLines.includes('//')) {
      addIssue(issues, {
        id: ruleId,
        source: 'rule',
        severity,
        line: lineNum,
        category: rule.item,
        description: rule.finding.message,
        suggestion: `함수 '${match[1]}'에 대한 헤더 주석(기능 설명, 인자, 반환값)을 추가하세요.`
      });
    }
  }
}

function handleMagicIndex(rule: any, context: EngineContext, issues: ReviewIssue[], ruleId: string, severity: any) {
  const idxRegex = /\[(\d+)\]/gm;
  let match;
  const matches: { [key: string]: number[] } = {};
  while ((match = idxRegex.exec(context.code)) !== null) {
    const val = match[1];
    if (!matches[val]) matches[val] = [];
    matches[val].push(getLineNumber(context.code, match.index));
  }
  
  Object.entries(matches).forEach(([val, lineNums]) => {
    if (lineNums.length >= (rule.detector.min_matches || 3)) {
      lineNums.forEach(lineNum => {
        addIssue(issues, {
          id: ruleId,
          source: 'rule',
          severity,
          line: lineNum,
          category: rule.item,
          description: `${rule.finding.message}: 인덱스 [${val}]이 ${lineNums.length}회 반복 사용됨.`,
          suggestion: `매직 넘버 [${val}] 대신 의미 있는 상수를 정의하여 사용하세요.\n\`\`\`c\nconst int IDX_MY_VAL = ${val};\n\`\`\``
        });
      });
    }
  });
}

function handleHardcodingExtended(rule: any, context: EngineContext, issues: ReviewIssue[], ruleId: string, severity: any) {
  if (rule.detector.dp_repeat_threshold) {
     const dpRegex = /"([^"]+\.[^"]+)"/gm;
     let match;
     const dpMatches: { [key: string]: number[] } = {};
     while ((match = dpRegex.exec(context.code)) !== null) {
       const val = match[1];
       if (!dpMatches[val]) dpMatches[val] = [];
       dpMatches[val].push(getLineNumber(context.code, match.index));
     }
     
     Object.entries(dpMatches).forEach(([val, lineNums]) => {
       if (lineNums.length >= rule.detector.dp_repeat_threshold) {
         lineNums.forEach(lineNum => {
           addIssue(issues, {
             id: ruleId,
             source: 'rule',
             severity,
             line: lineNum,
             category: rule.item,
             description: rule.finding.message,
             suggestion: `반복되는 DP 경로 "${val}"를 상수로 추출하세요.`
           });
         });
       }
     });
  }
}

function handleDbQueryError(rule: any, context: EngineContext, issues: ReviewIssue[], ruleId: string, severity: any) {
  if (rule.detector.query_call_pattern) {
    const queryRegex = new RegExp(rule.detector.query_call_pattern, 'gm');
    let match;
    while ((match = queryRegex.exec(context.code)) !== null) {
      if (!/getLastError|writeLog|DebugTN/gm.test(context.code)) {
        const lineNum = getLineNumber(context.code, match.index);
        const matchedText = match[0].trim();
        addIssue(issues, {
          id: ruleId,
          source: 'rule',
          severity,
          line: lineNum,
          category: rule.item,
          description: rule.finding.message,
          suggestion: `DB 쿼리 실행 후 실패 여부를 확인하고 로그를 남기세요.\n\`\`\`c\n// AS-IS\n${matchedText}(...);\n\n// TO-BE\nint rc = ${matchedText}(...);\nif (rc != 0 || getLastError() != 0) {\n  DebugTN("${matchedText} failed");\n}\n\`\`\``
        });
      }
    }
  }
}

function handleDpFunctionException(rule: any, context: EngineContext, issues: ReviewIssue[], ruleId: string, severity: any) {
  if (rule.detector.dp_call_pattern) {
    const dpRegex = new RegExp(rule.detector.dp_call_pattern, 'gm');
    let match;
    while ((match = dpRegex.exec(context.code)) !== null) {
      const lineNum = getLineNumber(context.code, match.index);
      const lineText = context.lines[lineNum - 1] || '';
      if (!lineText.includes('=') && !lineText.includes('if')) {
        const matchedText = match[0].trim();
        const funcMatch = matchedText.match(/^(dp[a-zA-Z]+)/);
        const funcName = funcMatch ? funcMatch[1] : 'dpSet';
        addIssue(issues, {
          id: ruleId,
          source: 'rule',
          severity,
          line: lineNum,
          category: rule.item,
          description: rule.finding.message,
          suggestion: `DP 함수의 반환값을 확인하여 오류를 처리하세요.\n\`\`\`c\n// AS-IS\n${matchedText}\n\n// TO-BE\nint rc = ${matchedText}\nif (rc != 0) {\n  DebugTN("${funcName} failed");\n}\n\`\`\``
        });
      }
    }
  }
}

function handleDeadCode(rule: any, context: EngineContext, issues: ReviewIssue[], ruleId: string, severity: any) {
  if (rule.detector.detect_if_false) {
    const ifFalseRegex = /if\s*\(\s*false\s*\)/gm;
    let match;
    while ((match = ifFalseRegex.exec(context.code)) !== null) {
      const lineNum = getLineNumber(context.code, match.index);
      addIssue(issues, {
        id: ruleId,
        source: 'rule',
        severity,
        line: lineNum,
        category: rule.item,
        description: rule.finding.message,
        suggestion: '실행되지 않는 조건문이나 도달할 수 없는 코드를 제거하세요.\n```c\n// AS-IS\nif (false) { doSomething(); }\nreturn;\ndoOtherThing(); // 제거 대상\n```'
      });
    }
  }
  if (rule.detector.detect_after_return) {
    const returnRegex = /return[^;]*;\s*([^\n}]+)/gm;
    let match;
    while ((match = returnRegex.exec(context.code)) !== null) {
      const lineNum = getLineNumber(context.code, match.index);
      addIssue(issues, {
        id: ruleId,
        source: 'rule',
        severity,
        line: lineNum,
        category: rule.item,
        description: rule.detector.return_after_message || rule.finding.message,
        suggestion: 'return 문 이후에 작성되어 도달할 수 없는 코드를 제거해주세요.\n```c\n// AS-IS\nreturn;\ndoOtherThing(); // 제거 대상\n```'
      });
    }
  }
}

function handleUiBlockInitialize(rule: any, context: EngineContext, issues: ReviewIssue[], ruleId: string, severity: any) {
  if (rule.detector.event_equals === 'Initialize' && rule.detector.contains) {
    if (context.code.includes('Initialize') && context.code.includes(rule.detector.contains)) {
      addIssue(issues, {
        id: ruleId,
        source: 'rule',
        severity,
        category: rule.item,
        description: rule.finding.message,
        suggestion: 'UI 초기화 블록 내에서 delay() 사용을 피하고 비동기 처리를 사용하세요.\n```c\n// AS-IS\nInitialize() { delay(2); }\n// TO-BE\nInitialize() { startThread("asyncInit"); }\n```'
      });
    }
  }
}

function handleFloatLiteral(rule: any, context: EngineContext, issues: ReviewIssue[], ruleId: string, severity: any) {
  if (rule.detector.literals && Array.isArray(rule.detector.literals)) {
    rule.detector.literals.forEach((literal: string) => {
      const literalRegex = new RegExp(`\\b${literal.replace('.', '\\.')}\\b`, 'gm');
      let match;
      let count = 0;
      while ((match = literalRegex.exec(context.code)) !== null) {
        count++;
        if (count >= (rule.detector.min_hits || 1)) {
          const lineNum = getLineNumber(context.code, match.index);
          addIssue(issues, {
            id: ruleId,
            source: 'rule',
            severity,
            line: lineNum,
            category: rule.item,
            description: rule.finding.message,
            suggestion: `하드코딩된 소수값(${literal})을 상수로 선언하여 사용하세요.\n\`\`\`c\n// TO-BE\nconst float THRESHOLD = ${literal};\nif (value > THRESHOLD) { ... }\n\`\`\``
          });
        }
      }
    });
  }
}

function handleDuplicateAction(rule: any, context: EngineContext, issues: ReviewIssue[], ruleId: string, severity: any) {
  const callPattern = rule.detector.call_pattern || '\\b(?:dpSet|setValue)\\s*\\(\\s*"([^"]+)"';
  const callRegex = new RegExp(callPattern, 'gm');
  let match;
  const targetCalls: { [key: string]: number[] } = {};
  while ((match = callRegex.exec(context.code)) !== null) {
    const target = match[1];
    if (!targetCalls[target]) targetCalls[target] = [];
    targetCalls[target].push(getLineNumber(context.code, match.index));
  }

  Object.entries(targetCalls).forEach(([target, lineNums]) => {
    if (lineNums.length >= (rule.detector.min_repeat || 2)) {
      for (let i = 0; i < lineNums.length - 1; i++) {
        if (lineNums[i+1] - lineNums[i] <= (rule.detector.max_gap_lines || 10)) {
          const guardRegex = new RegExp(rule.detector.duplicate_guard_pattern || 'changed', 'i');
          const ctx = context.lines.slice(Math.max(0, lineNums[i] - 3), lineNums[i+1]).join('\n');
          if (!guardRegex.test(ctx)) {
            addIssue(issues, {
              id: ruleId,
              source: 'rule',
              severity,
              line: lineNums[i+1],
              category: rule.item,
              description: rule.finding.message.replace('{target}', target),
              suggestion: `동일 대상("${target}")에 대한 중복 호출이 감지되었습니다. 값이 변경된 경우에만 실행되도록 가드 조건을 추가하세요.\n\`\`\`c\n// TO-BE\nif (oldVal != newVal) {\n  dpSet("${target}", newVal);\n}\n\`\`\``
            });
          }
        }
      }
    }
  });
}

function handleGenericPattern(rule: any, context: EngineContext, issues: ReviewIssue[], ruleId: string, severity: any) {
  const patternsToCheck = [
    rule.detector.query_call_pattern,
    rule.detector.dp_call_pattern,
    rule.detector.trigger_pattern,
    rule.detector.call_pattern,
    rule.detector.declaration_pattern,
    rule.detector.active_guard_pattern,
    rule.detector.mutating_pattern,
    rule.detector.cleanup_pattern,
    rule.detector.loop_dyn_ops_pattern
  ].filter(Boolean);

  patternsToCheck.forEach((pattern: string) => {
    try {
      const regex = new RegExp(pattern, 'gm');
      let match;
      while ((match = regex.exec(context.code)) !== null) {
        const lineNum = getLineNumber(context.code, match.index);
        const matchedText = match[0].substring(0, 100).replace(/\n/g, ' ');
        addIssue(issues, {
          id: ruleId,
          source: 'rule',
          severity,
          line: lineNum,
          category: rule.item,
          description: rule.finding.message,
          suggestion: getCompositeFallbackSuggestion(ruleId, matchedText)
        });
      }
    } catch (e) {}
  });
}

const LEGACY_HANDLERS: Record<string, (rule: any, context: EngineContext, issues: ReviewIssue[], ruleId: string, severity: any) => void> = {
  'sql_injection': handleSqlInjection,
  'complexity': handleComplexity,
  'division_zero_guard': handleDivisionZeroGuard,
  'while_delay_policy': handleWhileDelayPolicy,
  'while_delay_outside_active': handleWhileDelayOutsideActive,
  'memory_leaks_advanced': handleMemoryLeaks,
  'unused_variables': handleUnusedVariables,
  'debug_logging_presence': handleLoggingPolicy,
  'logging_level_policy': handleLoggingPolicy,
  'script_active_condition_check': handleScriptActiveCheck,
  'style_header_rules': handleStyleHeaderRules,
  'magic_index_usage': handleMagicIndex,
  'hardcoding_extended': handleHardcodingExtended,
  'db_query_error': handleDbQueryError,
  'dp_function_exception': handleDpFunctionException,
  'dead_code': handleDeadCode,
  'ui_block_initialize_delay': handleUiBlockInitialize,
  'float_literal_hardcoding': handleFloatLiteral,
  'duplicate_action_handling': handleDuplicateAction
};

// --- Rule Handlers ---

function handleDataDrivenRule(rule: any, context: EngineContext, issues: ReviewIssue[], ruleId: string, severity: any) {
  const rootCondition = rule.detector.conditions 
    ? { kind: 'and', conditions: rule.detector.conditions }
    : (rule.detector.condition || rule.detector);
  
  const matches = evaluateCondition(rootCondition, context);
  matches.forEach(match => {
    addIssue(issues, {
      id: ruleId,
      source: 'rule',
      severity,
      line: match.line > 0 ? match.line : undefined,
      category: rule.item,
      description: rule.finding.message,
      suggestion: rule.finding.suggestion || getRegexRuleSuggestion(ruleId, match.text)
    });
  });
}

function handleCompositeRule(rule: any, context: EngineContext, issues: ReviewIssue[], ruleId: string, severity: any) {
  const op = rule.detector.op;
  const handler = LEGACY_HANDLERS[op];
  
  if (handler) {
    handler(rule, context, issues, ruleId, severity);
  } else {
    handleGenericPattern(rule, context, issues, ruleId, severity);
  }
}

function handleLineRepeatRule(rule: any, context: EngineContext, issues: ReviewIssue[], ruleId: string, severity: any) {
  const matches = evaluateCondition({ kind: 'line_repeat', ...rule.detector }, context);
  matches.forEach(match => {
    addIssue(issues, {
      id: ruleId,
      source: 'rule',
      severity,
      line: match.line,
      category: rule.item,
      description: rule.finding.message,
      suggestion: rule.finding.suggestion || getCompositeFallbackSuggestion(ruleId, match.text)
    });
  });
}

export function runRuleEngine(code: string): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const lines = code.split('\n');
  const context: EngineContext = { code, lines };

  rulesData.forEach((rule: any) => {
    if (!rule.enabled) return;

    const ruleId = rule.rule_id || rule.id;
    const severity = mapSeverity(rule.finding.severity);

    if (rule.detector.kind === 'composite') {
      handleCompositeRule(rule, context, issues, ruleId, severity);
    } else if (rule.detector.kind === 'line_repeat') {
      handleLineRepeatRule(rule, context, issues, ruleId, severity);
    } else {
      handleDataDrivenRule(rule, context, issues, ruleId, severity);
    }
  });

  return issues;
}

function getLineNumber(code: string, index: number): number {
  return code.substring(0, index).split('\n').length;
}

function addIssue(issues: ReviewIssue[], newIssue: ReviewIssue) {
  const exists = issues.some(
    (i) => i.id === newIssue.id && i.line === newIssue.line
  );
  if (!exists) {
    issues.push(newIssue);
  }
}

function mapSeverity(sev: string): 'critical' | 'warning' | 'info' {
  const s = sev?.toLowerCase() || 'info';
  if (s === 'critical' || s === 'high') return 'critical';
  if (s === 'warning' || s === 'medium') return 'warning';
  return 'info';
}

function getRegexRuleSuggestion(ruleId: string, matchedText: string): string {
  const cleanMatch = matchedText.trim();
  const handler = REGEX_SUGGESTION_HANDLERS[ruleId];
  if (handler) {
    return handler(cleanMatch);
  }
  return `[감지된 코드: \`${cleanMatch}\`]\n\n이 부분의 코드를 최적화된 형태로 수정하세요. (AI가 구체적인 수정안을 제안할 것입니다.)`;
}

const REGEX_SUGGESTION_HANDLERS: Record<string, (cleanMatch: string) => string> = {
  "PERF-01": (cleanMatch) => {
    const delayMatch = cleanMatch.match(/delay\s*\(\s*([^)]+)\s*\)/);
    const delayVal = delayMatch ? delayMatch[1] : '...';
    return `Callback 내부 delay 사용은 병목을 유발합니다. 비동기 스레드로 분리하세요.\n\`\`\`c\n// AS-IS\n${cleanMatch}\n// TO-BE\nstartThread("asyncTask", ${delayVal});\n\`\`\``;
  },
  "PERF-02": (cleanMatch) => {
    const queryMatch = cleanMatch.match(/SELECT\s+.*?\s+FROM\s+['"]([^'"]+)['"]/i);
    const fromClause = queryMatch ? queryMatch[1] : 'System1:SpecificDp*';
    return `DP Query에서 '*.*'와 같은 전체 범위 조회를 피하고 구체적인 경로를 지정하세요.\n\`\`\`c\n// AS-IS\n${cleanMatch}\n// TO-BE\ndpQuery("SELECT '_original.._value' FROM '${fromClause.replace(/\*\.\*/g, 'SpecificDp*')}'", res);\n\`\`\``;
  },
  "HARD-01": (cleanMatch) => {
    const stringMatch = cleanMatch.match(/["']([^"']+)["']/);
    const hardcodedVal = stringMatch ? stringMatch[1] : '192.168.0.1';
    return `IP, URL, 설정 경로 등의 하드코딩을 피하고 설정 파일이나 DP에서 읽어오도록 수정하세요.\n\`\`\`c\n// AS-IS\n${cleanMatch}\n// TO-BE\nstring ip;\ndpGet("System1:Config.IP", ip); // ${hardcodedVal} 대신 동적 할당\n\`\`\``;
  },
  "DB-01": (cleanMatch) => {
    return `SQL 쿼리를 문자열로 조합하지 말고 바인딩 변수를 사용하세요.\n\`\`\`c\n// AS-IS\n${cleanMatch}\n// TO-BE\nstring q = "SELECT * FROM t WHERE id=:1";\n\`\`\``;
  },
  "PERF-02-WHERE-DPT-IN-01": (cleanMatch) => {
    return `WHERE 절에서 _DPT IN 대신 _DPT = 조건을 사용하여 인덱스를 타도록 최적화하세요.\n\`\`\`c\n// AS-IS\n${cleanMatch}\n// TO-BE\n... WHERE _DPT = "TypeA"\n\`\`\``;
  },
  "DB-02": (cleanMatch) => {
    return `쿼리문에 주석이 누락되었습니다. 쿼리의 목적을 설명하는 주석을 추가하세요.\n\`\`\`c\n// TO-BE\n// 사용자 정보를 조회하는 쿼리\n${cleanMatch}\n\`\`\``;
  }
};

function getCompositeFallbackSuggestion(ruleId: string, matchedText: string): string {
  const cleanMatch = matchedText.trim();
  const handler = COMPOSITE_SUGGESTION_HANDLERS[ruleId];
  if (handler) {
    return handler(cleanMatch);
  }
  return `[감지된 코드: \`${cleanMatch}\`]\n\n이 부분의 코드를 어떻게 수정해야 할지 구체적인 코드로 제안해주세요.`;
}

const COMPOSITE_SUGGESTION_HANDLERS: Record<string, (cleanMatch: string) => string> = {
  "PERF-EV-01": handleBatchOpSuggestion,
  "PERF-05": handleBatchOpSuggestion,
  "PERF-DPSET-BATCH-01": handleBatchOpSuggestion,
  "PERF-DPGET-BATCH-01": (cleanMatch) => {
    const dpGetMatch = cleanMatch.match(/dpGet\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/);
    const dpName = dpGetMatch ? dpGetMatch[1] : '"Dp1"';
    return `루프 내에서 개별적으로 dpGet을 호출하지 말고 배열을 사용하여 일괄 조회하세요.\n\`\`\`c\n// AS-IS\n// for(...) {\n//   ${cleanMatch}\n// }\n\n// TO-BE\ndyn_string dps = makeDynString(${dpName}, "Dp2");\ndyn_anytype vals;\ndpGet(dps, vals);\n\`\`\``;
  },
  "PERF-SETVALUE-BATCH-01": handleMultiValueSuggestion,
  "PERF-SETMULTIVALUE-ADOPT-01": handleMultiValueSuggestion,
  "PERF-GETMULTIVALUE-ADOPT-01": (cleanMatch) => {
    const getValueMatch = cleanMatch.match(/getValue\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)/);
    const shape = getValueMatch ? getValueMatch[1] : '"rect1"';
    const prop = getValueMatch ? getValueMatch[2] : '"backCol"';
    const val = getValueMatch ? getValueMatch[3] : 'col1';
    return `여러 개의 getValue 호출을 getMultiValue로 묶어서 처리하세요.\n\`\`\`c\n// AS-IS\n${cleanMatch}\ngetValue("rect2", ${prop}, col2);\n\n// TO-BE\nstring ${val.replace(/["']/g, '')}, col2;\ngetMultiValue(${shape}, ${prop}, ${val}, "rect2", ${prop}, col2);\n\`\`\``;
  },
  "EXC-TRY-01": (cleanMatch) => {
    return `예외 발생 가능성이 있는 구문에 try/catch 블록을 추가하세요.\n\`\`\`c\n// AS-IS\n${cleanMatch}\n\n// TO-BE\ntry {\n  ${cleanMatch}\n} catch {\n  DebugTN("Exception caught: " + getLastError());\n}\n\`\`\``;
  },
  "SAFE-DIV-01": (cleanMatch) => {
    const divMatch = cleanMatch.match(/([^=\s]+)\s*=\s*([^/]+)\s*\/\s*([^;]+)/);
    const result = divMatch ? divMatch[1].trim() : 'result';
    const dividend = divMatch ? divMatch[2].trim() : 'dividend';
    const divisor = divMatch ? divMatch[3].trim() : 'divisor';
    return `나눗셈 연산 전에 분모가 0인지 확인하는 방어 코드를 추가하세요.\n\`\`\`c\n// AS-IS\n${cleanMatch}\n\n// TO-BE\nif (${divisor} != 0) {\n  ${result} = ${dividend} / ${divisor};\n} else {\n  DebugTN("Division by zero error");\n}\n\`\`\``;
  },
  "PERF-AGG-01": (cleanMatch) => {
    return `수동으로 집계(Sum, Avg)를 계산하지 말고 내장 함수(dynSum, dynAvg)를 사용하세요.\n\`\`\`c\n// AS-IS\n${cleanMatch}\n\n// TO-BE\nfloat total = dynSum(values);\n\`\`\``;
  },
  "VAL-01": (cleanMatch) => {
    return `입력값을 사용하기 전에 유효성(길이, 범위 등)을 검증하세요.\n\`\`\`c\n// AS-IS\n${cleanMatch}\n\n// TO-BE\nif (strlen(input) > 0) {\n  ${cleanMatch}\n}\n\`\`\``;
  },
  "STYLE-NAME-01": handleStyleSuggestion,
  "STYLE-INDENT-01": handleStyleSuggestion,
  "STYLE-HEADER-01": handleStyleSuggestion,
  "STD-01": handleStyleSuggestion,
  "STYLE-IDX-01": (cleanMatch) => {
    const idxMatch = cleanMatch.match(/\[(\d+)\]/);
    const magicNum = idxMatch ? idxMatch[1] : '1';
    return `인덱스에 매직 넘버를 사용하지 말고 상수로 정의하세요.\n\`\`\`c\n// AS-IS\n${cleanMatch}\n\n// TO-BE\nconst int IDX_VALUE = ${magicNum};\nstring name = arr[IDX_VALUE];\n\`\`\``;
  },
  "HARD-02": handleHardcodingSuggestion,
  "HARD-03": handleHardcodingSuggestion,
  "CLEAN-DUP-01": (cleanMatch) => {
    return `중복된 코드를 함수나 루프로 추출하여 재사용성을 높이세요.\n\`\`\`c\n// AS-IS\n${cleanMatch}\n\n// TO-BE\nvoid updateStatus(string dp, int val) {\n  dpSet(dp, val);\n}\n\`\`\``;
  },
  "ACTIVE-01": (cleanMatch) => {
    return `상태 변경 전 스크립트 활성화 여부를 확인하세요.\n\`\`\`c\n// AS-IS\n${cleanMatch}\n\n// TO-BE\nif (!isActive()) return;\n${cleanMatch}\n\`\`\``;
  },
  "DUP-ACT-01": (cleanMatch) => {
    const dpSetMatch = cleanMatch.match(/dpSet\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/);
    const target = dpSetMatch ? dpSetMatch[1] : '"Target"';
    const newVal = dpSetMatch ? dpSetMatch[2] : 'newVal';
    return `동일 대상에 대한 중복 동작을 방지하는 가드를 추가하세요.\n\`\`\`c\n// AS-IS\n${cleanMatch}\n\n// TO-BE\nif (oldVal != ${newVal}) {\n  dpSet(${target}, ${newVal});\n}\n\`\`\``;
  }
};

function handleBatchOpSuggestion(cleanMatch: string): string {
  const dpSetMatch = cleanMatch.match(/dpSet\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/);
  const dpName = dpSetMatch ? dpSetMatch[1] : '"Dp"+i';
  const dpVal = dpSetMatch ? dpSetMatch[2] : 'i';
  return `루프 내에서 개별적으로 dpSet을 호출하지 말고 배열을 사용하여 일괄 처리(dpSetWait 등) 하세요.\n\`\`\`c\n// AS-IS\n// for(...) {\n//   ${cleanMatch}\n// }\n\n// TO-BE\ndyn_string dps;\ndyn_anytype vals;\nfor(int i=1; i<=10; i++) {\n  dynAppend(dps, ${dpName});\n  dynAppend(vals, ${dpVal});\n}\ndpSetWait(dps, vals);\n\`\`\``;
}

function handleMultiValueSuggestion(cleanMatch: string): string {
  const setValueMatch = cleanMatch.match(/setValue\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)/);
  const shape = setValueMatch ? setValueMatch[1] : '"rect1"';
  const prop = setValueMatch ? setValueMatch[2] : '"backCol"';
  const val = setValueMatch ? setValueMatch[3] : '"red"';
  return `여러 개의 setValue 호출을 setMultiValue로 묶어서 처리하세요.\n\`\`\`c\n// AS-IS\n${cleanMatch}\nsetValue("rect2", ${prop}, "blue");\n\n// TO-BE\nsetMultiValue(${shape}, ${prop}, ${val}, "rect2", ${prop}, "blue");\n\`\`\``;
}

function handleStyleSuggestion(cleanMatch: string): string {
  return `코딩 표준 및 명명 규칙에 맞게 코드를 수정하세요.\n\`\`\`c\n// AS-IS\n${cleanMatch}\n\n// TO-BE\n// 함수 설명 주석\nvoid myStandardFunction() {\n  // 들여쓰기 및 세미콜론 준수\n}\n\`\`\``;
}

function handleHardcodingSuggestion(cleanMatch: string): string {
  const strMatch = cleanMatch.match(/["']([^"']+)["']/);
  const hardStr = strMatch ? strMatch[1] : 'System1:Device.';
  return `반복되는 고정 문자열이나 매직 넘버를 상수로 추출하세요.\n\`\`\`c\n// AS-IS\n${cleanMatch}\n\n// TO-BE\nconst string DP_PREFIX = "${hardStr}";\ndpSet(DP_PREFIX + "Status", 1);\n\`\`\``;
}

