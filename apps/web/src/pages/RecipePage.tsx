import { useState } from 'react'
import { ChefHat, Clock, Users, UtensilsCrossed, ListChecks, ExternalLink, Check } from 'lucide-react'
import { useRecipe } from '@/hooks/useRecipe'
import { useParams } from 'react-router-dom'
import { Skeleton } from '@/components/ui/skeleton'

// ── helpers ─────────────────────────────────────────────────────────────────────

function difficultyClasses(difficulty: string): string {
  const d = difficulty.toLowerCase()
  if (d.includes('easy')) return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
  if (d.includes('hard') || d.includes('advanced')) return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
  if (d.includes('mod') || d.includes('medium') || d.includes('intermediate')) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
  return 'bg-muted text-muted-foreground'
}

function Chip({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1.5">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-[11px] font-medium text-foreground">{value}</span>
    </div>
  )
}

function RecipePageSkeleton() {
  return (
    <div className="animate-in fade-in duration-200">
      {/* Header skeleton */}
      <div className="flex items-start gap-3">
        <Skeleton className="mt-1 h-10 w-10 shrink-0 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-9 w-2/3" />
          <div className="flex gap-2">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        </div>
      </div>
      {/* Chips skeleton */}
      <div className="mt-5 flex gap-2">
        <Skeleton className="h-8 w-24 rounded-full" />
        <Skeleton className="h-8 w-24 rounded-full" />
        <Skeleton className="h-8 w-24 rounded-full" />
      </div>
      {/* Two-panel skeleton */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-8">
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <Skeleton className="h-4 w-24" />
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
        <div className="space-y-4">
          <Skeleton className="h-4 w-16" />
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-6 w-6 shrink-0 rounded-full" />
              <Skeleton className="h-4 flex-1 mt-1" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── page ─────────────────────────────────────────────────────────────────────────

export default function RecipePage() {
  const { slug, postId } = useParams<{ slug: string; postId: string }>()
  const sourcePostId = postId ? decodeURIComponent(postId) : null

  const { data: recipe, isLoading, error } = useRecipe(sourcePostId)
  const item = recipe?.item ?? null
  const card = recipe?.card ?? undefined

  const [checkedIngredients, setCheckedIngredients] = useState<Set<number>>(new Set())

  const toggleIngredient = (i: number) => {
    setCheckedIngredients((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  // slug is used for the topbar breadcrumb — the back link is handled by the AppShell topbar
  void slug

  const data = item?.item_data ?? {}
  const recipeName   = String(data.recipe_name ?? data.dish_name ?? data.title ?? 'Recipe')
  const cuisine      = String(data.cuisine ?? '')
  const difficulty   = String(data.difficulty ?? '')
  const specialNotes = String(data.special_notes ?? '')
  const sourceUrl    = item?.posts?.url ?? null
  const platform     = item?.platform ?? null

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">

      {isLoading && <RecipePageSkeleton />}
      {error && <div className="mt-8 text-destructive text-sm">Failed to load recipe.</div>}

      {item && (
        <article className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          {/* Header */}
          <div className="flex items-start gap-3">
            <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-100 dark:bg-orange-900/30">
              <UtensilsCrossed className="text-orange-500" size={20} />
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight text-foreground">
                {recipeName}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {cuisine && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                    {cuisine}
                  </span>
                )}
                {difficulty && (
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${difficultyClasses(difficulty)}`}>
                    {difficulty}
                  </span>
                )}
                {platform && (
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                    platform === 'reddit'
                      ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                      : 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400'
                  }`}>
                    {platform}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Time / servings chips */}
          {card && (card.prepTime || card.cookTime || card.totalTime || card.servings) && (
            <div className="mt-5 flex flex-wrap gap-2">
              {card.prepTime  && <Chip icon={<Clock size={13} />}    label="Prep"   value={card.prepTime} />}
              {card.cookTime  && <Chip icon={<ChefHat size={13} />}  label="Cook"   value={card.cookTime} />}
              {card.totalTime && <Chip icon={<Clock size={13} />}    label="Total"  value={card.totalTime} />}
              {card.servings  && <Chip icon={<Users size={13} />}    label="Serves" value={card.servings} />}
            </div>
          )}

          {/* Notes / benefits from the summary extraction */}
          {specialNotes && (
            <p className="mt-5 text-sm text-muted-foreground leading-relaxed">{specialNotes}</p>
          )}

          {card && (card.ingredients.length > 0 || card.steps.length > 0) ? (
            <div className="mt-8 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-8">
              {/* Ingredients — sticky panel */}
              <section className="rounded-xl border bg-card p-5 md:sticky md:top-20 self-start">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <UtensilsCrossed size={15} className="text-muted-foreground" /> Ingredients
                </h2>
                <ul className="mt-3 space-y-2">
                  {card.ingredients.map((ing, i) => {
                    const checked = checkedIngredients.has(i)
                    return (
                      <li key={i}>
                        <label
                          className="flex items-start gap-2.5 cursor-pointer select-none"
                          onClick={() => toggleIngredient(i)}
                        >
                          {/* Custom checkbox */}
                          <span
                            className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-colors ${
                              checked
                                ? 'bg-gold border-gold'
                                : 'border-border bg-transparent'
                            }`}
                            role="checkbox"
                            aria-checked={checked}
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === ' ' || e.key === 'Enter') {
                                e.preventDefault()
                                toggleIngredient(i)
                              }
                            }}
                          >
                            {checked && <Check size={12} className="text-white" strokeWidth={3} />}
                          </span>
                          <span
                            className={`text-sm transition-colors ${
                              checked ? 'line-through text-muted-foreground' : 'text-foreground'
                            }`}
                          >
                            {ing}
                          </span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </section>

              {/* Steps */}
              <section>
                <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <ListChecks size={15} className="text-muted-foreground" /> Steps
                </h2>
                <ol className="mt-3 space-y-4">
                  {card.steps.map((step, i) => (
                    <li key={i} className="flex gap-3 text-sm text-foreground">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gold-soft text-gold font-semibold tabular-nums text-[11px]">
                        {i + 1}
                      </span>
                      <span className="leading-relaxed pt-0.5">{step}</span>
                    </li>
                  ))}
                </ol>
              </section>
            </div>
          ) : (
            /* Fallback: no structured recipe available */
            <div className="mt-8 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-center">
              <p className="text-sm text-muted-foreground">
                A full structured recipe isn't available for this entry yet.
              </p>
              {sourceUrl && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Check the original post for details.
                </p>
              )}
            </div>
          )}

          {/* Card notes (tips / substitutions) */}
          {card?.notes && (
            <div className="mt-8 rounded-xl border-l-2 border-l-gold bg-gold-soft/50 px-4 py-3">
              <p className="text-xs font-semibold text-foreground">Notes</p>
              <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{card.notes}</p>
            </div>
          )}

          {/* Source */}
          {sourceUrl && (
            <div className="mt-8 border-t border-border pt-4">
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
              >
                View original {platform === 'reddit' ? 'Reddit post' : 'Instagram post'}
                <ExternalLink size={13} />
              </a>
            </div>
          )}
        </article>
      )}
    </div>
  )
}
