export interface ParsedStackFrame {
  file?: string;
  line?: number;
  column?: number;
  method?: string;
}

export const parseStack = (stack?: string, maxFrames = 5): ParsedStackFrame[] => {
  if (!stack) return [];

  return stack
    .split('\n')
    .slice(1, maxFrames + 1)
    .map((line) => {
      const match = line.match(/at\s+(?:(.+?)\s+\()?(?:(.+?):(\d+):(\d+)\)?)/);
      if (!match) return {};
      return {
        method: match[1]?.trim(),
        file: match[2]?.trim(),
        line: Number(match[3]),
        column: Number(match[4]),
      };
    });
};

export const categorizeError = (error: Error): string => {
  const name = error.name?.toLowerCase() || '';
  if (name.includes('validation')) return 'validation';
  if (name.includes('auth')) return 'authentication';
  if (name.includes('mongo')) return 'database';
  if (name.includes('timeout')) return 'timeout';
  return 'application';
};
