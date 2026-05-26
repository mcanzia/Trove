/**
 * MAL OAuth 2.0 + PKCE helpers and token storage.
 * Tokens live in localStorage; the PKCE verifier lives in sessionStorage
 * only for the duration of the redirect round-trip.
 */

// ── Storage keys ──────────────────────────────────────────────────────────────

const VERIFIER_KEY  = 'mal_pkce_verifier'
const STATE_KEY     = 'mal_oauth_state'
const ACCESS_KEY    = 'mal_access_token'
const REFRESH_KEY   = 'mal_refresh_token'
const EXPIRES_KEY   = 'mal_token_expires_at'

// ── PKCE ──────────────────────────────────────────────────────────────────────

function base64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

export async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
  // MAL uses plain PKCE — the challenge is the verifier itself (S256 is not supported)
  const bytes    = crypto.getRandomValues(new Uint8Array(64))
  const verifier = base64url(bytes)
  return { verifier, challenge: verifier }
}

export function saveVerifier(verifier: string, state: string) {
  sessionStorage.setItem(VERIFIER_KEY, verifier)
  sessionStorage.setItem(STATE_KEY,    state)
}

export function popVerifier(): { verifier: string; state: string } | null {
  const verifier = sessionStorage.getItem(VERIFIER_KEY)
  const state    = sessionStorage.getItem(STATE_KEY)
  sessionStorage.removeItem(VERIFIER_KEY)
  sessionStorage.removeItem(STATE_KEY)
  if (!verifier || !state) return null
  return { verifier, state }
}

// ── Auth URL ──────────────────────────────────────────────────────────────────

export function buildAuthUrl(
  clientId:    string,
  redirectUri: string,
  challenge:   string,
  state:       string,
): string {
  const params = new URLSearchParams({
    response_type:         'code',
    client_id:             clientId,
    redirect_uri:          redirectUri,
    state,
    code_challenge:        challenge,
    code_challenge_method: 'plain',
  })
  return `https://myanimelist.net/v1/oauth2/authorize?${params.toString()}`
}

// ── Token storage ─────────────────────────────────────────────────────────────

export interface MALTokens {
  accessToken:  string
  refreshToken: string
  expiresAt:    number  // epoch ms
}

export function saveTokens(tokens: MALTokens): void {
  localStorage.setItem(ACCESS_KEY,  tokens.accessToken)
  localStorage.setItem(REFRESH_KEY, tokens.refreshToken)
  localStorage.setItem(EXPIRES_KEY, String(tokens.expiresAt))
}

export function loadTokens(): MALTokens | null {
  const a = localStorage.getItem(ACCESS_KEY)
  const r = localStorage.getItem(REFRESH_KEY)
  const e = localStorage.getItem(EXPIRES_KEY)
  if (!a || !r || !e) return null
  return { accessToken: a, refreshToken: r, expiresAt: Number(e) }
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
  localStorage.removeItem(EXPIRES_KEY)
}

export function isExpired(tokens: MALTokens): boolean {
  return Date.now() >= tokens.expiresAt - 60_000  // 1-minute buffer
}
