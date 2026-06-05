import { useParams, Link } from 'react-router-dom'
import { ChefHat, Clock, Users, UtensilsCrossed, ListChecks } from 'lucide-react'
import { useRecipe } from '@/hooks/useRecipe'

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
    <div className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-1.5">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-xs font-medium text-foreground">{value}</span>
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

  const backHref = slug ? `/category/${slug}` : '/'

  const data = item?.item_data ?? {}
  const recipeName  = String(data.recipe_name ?? data.dish_name ?? data.title ?? 'Recipe')
  const cuisine     = String(data.cuisine ?? '')
  const difficulty  = String(data.difficulty ?? '')
  const specialNotes = String(data.special_notes ?? '')
  const sourceUrl   = item?.posts?.url ?? null
  const platform    = item?.platform ?? null

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-12">

        {/* Back link */}
        <Link to={backHref} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Food &amp; Cooking
        </Link>

        {isLoading && <div className="mt-8 text-muted-foreground">Loading…</div>}
        {error && <div className="mt-8 text-destructive">Failed to load recipe.</div>}

        {item && (
          <article className="mt-4">
            {/* Header */}
            <div className="flex items-start gap-3">
              <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-100 dark:bg-orange-900/30">
                <UtensilsCrossed className="text-orange-500" size={20} />
              </div>
              <div className="min-w-0">
                <h1 className="text-3xl font-semibold tracking-tight text-foreground">{recipeName}</h1>
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
                {card.prepTime  && <Chip icon={<Clock size={13} />}    label="Prep"  value={card.prepTime} />}
                {card.cookTime  && <Chip icon={<ChefHat size={13} />}  label="Cook"  value={card.cookTime} />}
                {card.totalTime && <Chip icon={<Clock size={13} />}    label="Total" value={card.totalTime} />}
                {card.servings  && <Chip icon={<Users size={13} />}    label="Serves" value={card.servings} />}
              </div>
            )}

            {/* Notes / benefits from the summary extraction */}
            {specialNotes && (
              <p className="mt-5 text-sm text-muted-foreground leading-relaxed">{specialNotes}</p>
            )}

            {card && (card.ingredients.length > 0 || card.steps.length > 0) ? (
              <div className="mt-8 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-8">
                {/* Ingredients */}
                <section>
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <UtensilsCrossed size={15} className="text-muted-foreground" /> Ingredients
                  </h2>
                  <ul className="mt-3 space-y-2">
                    {card.ingredients.map((ing, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400" />
                        <span>{ing}</span>
                      </li>
                    ))}
                  </ul>
                </section>

                {/* Steps */}
                <section>
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <ListChecks size={15} className="text-muted-foreground" /> Steps
                  </h2>
                  <ol className="mt-3 space-y-3">
                    {card.steps.map((step, i) => (
                      <li key={i} className="flex gap-3 text-sm text-foreground">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/30 text-[11px] font-semibold text-orange-600 dark:text-orange-400 tabular-nums">
                          {i + 1}
                        </span>
                        <span className="leading-relaxed">{step}</span>
                      </li>
                    ))}
                  </ol>
                </section>
              </div>
            ) : (
              /* Fallback: no structured recipe available */
              <div className="mt-8 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-center">
                <p className="text-sm text-muted-foreground">
                  A full structured recipe isn’t available for this entry yet.
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
              <div className="mt-8 rounded-lg border border-border bg-muted/30 px-4 py-3">
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
                  className="text-sm text-primary hover:underline"
                >
                  View original {platform === 'reddit' ? 'Reddit post' : 'Instagram post'} →
                </a>
              </div>
            )}
          </article>
        )}
      </div>
    </div>
  )
}
