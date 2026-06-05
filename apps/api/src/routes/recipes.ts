import { Hono } from 'hono'
import { supabase } from '../lib/supabase.js'
import type { AnalysisItem, RecipeCard, RecipeResponse } from '../types.js'

const FOOD_CATEGORY = 'Food & Cooking'

const RECIPE_CARD_COLUMNS =
  'source_post_id, ingredients, steps, prep_time, cook_time, total_time, servings, notes, source_excerpt, enriched_by'

const POST_COLUMNS = 'url, year, timestamp, caption, owner, owner_fullname, platform'

/** Normalize a raw recipe_cards row into the camel-cased RecipeCard shape. */
function toRecipeCard(row: Record<string, unknown>): RecipeCard {
  return {
    ingredients: (row.ingredients as string[] | null) ?? [],
    steps: (row.steps as string[] | null) ?? [],
    prepTime: (row.prep_time as string | null) ?? null,
    cookTime: (row.cook_time as string | null) ?? null,
    totalTime: (row.total_time as string | null) ?? null,
    servings: (row.servings as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    sourceExcerpt: (row.source_excerpt as string | null) ?? null,
    enrichedBy: (row.enriched_by as string | null) ?? null,
  }
}

/**
 * Recipe routes.
 *
 * GET /:postId — the Food & Cooking analysis_item for a given source post,
 * together with its structured recipe card (if one has been enriched).
 *
 * Migrated out of Trove/src/pages/RecipePage.tsx (useFoodItemByPost +
 * useRecipeCards lookup), which previously ran two supabase-js queries from
 * the browser. Addressed by source_post_id, which is stable across re-analysis.
 */
export const recipes = new Hono().get('/:postId', async (c) => {
  const postId = c.req.param('postId')
  if (!postId) {
    return c.json({ error: 'postId is required' }, 400)
  }

  // 1) The Food & Cooking item that belongs to this post.
  const { data: itemRow, error: itemError } = await supabase
    .from('analysis_items')
    .select(`*, posts(${POST_COLUMNS})`)
    .eq('category_name', FOOD_CATEGORY)
    .eq('source_post_id', postId)
    .limit(1)
    .maybeSingle()

  if (itemError) {
    return c.json({ error: itemError.message }, 500)
  }
  if (!itemRow) {
    return c.json({ error: 'Recipe not found' }, 404)
  }

  const raw = itemRow as Record<string, unknown>
  const item: AnalysisItem = {
    ...(raw as unknown as AnalysisItem),
    item_data:
      typeof raw.item_data === 'string'
        ? (JSON.parse(raw.item_data) as Record<string, unknown>)
        : (raw.item_data as Record<string, unknown>),
  }

  // 2) Its structured recipe card, if enriched.
  const { data: cardRow, error: cardError } = await supabase
    .from('recipe_cards')
    .select(RECIPE_CARD_COLUMNS)
    .eq('source_post_id', postId)
    .maybeSingle()

  if (cardError) {
    return c.json({ error: cardError.message }, 500)
  }

  const body: RecipeResponse = {
    item,
    card: cardRow ? toRecipeCard(cardRow as Record<string, unknown>) : null,
  }

  return c.json(body)
})
