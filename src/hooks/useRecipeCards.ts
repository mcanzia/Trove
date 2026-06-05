/**
 * Recipe-card enrichment for Food & Cooking.
 *
 * Reads from `recipe_cards`, populated by the Python enrichment scripts
 * (db/scrape_external_recipes.py + db/enrich_recipe_cards.py). Keyed by
 * source_post_id (the original post ID) so cards survive Food re-analysis —
 * analysis_item IDs churn, the source post never does. No auth required.
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RecipeCardData {
  ingredients:  string[]
  steps:        string[]
  prepTime:     string | null
  cookTime:     string | null
  totalTime:    string | null
  servings:     string | null
  notes:        string | null
  sourceExcerpt: string | null
  enrichedBy:   string | null
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/** Returns a Map<sourcePostId, RecipeCardData> for all stored recipe cards. */
export function useRecipeCards() {
  return useQuery({
    queryKey: ['recipe-cards'],
    queryFn: async (): Promise<Map<string, RecipeCardData>> => {
      const { data, error } = await supabase
        .from('recipe_cards')
        .select('source_post_id, ingredients, steps, prep_time, cook_time, total_time, servings, notes, source_excerpt, enriched_by')
      if (error) throw error
      return new Map((data ?? []).map((r) => [
        r.source_post_id as string,
        {
          ingredients:   (r.ingredients as string[] | null) ?? [],
          steps:         (r.steps       as string[] | null) ?? [],
          prepTime:      r.prep_time    as string | null,
          cookTime:      r.cook_time    as string | null,
          totalTime:     r.total_time   as string | null,
          servings:      r.servings     as string | null,
          notes:         r.notes        as string | null,
          sourceExcerpt: r.source_excerpt as string | null,
          enrichedBy:    r.enriched_by  as string | null,
        },
      ]))
    },
    staleTime: 1000 * 60 * 10,
  })
}
