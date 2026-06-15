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
  // Comma-separated admin emails allowed to hit /api/ai-usage/* (the dashboard).
  // Fail-closed: if unset, no one is admin.
  ADMIN_EMAILS: z.string().optional(),
  // Reddit ingestion (multi-user). Optional so the API boots without it;
  // /api/connections/reddit/credential only works once it's set. base64 of 32
  // bytes — encrypts the user's pasted cookie; MUST match the worker's value.
  REDDIT_TOKEN_ENC_KEY: z.string().min(1).optional(),
  // Optional: fire a GitHub repository_dispatch when a sync is enqueued so the
  // Actions queue-drainer runs immediately (else the 6h cron picks it up). Token
  // needs Actions: write on the SavedPosts repo. REPO is "owner/name".
  GH_DISPATCH_TOKEN: z.string().min(1).optional(),
  GH_DISPATCH_REPO: z.string().min(1).optional(),
  // Optional: enables the admin dashboard's live OpenRouter balance/budget panel
  // (/api/ai-usage/openrouter). Held server-side only — never sent to the client.
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  OPENROUTER_DAILY_BUDGET_USD: z.coerce.number().positive().default(2),
  // Optional: enables the dashboard's live Cloudflare Workers AI neuron-usage
  // panel (/api/ai-usage/cloudflare). The token needs Account Analytics: Read
  // (the inference token alone is not authorized for the GraphQL analytics API).
  CLOUDFLARE_ACCOUNT_ID: z.string().min(1).optional(),
  CLOUDFLARE_API_TOKEN: z.string().min(1).optional(),
  // Optional: enables the authoritative per-model Gemini usage panel
  // (/api/ai-usage/gemini) via the Cloud Monitoring API. PROJECT_ID is the AI
  // Studio project; provide the read-only service-account key as inline JSON
  // (prod) or a file path (local dev). Needs roles/monitoring.viewer.
  GEMINI_MONITORING_PROJECT_ID: z.string().min(1).optional(),
  GEMINI_MONITORING_SA_JSON: z.string().min(1).optional(),
  GEMINI_MONITORING_SA_KEYFILE: z.string().min(1).optional(),
  // A billing-enabled project to attribute the (free) Monitoring reads to, since
  // the AI Studio free-tier project has billing off. The SA needs
  // roles/serviceusage.serviceUsageConsumer on it.
  GEMINI_MONITORING_QUOTA_PROJECT: z.string().min(1).optional(),
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
