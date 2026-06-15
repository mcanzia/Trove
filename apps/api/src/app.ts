import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { env } from './lib/env.js'
import type { AppEnv } from './lib/context.js'
import { requireAuth } from './middleware/auth.js'
import { recipes } from './routes/recipes.js'
import { categories } from './routes/categories.js'
import { analysisItems } from './routes/analysisItems.js'
import { enrichments } from './routes/enrichments.js'
import { posts } from './routes/posts.js'
import { stats } from './routes/stats.js'
import { aiUsage } from './routes/aiUsage.js'
import { connections, redditCallback } from './routes/connections.js'
import { syncJobs } from './routes/syncJobs.js'

export const app = new Hono<AppEnv>()

app.use('*', logger())
app.use(
  '/api/*',
  cors({
    origin: env.CORS_ORIGINS,
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  }),
)

// Every /api/* route requires a valid Supabase session (CORS preflight runs and
// returns first, so OPTIONS is unaffected). Sets c.var.supabase + c.var.userId.
app.use('/api/*', requireAuth)

// Health check (handy for uptime probes / deploy smoke tests) — left unauthenticated.
app.get('/health', (c) => c.json({ ok: true, service: 'trove-backend' }))

// Reddit OAuth callback — top-level (NOT under /api/*) so requireAuth doesn't gate
// it; a browser redirect from Reddit carries no bearer token, so identity comes
// from the signed `state` instead.
app.get('/auth/reddit/callback', redditCallback)

// Mounting routes on a const chain keeps the inferred type intact for Hono RPC.
const routes = app
  .route('/api/recipes', recipes)
  .route('/api/categories', categories)
  .route('/api/analysis-items', analysisItems)
  .route('/api/enrichments', enrichments)
  .route('/api/posts', posts)
  .route('/api/stats', stats)
  .route('/api/ai-usage', aiUsage)
  .route('/api/connections', connections)
  .route('/api/sync-jobs', syncJobs)

// Export the app's type so the Trove frontend can later use Hono's typed
// client:  const client = hc<AppType>(API_URL)  → fully typed requests.
export type AppType = typeof routes

export default app
