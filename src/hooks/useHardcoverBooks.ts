/**
 * Fetches the current user's Hardcover library via the hardcover-proxy
 * Edge Function and exposes helpers for updating ratings.
 *
 * Primary lookup uses hardcover_links (analysis_item_id → bookId) for
 * reliable ID-based matching. Title matching is a fallback only.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HardcoverBook {
  userBookId: number        // user_book.id — needed for mutations
  bookId:     number        // book.id — needed to add new entries
  title:      string
  author:     string
  statusId:   number        // 1=want-to-read 2=reading 3=read 4=dnf
  rating:     number | null // 1–5, null if unrated
}

export const HARDCOVER_STATUS: Record<number, string> = {
  1: 'Want to read',
  2: 'Reading',
  3: 'Read',
  4: 'Did not finish',
}

// ── GraphQL helpers ───────────────────────────────────────────────────────────

async function hardcover<T = unknown>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke('hardcover-proxy', {
    body: { query, variables },
  })
  if (error) throw error
  if (data?.errors?.length) throw new Error(data.errors[0].message)
  return data as T
}

const GET_MY_BOOKS = `
  query GetMyBooks {
    me {
      user_books(order_by: { book: { title: asc } }) {
        id
        status_id
        rating
        book {
          id
          title
          contributions(
            where: { contribution: { _eq: "Author" } }
            limit: 1
          ) {
            author { name }
          }
        }
      }
    }
  }
`

const UPDATE_RATING = `
  mutation UpdateRating($userBookId: Int!, $rating: numeric) {
    update_user_book(id: $userBookId, object: { rating: $rating }) {
      id
    }
  }
`

const UPDATE_STATUS = `
  mutation UpdateStatus($userBookId: Int!, $statusId: Int!) {
    update_user_book(id: $userBookId, object: { status_id: $statusId }) {
      id
    }
  }
`

const ADD_BOOK = `
  mutation AddBook($bookId: Int!, $statusId: Int!) {
    insert_user_book(object: { book_id: $bookId, status_id: $statusId }) {
      id
    }
  }
`

const SEARCH_BOOK = `
  query SearchBook($query: String!, $queryType: String!) {
    search(query: $query, query_type: $queryType, per_page: 1) {
      results
    }
  }
`

// ── Normalise title for fuzzy matching ───────────────────────────────────────

export function normaliseTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/^(the|a|an)\s+/i, '')   // strip leading articles
    .replace(/[^a-z0-9]/g, '')         // strip punctuation/spaces
}

/**
 * Look up a book given an optional stored bookId (preferred) or by title (fallback).
 * Title fallback uses substring matching to handle verbose Hardcover titles.
 */
export function findHardcoverBook(
  library: HardcoverLibrary,
  title: string,
  hardcoverBookId?: number,
): HardcoverBook | undefined {
  // 1. ID match — exact and reliable
  if (hardcoverBookId != null) {
    const byId = library.byBookId.get(hardcoverBookId)
    if (byId) return byId
  }
  // 2. Exact normalised title match
  const key = normaliseTitle(title)
  if (library.byTitle.has(key)) return library.byTitle.get(key)
  // 3. Substring fallback for mismatched verbose titles
  for (const [hcKey, book] of library.byTitle) {
    if (hcKey.includes(key) || key.includes(hcKey)) return book
  }
  return undefined
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

interface GqlResponse {
  data: {
    me: Array<{
      user_books: Array<{
        id:        number
        status_id: number
        rating:    number | null
        book: {
          id:    number
          title: string
          contributions: Array<{ author: { name: string } }>
        }
      }>
    }>
  }
}

export interface HardcoverLibrary {
  byTitle: Map<string, HardcoverBook>   // normalised title → book (fallback)
  byBookId: Map<number, HardcoverBook>  // bookId → book (primary when link exists)
}

export function useHardcoverBooks() {
  return useQuery({
    queryKey: ['hardcover-books'],
    queryFn: async (): Promise<HardcoverLibrary> => {
      const resp = await hardcover<GqlResponse>(GET_MY_BOOKS)
      const byTitle  = new Map<string, HardcoverBook>()
      const byBookId = new Map<number, HardcoverBook>()
      for (const ub of resp.data.me[0].user_books) {
        const book: HardcoverBook = {
          userBookId: ub.id,
          bookId:     ub.book.id,
          title:      ub.book.title,
          author:     ub.book.contributions[0]?.author?.name ?? '',
          statusId:   ub.status_id,
          rating:     ub.rating,
        }
        byTitle.set(normaliseTitle(ub.book.title), book)
        byBookId.set(ub.book.id, book)
      }
      return { byTitle, byBookId }
    },
    staleTime: 1000 * 60 * 5,
    retry: false, // don't retry if token is missing
  })
}

/** Patch a single book in the cached library by userBookId without a refetch. */
function patchLibrary(
  library: HardcoverLibrary,
  userBookId: number,
  patch: Partial<HardcoverBook>,
): HardcoverLibrary {
  const newByTitle  = new Map(library.byTitle)
  const newByBookId = new Map(library.byBookId)
  for (const [key, book] of newByTitle) {
    if (book.userBookId === userBookId) {
      const updated = { ...book, ...patch }
      newByTitle.set(key, updated)
      newByBookId.set(book.bookId, updated)
      break
    }
  }
  return { byTitle: newByTitle, byBookId: newByBookId }
}

export function useUpdateHardcoverRating() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userBookId, rating }: { userBookId: number; rating: number | null }) =>
      hardcover(UPDATE_RATING, { userBookId, rating }),
    onMutate: async ({ userBookId, rating }) => {
      await qc.cancelQueries({ queryKey: ['hardcover-books'] })
      const prev = qc.getQueryData<HardcoverLibrary>(['hardcover-books'])
      if (prev) qc.setQueryData(['hardcover-books'], patchLibrary(prev, userBookId, { rating }))
      return { prev }
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(['hardcover-books'], ctx.prev) },
    onSettled: () => qc.invalidateQueries({ queryKey: ['hardcover-books'] }),
  })
}

