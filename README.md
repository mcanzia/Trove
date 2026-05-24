# Trove

A personal dashboard for exploring and discovering content from your saved Reddit and Instagram posts — organized by category, searchable, and sortable by when things were added or originally posted.

Data is sourced from the [SavedPosts](../SavedPosts) analysis pipeline, which runs daily and stores results in Supabase.

---

## What it does

The SavedPosts pipeline classifies and analyzes your saved social media content into thematic categories (Recipes, Travel, Books, Anime, etc.) and extracts structured recommendations from them. Trove is the front-end that makes that data browsable and useful day-to-day.

**Key features (planned):**
- Browse all categories with item counts and last-analyzed dates
- Filter and search within categories
- Sort by date added or original post date
- Mark items as Watched / Read on trackable categories (Anime, Books, Movies, TV)
- View source links back to the original Reddit or Instagram post
- Platform filter (Reddit / Instagram / both)

---

## Data source

Reads directly from Supabase. Tables used:

| Table | Contents |
|-------|----------|
| `posts` | Raw Reddit and Instagram posts with metadata and transcriptions |
| `categories` | Category definitions with display config (`trackable`, `group_by`) |
| `post_categories` | Post ↔ category assignments |
| `analysis_items` | Extracted recommendations/highlights per category |
| `analysis_metadata` | Per-category analysis timestamps and post counts |

---

## Tech stack

TBD

---

## Local setup

TBD

---

## Related

- [SavedPosts](../SavedPosts) — the data pipeline that feeds this app
