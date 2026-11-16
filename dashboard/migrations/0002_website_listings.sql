-- The curated website directory moves out of inventory_items into its own records:
-- inventory_items is the internal truth about a property, website_listings is how one is presented.

CREATE TABLE website_listings (
  id TEXT PRIMARY KEY,
  inventory_item_id TEXT NOT NULL UNIQUE REFERENCES inventory_items (id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  project_slug TEXT,
  title TEXT NOT NULL,
  summary TEXT,
  description TEXT,
  -- Shown as written ("Starting 2.4 crore"); empty means "Call for price".
  price_text TEXT,
  show_number INTEGER NOT NULL DEFAULT 0,
  features TEXT NOT NULL DEFAULT '[]',
  published INTEGER NOT NULL DEFAULT 0,
  featured INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE INDEX ix_listings_published ON website_listings (published, sort_order);

CREATE TABLE listing_photos (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES website_listings (id) ON DELETE CASCADE,
  -- R2 key prefix; the full and thumbnail files are `${key}-1600.webp` and `${key}-600.webp`.
  storage_key TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  alt TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX ix_listing_photos ON listing_photos (listing_id, sort_order);

-- Carry existing website settings over as listings.
INSERT INTO website_listings (id, inventory_item_id, slug, project_slug, title, summary, price_text, show_number, published, featured, sort_order, published_at, created_at, updated_at)
SELECT
  lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))),
  id,
  -- Unique and readable enough; editable afterwards.
  trim(replace(replace(replace(lower(COALESCE(project_slug || '-', '') || size || '-' || replace(type, '_', '-') || '-' || substr(id, 1, 6)), ' ', '-'), '.', ''), '/', '-'), '-'),
  project_slug,
  COALESCE(public_title, size || ' ' || replace(type, '_', ' ')),
  public_details,
  CASE WHEN show_price = 1 THEN asking_price END,
  show_number,
  published,
  featured,
  website_order,
  CASE WHEN published = 1 THEN COALESCE(updated_at, created_at) END,
  created_at,
  updated_at
FROM inventory_items
WHERE published = 1 OR public_title IS NOT NULL OR public_details IS NOT NULL;

DROP INDEX ix_inventory_published;
ALTER TABLE inventory_items DROP COLUMN project_slug;
ALTER TABLE inventory_items DROP COLUMN published;
ALTER TABLE inventory_items DROP COLUMN featured;
ALTER TABLE inventory_items DROP COLUMN show_price;
ALTER TABLE inventory_items DROP COLUMN show_number;
ALTER TABLE inventory_items DROP COLUMN public_title;
ALTER TABLE inventory_items DROP COLUMN public_details;
ALTER TABLE inventory_items DROP COLUMN website_order;
