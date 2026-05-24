/** Strip ANSI escape sequences for structured log sinks (JSON files, Loki, etc.). */
export const stripAnsi = (value: string): string => {
  if (!value || !/\u001b\[[\d;]*m/.test(value)) return value;
  // eslint-disable-next-line no-control-regex -- intentional removal of terminal color codes
  return value.replace(/\u001b\[[0-9;]*m/g, '');
};
