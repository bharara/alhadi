-- Ids are UUID strings (kept from propCRM so its data can be imported as-is).
-- Timestamps are ISO 8601 UTC strings ("2026-11-16T10:00:00.000Z"), so text order is time order.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE user_invites (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  invite_url TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE INDEX ix_user_invites_email ON user_invites (email);

CREATE TABLE login_failures (
  username TEXT NOT NULL,
  attempted_at TEXT NOT NULL
);
CREATE INDEX ix_login_failures ON login_failures (username, attempted_at);

CREATE TABLE prospects (
  id TEXT PRIMARY KEY,
  assigned_user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  phone TEXT NOT NULL UNIQUE,
  email TEXT,
  name TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  title TEXT,
  company TEXT,
  notes TEXT,
  extra TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'cold' CHECK (status IN ('cold', 'warm', 'interested', 'do_not_contact')),
  next_touch_at TEXT,
  -- Latest touch, kept in step with prospect_touches so lists and searches don't scan every touch.
  last_touched_at TEXT,
  last_touch_kind TEXT,
  last_touch_summary TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE INDEX ix_prospects_assigned ON prospects (assigned_user_id, next_touch_at);
CREATE INDEX ix_prospects_created ON prospects (created_at);
CREATE INDEX ix_prospects_email ON prospects (email);
CREATE INDEX ix_prospects_last_touched ON prospects (last_touched_at);

CREATE TABLE prospect_touches (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL REFERENCES prospects (id) ON DELETE CASCADE,
  touching_user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('email', 'call', 'visit', 'whatsapp')),
  occurred_at TEXT NOT NULL,
  summary TEXT,
  call_status TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE INDEX ix_touches_prospect ON prospect_touches (prospect_id, occurred_at);
CREATE INDEX ix_touches_occurred ON prospect_touches (occurred_at);

CREATE TABLE inventory_items (
  id TEXT PRIMARY KEY,
  house_number TEXT NOT NULL,
  block TEXT,
  town TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('commercial_plot', 'residential_plot', 'house', 'apartment')),
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'sold')),
  size TEXT NOT NULL,
  details TEXT,
  asking_price TEXT,
  contact_phone_number TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_kind TEXT NOT NULL DEFAULT 'direct' CHECK (contact_kind IN ('direct', 'indirect')),
  entered_by_user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- Website: what the public site shows of this item.
  project_slug TEXT,
  published INTEGER NOT NULL DEFAULT 0,
  featured INTEGER NOT NULL DEFAULT 0,
  show_price INTEGER NOT NULL DEFAULT 0,
  show_number INTEGER NOT NULL DEFAULT 0,
  public_title TEXT,
  public_details TEXT,
  website_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE INDEX ix_inventory_town ON inventory_items (town);
CREATE INDEX ix_inventory_updated ON inventory_items (updated_at);
CREATE INDEX ix_inventory_published ON inventory_items (published, website_order);

CREATE TABLE site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Search Console: site totals per day, and page + query rows per day.
CREATE TABLE gsc_daily (
  date TEXT PRIMARY KEY,
  clicks INTEGER NOT NULL,
  impressions INTEGER NOT NULL,
  position REAL NOT NULL
);

CREATE TABLE gsc_rows (
  date TEXT NOT NULL,
  page TEXT NOT NULL,
  query TEXT NOT NULL,
  clicks INTEGER NOT NULL,
  impressions INTEGER NOT NULL,
  position REAL NOT NULL,
  PRIMARY KEY (date, page, query)
) WITHOUT ROWID;
