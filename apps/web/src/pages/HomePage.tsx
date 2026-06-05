import { Link } from 'react-router-dom'
import { useCategories } from '@/hooks/useCategories'
import { getCategoryTheme } from '@/lib/categoryConfig'
import { toSlug } from '@/lib/utils'

export default function HomePage() {
  const { data: categories, isLoading, error } = useCategories()

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-6 py-12">
        <header className="mb-10">
          <h1 className="text-4xl font-semibold tracking-tight text-foreground">Trove</h1>
          <p className="mt-2 text-muted-foreground">Your saved posts, organised and searchable.</p>
        </header>

        {isLoading && (
          <div className="text-muted-foreground">Loading categories…</div>
        )}

        {error && (
          <div className="text-destructive">Failed to load categories. Check your Supabase credentials.</div>
        )}

        {categories && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {categories.map((cat) => {
              const theme = getCategoryTheme(cat.name)
              const Icon = theme.icon
              return (
                <Link key={cat.id} to={`/category/${toSlug(cat.name)}`}>
                  <div className={`
                    group h-full flex flex-col gap-3 p-5 rounded-xl border border-border border-t-2
                    bg-card transition-all duration-150 cursor-pointer shadow-sm
                    hover:shadow-md hover:-translate-y-0.5
                    ${theme.accentClass} ${theme.cardBgClass}
                  `}>
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg shrink-0 ${theme.iconBgClass}`}>
                        <Icon size={18} className={theme.iconClass} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-foreground leading-snug">{cat.name}</p>
                        {cat.extraction_goal && (
                          <p className="mt-1 text-sm text-muted-foreground line-clamp-2 leading-snug">
                            {cat.extraction_goal}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
