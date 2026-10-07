-- backend/src/database/migrations/043_create_sample_requests.sql
-- Sample requests: per-rep product sample orders for a show, a general
-- in-app notifications table, and the send-once reminder ledger.

-- ── Catalog ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sample_product_lines (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand       TEXT NOT NULL CHECK (brand IN ('haute_brands', 'boomin_brands')),
  name        TEXT NOT NULL,
  position    INT NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (brand, name)
);

CREATE TABLE IF NOT EXISTS sample_products (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_line_id  UUID NOT NULL REFERENCES sample_product_lines(id) ON DELETE RESTRICT,
  name             TEXT NOT NULL,
  position         INT NOT NULL DEFAULT 0,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_line_id, name)
);

CREATE TABLE IF NOT EXISTS sample_materials (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  position    INT NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Requests ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sample_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  submitted_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);

CREATE TABLE IF NOT EXISTS sample_request_items (
  request_id      UUID NOT NULL REFERENCES sample_requests(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES sample_products(id) ON DELETE RESTRICT,
  singles         INT NOT NULL DEFAULT 0 CHECK (singles >= 0),
  displays        INT NOT NULL DEFAULT 0 CHECK (displays >= 0),
  empty_displays  INT NOT NULL DEFAULT 0 CHECK (empty_displays >= 0),
  PRIMARY KEY (request_id, product_id)
);

CREATE TABLE IF NOT EXISTS sample_request_materials (
  request_id    UUID NOT NULL REFERENCES sample_requests(id) ON DELETE CASCADE,
  material_id   UUID NOT NULL REFERENCES sample_materials(id) ON DELETE RESTRICT,
  qty           INT NOT NULL DEFAULT 0 CHECK (qty >= 0),
  notes         TEXT,
  PRIMARY KEY (request_id, material_id)
);

CREATE INDEX IF NOT EXISTS sample_requests_event_idx ON sample_requests (event_id);

-- ── General in-app notifications ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  link        JSONB,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_unread_idx ON notifications (user_id, read_at);

-- ── Send-once ledger ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sample_request_reminders (
  event_id   UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id, kind)
);

-- ── Seed: Coolioh (boomin_brands) ────────────────────────────────────────
INSERT INTO sample_product_lines (brand, name, position) VALUES
  ('boomin_brands', 'Freeze Dried Candy', 1),
  ('boomin_brands', 'Peelz', 2),
  ('boomin_brands', 'Coolioh Fuego Peelz', 3),
  ('boomin_brands', 'Coolioh Fuegos', 4),
  ('boomin_brands', 'Tokyo Ice Cream', 5),
  ('haute_brands', 'Oh! Mit', 1),
  ('haute_brands', 'HyMIT', 2),
  ('haute_brands', 'Sex Strips', 3)
ON CONFLICT (brand, name) DO NOTHING;

INSERT INTO sample_products (product_line_id, name, position)
SELECT l.id, p.name, p.position
FROM (VALUES
  ('boomin_brands', 'Freeze Dried Candy', 'Rainbow Bursts', 1),
  ('boomin_brands', 'Freeze Dried Candy', 'Sour Bursts', 2),
  ('boomin_brands', 'Freeze Dried Candy', 'Fuego Bursts', 3),
  ('boomin_brands', 'Freeze Dried Candy', 'Polar Pops', 4),
  ('boomin_brands', 'Freeze Dried Candy', 'Smart Blasts', 5),
  ('boomin_brands', 'Freeze Dried Candy', 'Chic-Oh Stix', 6),
  ('boomin_brands', 'Freeze Dried Candy', 'Cosmic Caramel', 7),
  ('boomin_brands', 'Freeze Dried Candy', 'Dubai Chocolate', 8),
  ('boomin_brands', 'Freeze Dried Candy', 'Peach Pops', 9),
  ('boomin_brands', 'Freeze Dried Candy', 'Party Pack (40ct)', 10),
  ('boomin_brands', 'Freeze Dried Candy', 'Assorted Pack (5ct)', 11),
  ('boomin_brands', 'Peelz', 'Mango', 1),
  ('boomin_brands', 'Peelz', 'Grape', 2),
  ('boomin_brands', 'Peelz', 'Peach', 3),
  ('boomin_brands', 'Peelz', 'Banana', 4),
  ('boomin_brands', 'Coolioh Fuego Peelz', 'Mango Magma', 1),
  ('boomin_brands', 'Coolioh Fuego Peelz', 'Grapanero', 2),
  ('boomin_brands', 'Coolioh Fuego Peelz', 'Lava Banana', 3),
  ('boomin_brands', 'Coolioh Fuego Peelz', 'Peach Diablo', 4),
  ('boomin_brands', 'Coolioh Fuegos', 'Rushin'' Chili', 1),
  ('boomin_brands', 'Coolioh Fuegos', 'Flamin'' Pina', 2),
  ('boomin_brands', 'Coolioh Fuegos', 'Blazin'' Mango', 3),
  ('boomin_brands', 'Coolioh Fuegos', 'Gushin'' Dill Pickle', 4),
  ('boomin_brands', 'Tokyo Ice Cream', 'Tokyo Ice Cream', 1),
  ('haute_brands', 'Oh! Mit', 'Mango Peach', 1),
  ('haute_brands', 'Oh! Mit', 'Purple Haze', 2),
  ('haute_brands', 'Oh! Mit', 'Blue Razz', 3),
  ('haute_brands', 'Oh! Mit', 'Spear-mit', 4),
  ('haute_brands', 'Oh! Mit', 'Pink Rozay', 5),
  ('haute_brands', 'Oh! Mit', 'Pineapple Xpress', 6),
  ('haute_brands', 'HyMIT', 'Mango Peach', 1),
  ('haute_brands', 'HyMIT', 'Purple Haze', 2),
  ('haute_brands', 'HyMIT', 'Blue Razz', 3),
  ('haute_brands', 'HyMIT', 'Spear-mit', 4),
  ('haute_brands', 'HyMIT', 'Pink Rozay', 5),
  ('haute_brands', 'HyMIT', 'Pineapple Xpress', 6),
  ('haute_brands', 'Sex Strips', 'Fix Your Spark', 1),
  ('haute_brands', 'Sex Strips', 'Fix Him', 2),
  ('haute_brands', 'Sex Strips', 'Her Fix', 3),
  ('haute_brands', 'Sex Strips', 'Jack Rabbit (J.R.)', 4)
) AS p(brand, line_name, name, position)
JOIN sample_product_lines l ON l.brand = p.brand AND l.name = p.line_name
ON CONFLICT (product_line_id, name) DO NOTHING;

INSERT INTO sample_materials (name, position) VALUES
  ('Clip Strips', 1),
  ('T-Shirts', 2),
  ('Swag Bags', 3),
  ('Floor Displays', 4),
  ('Stickers', 5),
  ('Banner', 6)
ON CONFLICT (name) DO NOTHING;
