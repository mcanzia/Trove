/**
 * Handles the MAL OAuth 2.0 callback.
 * MAL redirects here after the user grants permission.
 * We exchange the code for tokens via the mal-proxy Edge Function,
 * store them, then redirect back to the Anime & Manga category page.
 */

import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { popVerifier, saveTokens, type MALTokens } from '@/lib/malAuth'
import { toSlug } from '@/lib/utils'

type Status = 'exchanging' | 'success' | 'error'

export default function MalCallback() {
  const [searchParams]    = useSearchParams()
  const navigate          = useNavigate()
  const [status, setStatus] = useState<Status>('exchanging')
  const [errorMsg, setErrorMsg] = useState('')
  const hasRun = useRef(false)

  useEffect(() => {
    // StrictMode runs effects twice in dev — guard so we only exchange once
    if (hasRun.current) return
    hasRun.current = true

    const code  = searchParams.get('code')
    const state = searchParams.get('state')

    if (!code) {
      setErrorMsg('No authorisation code returned from MyAnimeList.')
      setStatus('error')
      return
    }

    const stored = popVerifier()
    if (!stored || stored.state !== state) {
      setErrorMsg('OAuth state mismatch — possible CSRF. Please try again.')
      setStatus('error')
      return
    }

    const redirectUri = import.meta.env.VITE_MAL_REDIRECT_URI as string

    supabase.functions
      .invoke('mal-proxy', {
        body: {
          action:       'exchange',
          code,
          codeVerifier: stored.verifier,
          redirectUri,
        },
      })
      .then(({ data, error }) => {
        if (error || data?.error) {
          setErrorMsg(error?.message ?? String(data?.error))
          setStatus('error')
          return
        }

        const tokens: MALTokens = {
          accessToken:  data.access_token,
          refreshToken: data.refresh_token,
          expiresAt:    Date.now() + data.expires_in * 1000,
        }
        saveTokens(tokens)
        setStatus('success')

        // Redirect to the Anime & Manga category page
        setTimeout(() => {
          navigate(`/category/${toSlug('Anime & Manga')}`, { replace: true })
        }, 800)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-3 max-w-sm mx-auto px-6">
        {status === 'exchanging' && (
          <>
            <svg className="animate-spin h-8 w-8 text-violet-500 mx-auto" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <p className="text-sm text-muted-foreground">Connecting to MyAnimeList…</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="text-3xl">✅</div>
            <p className="text-sm font-medium text-foreground">Connected to MyAnimeList!</p>
            <p className="text-xs text-muted-foreground">Redirecting you back…</p>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="text-3xl">❌</div>
            <p className="text-sm font-medium text-foreground">Connection failed</p>
            <p className="text-xs text-muted-foreground">{errorMsg}</p>
            <button
              onClick={() => navigate(`/category/${toSlug('Anime & Manga')}`, { replace: true })}
              className="text-xs text-primary hover:underline"
            >
              ← Back to Anime & Manga
            </button>
          </>
        )}
      </div>
    </div>
  )
}
