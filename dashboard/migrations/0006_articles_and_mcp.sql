-- Articles written in the dashboard and published to bestbuilderdeveloper.com/articles/<slug>/.
CREATE TABLE articles (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  -- Shown on article cards and used as the meta description when seo_description is empty.
  excerpt TEXT,
  -- Sanitised HTML from the editor (worker/articles/sanitize.ts); the landing build renders it as-is.
  body_html TEXT NOT NULL DEFAULT '',
  -- R2 key prefix in bbd-media, like property_photos.storage_key: `${key}-1600.webp` and `${key}-600.webp`.
  cover_key TEXT,
  cover_width INTEGER,
  cover_height INTEGER,
  cover_alt TEXT,
  seo_title TEXT,
  seo_description TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  -- Links the article to a project page on the site (WEBSITE_PROJECTS); optional.
  project_slug TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  featured INTEGER NOT NULL DEFAULT 0,
  -- Byline; empty means the article is credited to Best Builders & Developers.
  author_name TEXT,
  created_by_user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE INDEX ix_articles_status ON articles (status, published_at DESC);

-- The users the MCP server's read-only SQL may see: no password hashes. Raw `users` is blocked there (worker/mcp/sql.ts).
CREATE VIEW team_members AS SELECT id, username, role, is_active, created_at, updated_at FROM users;
