/**
 * Re-export the shared domain types. Source of truth: packages/shared.
 * Kept as a local barrel so route files can import from '../types.js'.
 */
export type {
  Platform,
  PostRef,
  Category,
  OutputField,
  AnalysisItem,
  RecipeCard,
  RecipeResponse,
} from '@trove/shared'
