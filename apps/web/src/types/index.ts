/**
 * Re-export the shared domain types so existing `@/types` imports keep working.
 * Source of truth lives in packages/shared (@trove/shared).
 */
export type {
  Platform,
  Post,
  OutputField,
  Category,
  PostRef,
  AnalysisItem,
  AnalysisMetadata,
  RecipeCard,
  RecipeCardData,
  RecipeResponse,
} from '@trove/shared'
