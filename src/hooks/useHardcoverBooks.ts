/**
 * Fetches the current user's Hardcover library via the hardcover-proxy
 * Edge Function and exposes helpers for updating ratings.
 *
 * Books are keyed by normalised title so CategoryPage can look them up
 * against analysis items without needing ISBNs.
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
    update_user_book(
      where: { id: { _eq: $userBookId } }
      _set: { rating: $rating }
    ) {
      returning { id rating }
    }
  }
`

const UPDATE_STATUS = `
  mutation UpdateStatus($userBookId: Int!, $statusId: Int!) {
    update_user_book(
      where: { id: { _eq: $userBookId } }
      _set: { status_id: $statusId }
    ) {
      returning { id status_id }
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
  query SearchBook($query: String!) {
    search(query: $query, query_type: "Book", per_page: 1) {
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

export function useHardcoverBooks() {
  return useQuery({
    queryKey: ['hardcover-books'],
    queryFn: async (): Promise<Map<string, HardcoverBook>> => {
      const resp = await hardcover<GqlResponse>(GET_MY_BOOKS)
      const map = new Map<string, HardcoverBook>()
      for (const ub of resp.data.me[0].user_books) {
        const book: HardcoverBook = {
          userBookId: ub.id,
          bookId:     ub.book.id,
          title:      ub.book.title,
          author:     ub.book.contributions[0]?.author?.name ?? '',
          statusId:   ub.status_id,
          rating:     ub.rating,
        }
        map.set(normaliseTitle(ub.book.title), book)
      }
      return map
    },
    staleTime: 1000 * 60 * 5,
    retry: false, // don't retry if token is missing
  })
}

export function useUpdateHardcoverRating() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userBookId, rating }: { userBookId: number; rating: number | null }) =>
      hardcover(UPDATE_RATING, { userBookId, rating }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hardcover-books'] }),
  })
}

export function useUpdateHardcoverStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userBookId, statusId }: { userBookId: number; statusId: number }) =>
      hardcover(UPDATE_STATUS, { userBookId, statusId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hardcover-books'] }),
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
        hits: Array<{ document: { id: number; title: string } }>
      }
    }
  }
}

/** Search Hardcover for a book by title, then add it to the user's library. */
export function useAddBookByTitle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ title, statusId }: { title: string; statusId: number }) => {
      const search = await hardcover<SearchBookResponse>(SEARCH_BOOK, { query: title })
      // results comes back as a JSON scalar — parse it if it's a string
      const raw = search.data.search.results
      const results = typeof raw === 'string' ? JSON.parse(raw) : raw
      const found = results?.hits?.[0]?.document
      if (!found) throw new Error(`"${title}" not found on Hardcover`)
      return hardcover(ADD_BOOK, { bookId: found.id, statusId })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hardcover-books'] }),
  })
}
