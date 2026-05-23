export interface CurlExportInput {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
}

export const toCurl = (input: CurlExportInput): string => {
  const parts = ['curl', '-X', input.method.toUpperCase(), `'${input.url}'`];
  const headers = input.headers ?? {};
  for (const [key, value] of Object.entries(headers)) {
    if (value) parts.push('-H', `'${key}: ${value.replace(/'/g, "'\\''")}'`);
  }
  if (input.body && input.method.toUpperCase() !== 'GET') {
    parts.push('-d', `'${input.body.replace(/'/g, "'\\''")}'`);
  }
  return parts.join(' ');
};

export const toFetch = (input: CurlExportInput): string => {
  const headers = JSON.stringify(input.headers ?? {}, null, 2);
  const body =
    input.body && input.method.toUpperCase() !== 'GET'
      ? `,\n  body: ${JSON.stringify(input.body)}`
      : '';
  return `await fetch('${input.url}', {
  method: '${input.method.toUpperCase()}',
  headers: ${headers}${body}
});`;
};
