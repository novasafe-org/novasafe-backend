const parseOrigins = (raw: string | undefined): string[] =>
  (raw ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

const defaultOrigins = [
  'https://novasafe.io',
  'https://www.novasafe.io',
  'https://app.novasafe.io',
  'https://start.novasafe.io',
  'http://localhost:3101',
  'http://localhost:3102',
  'http://127.0.0.1:3101',
  'http://127.0.0.1:3102',
];

export const corsConfig = {
  allowedOrigins: parseOrigins(process.env.CORS_ALLOWED_ORIGINS).length
    ? parseOrigins(process.env.CORS_ALLOWED_ORIGINS)
    : defaultOrigins,
} as const;

export const isOriginAllowed = (origin: string | undefined): boolean => {
  if (!origin) return true;
  return corsConfig.allowedOrigins.includes(origin);
};
