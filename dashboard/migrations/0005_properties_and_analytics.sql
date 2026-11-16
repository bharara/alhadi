-- A property and its website presence are one record; web_* columns are what the public site shows.
ALTER TABLE inventory_items ADD COLUMN project_slug TEXT;
ALTER TABLE inventory_items ADD COLUMN slug TEXT;
ALTER TABLE inventory_items ADD COLUMN web_title TEXT;
ALTER TABLE inventory_items ADD COLUMN web_summary TEXT;
ALTER TABLE inventory_items ADD COLUMN web_description TEXT;
ALTER TABLE inventory_items ADD COLUMN web_price TEXT;
ALTER TABLE inventory_items ADD COLUMN web_features TEXT NOT NULL DEFAULT '[]';
ALTER TABLE inventory_items ADD COLUMN show_number INTEGER NOT NULL DEFAULT 0;
ALTER TABLE inventory_items ADD COLUMN published INTEGER NOT NULL DEFAULT 0;
ALTER TABLE inventory_items ADD COLUMN featured INTEGER NOT NULL DEFAULT 0;
ALTER TABLE inventory_items ADD COLUMN web_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE inventory_items ADD COLUMN published_at TEXT;

UPDATE inventory_items SET
  project_slug = l.project_slug, slug = l.slug, web_title = l.title, web_summary = l.summary, web_description = l.description,
  web_price = l.price_text, web_features = l.features, show_number = l.show_number, published = l.published,
  featured = l.featured, web_order = l.sort_order, published_at = l.published_at
FROM website_listings l WHERE l.inventory_item_id = inventory_items.id;

CREATE UNIQUE INDEX ix_inventory_slug ON inventory_items (slug) WHERE slug IS NOT NULL;
CREATE INDEX ix_inventory_published ON inventory_items (published, web_order);

CREATE TABLE property_photos (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES inventory_items (id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  alt TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX ix_property_photos ON property_photos (property_id, sort_order);

INSERT INTO property_photos (id, property_id, storage_key, width, height, alt, sort_order, created_at)
SELECT p.id, l.inventory_item_id, p.storage_key, p.width, p.height, p.alt, p.sort_order, p.created_at
FROM listing_photos p JOIN website_listings l ON l.id = p.listing_id;

DROP TABLE listing_photos;
DROP TABLE website_listings;

-- Site analytics: one row per pageview or enquiry. No cookies or IPs; `visitor` is a hash that rotates daily.
CREATE TABLE web_events (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  day TEXT NOT NULL,
  visitor TEXT NOT NULL,
  session TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('pageview', 'whatsapp', 'call', 'form')),
  path TEXT NOT NULL,
  property_slug TEXT,
  channel TEXT NOT NULL,
  source TEXT,
  campaign TEXT,
  country TEXT,
  device TEXT,
  browser TEXT
);
CREATE INDEX ix_web_events_day ON web_events (day);
