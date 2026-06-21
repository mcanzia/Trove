import type { Category } from '@/types'

export const CATEGORY_GROUPS: { label: string; categories: string[] }[] = [
  { label: 'Watch & Play', categories: ['Anime & Manga','Board Games','D&D Character Builds','Magic: The Gathering','Movies & Film Recommendations','Music Recommendations','TV Series Recommendations','Video Game Recommendations','Viral Videos & Entertainment','YouTube & Streaming Channels'] },
  { label: 'Read & Learn', categories: ['Books Worth Reading','ChatGPT & AI Tools','Interesting Facts & Science','Language & Learning','News & Current Events','Pixel Art & Animation','Web Development & Programming'] },
  { label: 'Food & Home', categories: ['Food & Cooking','Food Science & Nutrition','Home & Kitchen Products','DIY & Crafts','Plants & Gardening'] },
  { label: 'Health & Wellness', categories: ["Crohn's Disease & IBD Support",'Fitness & Weight Gain','Self-Improvement & Wellness','Skincare & Acne Treatment','Fashion & Beauty','Pets & Animal Care','Life Hacks & Productivity'] },
  { label: 'Work & Tech', categories: ['Career & Job Search','Investing & Finance','Salesforce Tips & Career','Tech & Gadgets'] },
  { label: 'Life & Leisure', categories: ['Travel & Destinations','Sports Highlights & Memorable Moments','Tottenham Hotspur Fandom','Memes & Humor','Weird & WTF Content'] },
]

export interface CategoryGroup {
  label: string
  categories: Category[]
}

/**
 * Group the given categories per CATEGORY_GROUPS, in order, with resolved
 * Category objects. Any category whose name isn't listed in a group lands in a
 * trailing `More` group (future-proof — never drop a category). Empty groups
 * are omitted.
 */
export function groupCategories(categories: Category[]): CategoryGroup[] {
  const byName = new Map(categories.map((c) => [c.name, c]))
  const seen = new Set<string>()

  const groups: CategoryGroup[] = CATEGORY_GROUPS.map((group) => {
    const resolved: Category[] = []
    for (const name of group.categories) {
      const cat = byName.get(name)
      if (cat) {
        resolved.push(cat)
        seen.add(name)
      }
    }
    return { label: group.label, categories: resolved }
  }).filter((g) => g.categories.length > 0)

  const leftover = categories.filter((c) => !seen.has(c.name))
  if (leftover.length > 0) {
    groups.push({ label: 'More', categories: leftover })
  }

  return groups
}
