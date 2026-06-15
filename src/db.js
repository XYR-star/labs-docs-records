import pg from 'pg';

const { Pool } = pg;

export function createPool(databaseUrl) {
  return new Pool({ connectionString: databaseUrl });
}

export async function migrate(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS experiment_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      body TEXT NOT NULL DEFAULT '',
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      tags TEXT[] NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      entry_id UUID REFERENCES experiment_entries(id) ON DELETE SET NULL,
      kind TEXT NOT NULL DEFAULT 'note',
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS storage_locations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      parent_id UUID REFERENCES storage_locations(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'location',
      layout_type TEXT NOT NULL DEFAULT 'none',
      rows INTEGER NOT NULL DEFAULT 0,
      columns INTEGER NOT NULL DEFAULT 0,
      position_code TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS inventory_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      location_id UUID REFERENCES storage_locations(id) ON DELETE SET NULL,
      type TEXT NOT NULL DEFAULT 'sample',
      name TEXT NOT NULL,
      identifier TEXT NOT NULL DEFAULT '',
      slot_code TEXT NOT NULL DEFAULT '',
      quantity NUMERIC NOT NULL DEFAULT 0,
      unit TEXT NOT NULL DEFAULT '',
      stored_on DATE,
      expires_on DATE,
      status TEXT NOT NULL DEFAULT 'available',
      notes TEXT NOT NULL DEFAULT '',
      tags TEXT[] NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS entry_inventory_links (
      entry_id UUID NOT NULL REFERENCES experiment_entries(id) ON DELETE CASCADE,
      item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (entry_id, item_id)
    );

    CREATE TABLE IF NOT EXISTS inventory_movements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      item_id UUID REFERENCES inventory_items(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      from_location_id UUID REFERENCES storage_locations(id) ON DELETE SET NULL,
      to_location_id UUID REFERENCES storage_locations(id) ON DELETE SET NULL,
      from_slot_code TEXT NOT NULL DEFAULT '',
      to_slot_code TEXT NOT NULL DEFAULT '',
      quantity_before NUMERIC,
      quantity_after NUMERIC,
      note TEXT NOT NULL DEFAULT '',
      actor TEXT NOT NULL DEFAULT 'admin',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      entry_id UUID REFERENCES experiment_entries(id) ON DELETE SET NULL,
      item_id UUID REFERENCES inventory_items(id) ON DELETE SET NULL,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      size_bytes BIGINT NOT NULL DEFAULT 0,
      storage_path TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS external_links (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      entry_id UUID REFERENCES experiment_entries(id) ON DELETE CASCADE,
      item_id UUID REFERENCES inventory_items(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      url TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'link',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      actor TEXT NOT NULL DEFAULT 'admin',
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL DEFAULT '',
      metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS experiment_entries_search_idx
      ON experiment_entries USING GIN (to_tsvector('simple', title || ' ' || body));
    CREATE INDEX IF NOT EXISTS inventory_items_search_idx
      ON inventory_items USING GIN (to_tsvector('simple', name || ' ' || identifier || ' ' || notes));
  `);

  await pool.query(`
    ALTER TABLE storage_locations ADD COLUMN IF NOT EXISTS layout_type TEXT NOT NULL DEFAULT 'none';
    ALTER TABLE storage_locations ADD COLUMN IF NOT EXISTS rows INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE storage_locations ADD COLUMN IF NOT EXISTS columns INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS slot_code TEXT NOT NULL DEFAULT '';
    ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS stored_on DATE;
  `);
}

export async function audit(pool, action, entityType, entityId = '', metadata = {}) {
  await pool.query(
    `INSERT INTO audit_logs (action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, $4)`,
    [action, entityType, entityId, metadata]
  );
}

export async function listAllForExport(pool) {
  const [
    records,
    events,
    inventory,
    locations,
    attachments,
    externalLinks,
    movements
  ] = await Promise.all([
    pool.query('SELECT * FROM experiment_entries ORDER BY occurred_at DESC'),
    pool.query('SELECT * FROM events ORDER BY occurred_at DESC'),
    pool.query('SELECT * FROM inventory_items ORDER BY created_at DESC'),
    pool.query('SELECT * FROM storage_locations ORDER BY created_at ASC'),
    pool.query('SELECT * FROM attachments ORDER BY created_at DESC'),
    pool.query('SELECT * FROM external_links ORDER BY created_at DESC'),
    pool.query('SELECT * FROM inventory_movements ORDER BY created_at DESC')
  ]);

  return {
    records: records.rows,
    events: events.rows,
    inventory: inventory.rows,
    locations: locations.rows,
    attachments: attachments.rows,
    externalLinks: externalLinks.rows,
    movements: movements.rows
  };
}
