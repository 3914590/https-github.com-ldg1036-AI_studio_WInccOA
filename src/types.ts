export interface ReviewIssue {
  id?: string;
  source: 'rule' | 'ai';
  severity: 'critical' | 'warning' | 'info';
  line?: number;
  category: string;
  description: string;
  suggestion: string;
}

export interface CodeReviewResult {
  summary: string;
  issues: ReviewIssue[];
  score: number; // 0-100
  refactoredCode?: string;
}

export interface PerformanceIssue {
  line?: number;
  codeSnippet?: string;
  description: string;
  suggestion: string;
}

export interface PerformanceResult {
  summary: string;
  bottlenecks: PerformanceIssue[];
  optimizedCode: string;
}

