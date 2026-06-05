import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { env } from './lib/env.js'
import { recipes } from './routes/recipes.js'

export const app = new Hono()

app.use('*', logger())
app.use(
  '/api/*',
  cors({
    origin: env.CORS_ORIGINS,
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  }),
)

// Health check (handy for uptime probes / deploy smoke tests).
app.get('/health', (c) => c.json({ ok: true, service: 'trove-backend' }))

// Mounting routes on a const chain keeps the inferred type intact for Hono RPC.
const routes = app.route('/api/recipes', recipes)

// Export the app's type so the Trove frontend can later use Hono's typed
// client:  const client = hc<AppType>(API_URL)  → fully typed requests.
export type AppType = typeof routes

export default app
