const required = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
};

export const config = {
  supabase: {
    url: required('NEXT_PUBLIC_SUPABASE_URL'),
    anonKey: required('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    serviceRoleKey: process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '',
  },
  app: {
    url: process.env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3000',
  },
  gemini: {
    apiKey: required('GEMINI_API_KEY'),
    model: process.env['GEMINI_MODEL'] ?? 'gemini-3.1-flash-lite-preview',
    embeddingModel: process.env['GEMINI_EMBEDDING_MODEL'] ?? 'gemini-embedding-001',
  },
  cron: {
    secret: process.env['CRON_SECRET'] ?? '',
  },
  sentry: {
    dsn: process.env['SENTRY_DSN'] ?? '',
  },
} as const;