export function useUpdateHardcoverStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userBookId, statusId }: { userBookId: number; statusId: number }) =>
      hardcover(UPDATE_STATUS, { userBookId, statusId }),
    onMutate: async ({ userBookId, statusId }) => {
      await qc.cancelQueries({ queryKey: ['hardcover-books'] })
      const prev = qc.getQueryData<HardcoverLibrary>(['hardcover-books'])
      if (prev) qc.setQueryData(['hardcover-books'], patchLibrary(prev, userBookId, { statusId }))
      return { prev }
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(['hardcover-books'], ctx.prev) },
    onSettled: () => qc.invalidateQueries({ queryKey: ['hardcover-books'] }),
  })
}

export function useAddHardcoverBook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ bookId, statusId }: { bookId: number; statusId: number }) =>
      hardcover(ADD_BOOK, { bookId, statusId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hardcover-books'] }),
  })
}

interface SearchBookResponse {
  data: {
    search: {
      // results is a raw JSON scalar from the Hardcover API
      results: {
        hits: Array<{ document: { id: number; title: string; author_names?: string[] } }>
      }
    }
  }
}

export interface HardcoverSearchResult {
  bookId:     number
  title:      string
  authors:    string
  resultType: 'Book' | 'Series'
}

async function searchHardcover(query: string, queryType: 'Book' | 'Series'): Promise<HardcoverSearchResult | null> {
  const resp = await hardcover<SearchBookResponse>(SEARCH_BOOK, { query, queryType })
  const raw  = resp.data.search.results
  const results = typeof raw === 'string' ? JSON.parse(raw) : raw
  const doc = results?.hits?.[0]?.document
  if (!doc) return null
  return {
    bookId:     Number(doc.id),
    title:      doc.title,
    authors:    (doc.author_names ?? []).join(', '),
    resultType: queryType,
  }
}

/** Search Hardcover by title + optional author.
 *  Tries "Book" first; falls back to "Series" so series-named entries still match. */
export function useSearchHardcoverBook() {
  return useMutation({
    mutationFn: async ({ title, author }: { title: string; author?: string }): Promise<HardcoverSearchResult> => {
      const query = author ? `${title} ${author}` : title
      const book  = await searchHardcover(query, 'Book')
      if (book) return book
      // Fall back to series search (e.g. "Stormlight Archive", "The First Law")
      const series = await searchHardcover(title, 'Series')
      if (series) return series
      throw new Error(`No results found for "${title}"`)
    },
  })
}

/** Add a book to the user's Hardcover library by its known bookId. */
export function useAddBookByTitle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ bookId, statusId }: { bookId: number; statusId: number }) =>
      hardcover(ADD_BOOK, { bookId, statusId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hardcover-books'] }),
  })
}

// ── Hardcover links (analysis_item_id → hardcover_book_id) ───────────────────

/** Returns a Map<analysisItemId, hardcoverBookId> for all stored links. */
export function useHardcoverLinks() {
  return useQuery({
    queryKey: ['hardcover-links'],
    queryFn: async (): Promise<Map<number, number>> => {
      const { data, error } = await supabase
        .from('hardcover_links')
        .select('analysis_item_id, hardcover_book_id')
      if (error) throw error
      return new Map((data ?? []).map((r) => [r.analysis_item_id as number, r.hardcover_book_id as number]))
    },
    staleTime: 1000 * 60 * 10,
  })
}

/** Upserts an analysis_item_id → hardcover_book_id mapping. */
export function useUpsertHardcoverLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      analysisItemId,
      hardcoverBookId,
      bookTitle,
    }: {
      analysisItemId:  number
      hardcoverBookId: number
      bookTitle?:      string
    }) => {
      const { error } = await supabase
        .from('hardcover_links')
        .upsert({ analysis_item_id: analysisItemId, hardcover_book_id: hardcoverBookId, book_title: bookTitle ?? null })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hardcover-links'] }),
  })
}
