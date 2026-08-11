export interface Config { port: number; databaseUrl?: string; jwtSecret: string; receiptSigningSecret: string; openaiApiKey?: string; model: string; allowedOrigins: string[]; }
export function loadConfig(): Config {
  const jwtSecret = process.env.JWT_SECRET ?? "dev-only-jwt-secret-change-me";
  const receiptSigningSecret = process.env.RECEIPT_SIGNING_SECRET ?? "dev-only-receipt-secret-change-me";
  return { port: Number(process.env.PORT ?? 8787), ...(process.env.DATABASE_URL ? {databaseUrl: process.env.DATABASE_URL} : {}), jwtSecret, receiptSigningSecret, ...(process.env.OPENAI_API_KEY ? {openaiApiKey: process.env.OPENAI_API_KEY} : {}), model: process.env.LATCH_MODEL ?? "gpt-5.1", allowedOrigins: (process.env.LATCH_ALLOW_ORIGIN ?? "http://localhost:5173").split(",").map(s => s.trim()).filter(Boolean) };
}
