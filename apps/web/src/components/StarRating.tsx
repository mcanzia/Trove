import { useState } from 'react'
import { Star } from 'lucide-react'

interface StarRatingProps {
  value:    number | null   // current rating (1–5) or null
  onChange: (rating: number | null) => void
  readonly?: boolean
  size?:     number
}

export function StarRating({ value, onChange, readonly = false, size = 14 }: StarRatingProps) {
  const [hovered, setHovered] = useState<number | null>(null)

  const displayed = hovered ?? value ?? 0

  return (
    <div
      className="flex items-center gap-0.5"
      onMouseLeave={() => !readonly && setHovered(null)}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readonly}
          onClick={() => {
            if (readonly) return
            // clicking the current rating clears it
            onChange(star === value ? null : star)
          }}
          onMouseEnter={() => !readonly && setHovered(star)}
          className={`transition-colors ${readonly ? 'cursor-default' : 'cursor-pointer hover:scale-110'}`}
          aria-label={`Rate ${star} star${star !== 1 ? 's' : ''}`}
        >
          <Star
            size={size}
            className={
              star <= displayed
                ? 'fill-gold text-gold'
                : 'fill-transparent text-muted-foreground/40'
            }
          />
        </button>
      ))}
    </div>
  )
}
