export type Platform = 'reddit' | 'instagram'

export interface Post {
  post_id: string
  platform: Platform
  url: string | null
  owner: string | null
  owner_fullname: string | null
  title: string | null
  caption: string | null
  subreddit: string | null
  media_type: string | null
  hashtags: string[]
  likes: number | null
  score: number | null
  year: string | null
  location: string | null
  transcription: string | null
  comments: unknown[]
  timestamp: string | null
  created_at: string
  updated_at: string
}

export interface OutputField {
  key: string
  label: string
}

export interface Category {
  id: number
  name: string
  extraction_goal: string | null
  output_fields: OutputField[]
  top_n: number
  trackable: boolean
  group_by: string | string[] | null
  created_at: string
}

export interface AnalysisItem {
  id: number
  category_name: string
  platform: Platform
  item_data: Record<string, unknown>
  source_post_id: string | null
  created_at: string
  posts: {
    url: string | null
    year: string | null
    timestamp: string | null
  } | null
}

export interface AnalysisMetadata {
  category_name: string
  platform: Platform
  post_count: number | null
  analyzed_at: string
}
