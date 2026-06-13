import 'dotenv/config'
import { z } from 'zod'

/**
 * Validate the environment once at boot so a missing/typo'd var fails loudly
 * here instead of as a confusing runtime error deep inside a request.
 */
const schema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  // Optional: enables the admin dashboard's live OpenRouter balance/budget panel
  // (/api/ai-usage/openrouter). Held server-side only — never sent to the client.
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  OPENROUTER_DAILY_BUDGET_USD: z.coerce.number().positive().default(2),
  PORT: z.coerce.number().int().positive().default(8787),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean)),
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:')
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`)
  }
  console.error('\nCopy .env.example to .env and fill in the values.')
  process.exit(1)
}

export const env = parsed.data
