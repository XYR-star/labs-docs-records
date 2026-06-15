import 'dotenv/config';
import crypto from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import cookie from 'cookie';

import { getConfig } from './config.js';
import {
  createPool,
  migrate,
  audit,
  getRecordingStartedAt,
  listAllForExport,
  recordEvent,
  startRecording
} from './db.js';
import { exportBackupManifest } from './exporter.js';
import { normalizeInventoryQuantity, validateSlotCode } from './domain.js';
import { buildStorageView } from './storage-view.js';
import { createRecordingState } from './recording.js';
import { getExperimentTemplates, normalizeTemplateData } from './experiment-templates.js';
import { signSession, verifyPassword, verifySession } from './auth.js';
import { createLoginRateLimiter } from './rate-limit.js';

const config = getConfig();
const pool = createPool(config.databaseUrl);

await Promise.all(Object.values(config.paths).map((dir) => mkdir(dir, { recursive: true })));
await migrate(pool);

const upload = multer({
  storage: multer.diskStorage({
    destination: config.paths.uploads,
    filename(_req, file, cb) {
      const ext = path.extname(file.originalname || '');
      cb(null, `${crypto.randomUUID()}${ext}`);
    }
  }),
  limits: { fileSize: 100 * 1024 * 1024 }
});

const app = express();
const loginRateLimiter = createLoginRateLimiter();
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(process.cwd(), 'public')));

function requireAuth(req, res, next) {
  const parsed = cookie.parse(req.headers.cookie || '');
  if (!verifySession(parsed.labs_session, config.sessionSecret)) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  return next();
}

function cleanTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 24);
}

function cleanUuidList(values) {
  const list = Array.isArray(values) ? values : values ? [values] : [];
  return [...new Set(list.map((value) => String(value).trim()).filter(Boolean))].slice(0, 50);
}

function getClientKey(req) {
  return (
    req.headers['cf-connecting-ip'] ||
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.ip ||
    'unknown'
  );
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    data_root: config.paths.root,
    app: 'labs-eln'
  });
});

app.post('/api/login', async (req, res) => {
  const clientKey = getClientKey(req);
  const block = loginRateLimiter.isBlocked(clientKey);
  if (block.blocked) {
    res.setHeader('Retry-After', String(block.retryAfterSeconds));
    return res.status(429).json({
      error: `Too many failed login attempts. Try again in ${block.retryAfterSeconds} seconds.`
    });
  }

  const ok = await verifyPassword(req.body?.password, config.adminPasswordHash);
  if (!ok) {
    loginRateLimiter.recordFailure(clientKey);
    await audit(pool, 'login_failed', 'session', '', { client: clientKey });
    return res.status(401).json({ error: 'Invalid password' });
  }

  loginRateLimiter.recordSuccess(clientKey);
  const token = signSession(config.sessionSecret);
  res.setHeader(
    'Set-Cookie',
    cookie.serialize('labs_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.publicBaseUrl.startsWith('https://'),
      path: '/',
      maxAge: 60 * 60 * 24 * 14
    })
  );
  await audit(pool, 'login', 'session');
  res.json({ ok: true });
});

app.post('/api/logout', requireAuth, (_req, res) => {
  res.setHeader(
    'Set-Cookie',
    cookie.serialize('labs_session', '', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 0
    })
  );
  res.json({ ok: true });
});

app.get('/api/dashboard', requireAuth, async (_req, res) => {
  const [experiments, entries, events, inventory, lowStock] = await Promise.all([
    pool.query('SELECT count(*)::int AS count FROM experiments'),
    pool.query('SELECT count(*)::int AS count FROM experiment_entries'),
    pool.query('SELECT count(*)::int AS count FROM events'),
    pool.query('SELECT count(*)::int AS count FROM inventory_items'),
    pool.query(`SELECT * FROM inventory_items WHERE quantity <= 1 ORDER BY updated_at DESC LIMIT 8`)
  ]);

  res.json({
    experiments: experiments.rows[0].count,
    entries: entries.rows[0].count,
    events: events.rows[0].count,
    inventory: inventory.rows[0].count,
    low_stock: lowStock.rows
  });
});

app.get('/api/recording', requireAuth, async (_req, res) => {
  res.json(createRecordingState(await getRecordingStartedAt(pool)));
});

app.post('/api/recording/start', requireAuth, async (_req, res) => {
  const wasStarted = await getRecordingStartedAt(pool);
  const startedAt = await startRecording(pool);
  if (!wasStarted) {
    await recordEvent(pool, 'recording.start', 'system', 'recording', '开始正式记录操作流水', {
      started_at: startedAt
    });
  }
  res.json(createRecordingState(startedAt));
});

app.get('/api/recording/events', requireAuth, async (_req, res) => {
  const result = await pool.query('SELECT * FROM recording_events ORDER BY created_at DESC LIMIT 200');
  res.json(result.rows);
});

app.get('/api/experiment-templates', requireAuth, async (_req, res) => {
  res.json(getExperimentTemplates());
});

app.get('/api/experiments', requireAuth, async (req, res) => {
  const q = String(req.query.q || '').trim();
  const result = q
    ? await pool.query(
        `SELECT e.*, count(en.id)::int AS entry_count, max(en.occurred_at) AS last_entry_at
         FROM experiments e
         LEFT JOIN experiment_entries en ON en.experiment_id = e.id
         WHERE to_tsvector('simple', e.title || ' ' || e.objective) @@ plainto_tsquery('simple', $1)
         GROUP BY e.id
         ORDER BY e.updated_at DESC LIMIT 100`,
        [q]
      )
    : await pool.query(
        `SELECT e.*, count(en.id)::int AS entry_count, max(en.occurred_at) AS last_entry_at
         FROM experiments e
         LEFT JOIN experiment_entries en ON en.experiment_id = e.id
         GROUP BY e.id
         ORDER BY e.updated_at DESC LIMIT 100`
      );
  res.json(result.rows);
});

app.post('/api/experiments', requireAuth, async (req, res) => {
  const result = await pool.query(
    `INSERT INTO experiments (title, objective, status, tags)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [
      String(req.body.title || '').trim(),
      String(req.body.objective || ''),
      String(req.body.status || 'active'),
      cleanTags(req.body.tags)
    ]
  );
  await audit(pool, 'create', 'experiment', result.rows[0].id);
  await recordEvent(pool, 'experiment.create', 'experiment', result.rows[0].id, `新建实验：${result.rows[0].title}`, {
    status: result.rows[0].status
  });
  res.status(201).json(result.rows[0]);
});

app.put('/api/experiments/:id', requireAuth, async (req, res) => {
  const result = await pool.query(
    `UPDATE experiments
     SET title = $2, objective = $3, status = $4, tags = $5, updated_at = now()
     WHERE id = $1 RETURNING *`,
    [
      req.params.id,
      String(req.body.title || '').trim(),
      String(req.body.objective || ''),
      String(req.body.status || 'active'),
      cleanTags(req.body.tags)
    ]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Experiment not found' });
  await audit(pool, 'update', 'experiment', req.params.id);
  await recordEvent(pool, 'experiment.edit', 'experiment', req.params.id, `编辑实验：${result.rows[0].title}`, {
    status: result.rows[0].status
  });
  res.json(result.rows[0]);
});

app.get('/api/entries', requireAuth, async (req, res) => {
  const q = String(req.query.q || '').trim();
  const experimentId = String(req.query.experiment_id || '').trim();
  const result = q
    ? await pool.query(
        `SELECT en.*, e.title AS experiment_title
         , COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'id', i.id,
               'name', i.name,
               'type', i.type,
               'identifier', i.identifier,
               'quantity', i.quantity,
               'unit', i.unit,
               'location_id', i.location_id,
               'location_name', l.name,
               'slot_code', i.slot_code
             )
           ) FILTER (WHERE i.id IS NOT NULL),
           '[]'::jsonb
         ) AS linked_inventory
         FROM experiment_entries en
         LEFT JOIN experiments e ON e.id = en.experiment_id
         LEFT JOIN entry_inventory_links eil ON eil.entry_id = en.id
         LEFT JOIN inventory_items i ON i.id = eil.item_id
         LEFT JOIN storage_locations l ON l.id = i.location_id
         WHERE to_tsvector('simple', en.title || ' ' || en.body) @@ plainto_tsquery('simple', $1)
           AND ($2::uuid IS NULL OR en.experiment_id = $2::uuid)
         GROUP BY en.id, e.title
         ORDER BY en.occurred_at DESC LIMIT 100`,
        [q, experimentId || null]
      )
    : await pool.query(
        `SELECT en.*, e.title AS experiment_title
         , COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'id', i.id,
               'name', i.name,
               'type', i.type,
               'identifier', i.identifier,
               'quantity', i.quantity,
               'unit', i.unit,
               'location_id', i.location_id,
               'location_name', l.name,
               'slot_code', i.slot_code
             )
           ) FILTER (WHERE i.id IS NOT NULL),
           '[]'::jsonb
         ) AS linked_inventory
         FROM experiment_entries en
         LEFT JOIN experiments e ON e.id = en.experiment_id
         LEFT JOIN entry_inventory_links eil ON eil.entry_id = en.id
         LEFT JOIN inventory_items i ON i.id = eil.item_id
         LEFT JOIN storage_locations l ON l.id = i.location_id
         WHERE ($1::uuid IS NULL OR en.experiment_id = $1::uuid)
         GROUP BY en.id, e.title
         ORDER BY en.occurred_at DESC LIMIT 100`,
        [experimentId || null]
      )
  res.json(result.rows);
});

app.post('/api/entries', requireAuth, async (req, res) => {
  const templateKey = String(req.body.template_key || 'blank');
  const templateData = normalizeTemplateData(templateKey, req.body.template_data || {});
  const inventoryIds = cleanUuidList(req.body.inventory_ids);
  const result = await pool.query(
    `INSERT INTO experiment_entries (experiment_id, title, body, status, template_key, template_data, occurred_at, tags)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, now()), $8)
     RETURNING *`,
    [
      req.body.experiment_id || null,
      String(req.body.title || '').trim(),
      String(req.body.body || ''),
      String(req.body.status || 'active'),
      templateKey,
      templateData,
      req.body.occurred_at || null,
      cleanTags(req.body.tags)
    ]
  );
  if (inventoryIds.length) {
    await pool.query(
      `INSERT INTO entry_inventory_links (entry_id, item_id)
       SELECT $1, id FROM inventory_items WHERE id = ANY($2::uuid[])
       ON CONFLICT DO NOTHING`,
      [result.rows[0].id, inventoryIds]
    );
  }
  await audit(pool, 'create', 'experiment_entry', result.rows[0].id);
  await recordEvent(pool, 'entry.create', 'experiment_entry', result.rows[0].id, `保存实验记录：${result.rows[0].title}`, {
    experiment_id: result.rows[0].experiment_id,
    title: result.rows[0].title,
    template_key: result.rows[0].template_key,
    status: result.rows[0].status,
    inventory_ids: inventoryIds
  });
  res.status(201).json(result.rows[0]);
});

app.put('/api/entries/:id', requireAuth, async (req, res) => {
  const templateKey = String(req.body.template_key || 'blank');
  const templateData = normalizeTemplateData(templateKey, req.body.template_data || {});
  const inventoryIds = cleanUuidList(req.body.inventory_ids);
  const result = await pool.query(
    `UPDATE experiment_entries
     SET experiment_id = $2, title = $3, body = $4, status = $5, template_key = $6,
         template_data = $7, occurred_at = COALESCE($8::timestamptz, occurred_at), tags = $9, updated_at = now()
     WHERE id = $1 RETURNING *`,
    [
      req.params.id,
      req.body.experiment_id || null,
      String(req.body.title || '').trim(),
      String(req.body.body || ''),
      String(req.body.status || 'active'),
      templateKey,
      templateData,
      req.body.occurred_at || null,
      cleanTags(req.body.tags)
    ]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Entry not found' });
  await pool.query('DELETE FROM entry_inventory_links WHERE entry_id = $1', [req.params.id]);
  if (inventoryIds.length) {
    await pool.query(
      `INSERT INTO entry_inventory_links (entry_id, item_id)
       SELECT $1, id FROM inventory_items WHERE id = ANY($2::uuid[])
       ON CONFLICT DO NOTHING`,
      [req.params.id, inventoryIds]
    );
  }
  await audit(pool, 'update', 'experiment_entry', req.params.id);
  await recordEvent(pool, 'entry.edit', 'experiment_entry', req.params.id, `编辑实验记录：${result.rows[0].title}`, {
    experiment_id: result.rows[0].experiment_id,
    title: result.rows[0].title,
    template_key: result.rows[0].template_key,
    status: result.rows[0].status,
    inventory_ids: inventoryIds
  });
  res.json(result.rows[0]);
});

app.get('/api/events', requireAuth, async (_req, res) => {
  const result = await pool.query('SELECT * FROM events ORDER BY occurred_at DESC LIMIT 100');
  res.json(result.rows);
});

app.post('/api/events', requireAuth, async (req, res) => {
  const result = await pool.query(
    `INSERT INTO events (entry_id, kind, title, body, occurred_at)
     VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, now()))
     RETURNING *`,
    [
      req.body.entry_id || null,
      String(req.body.kind || 'note'),
      String(req.body.title || '').trim(),
      String(req.body.body || ''),
      req.body.occurred_at || null
    ]
  );
  await audit(pool, 'create', 'event', result.rows[0].id);
  await recordEvent(pool, 'event.create', 'event', result.rows[0].id, `保存事件：${result.rows[0].title}`, {
    kind: result.rows[0].kind,
    title: result.rows[0].title
  });
  res.status(201).json(result.rows[0]);
});

app.get('/api/locations', requireAuth, async (_req, res) => {
  const result = await pool.query('SELECT * FROM storage_locations ORDER BY created_at ASC');
  res.json(result.rows);
});

app.post('/api/locations', requireAuth, async (req, res) => {
  const result = await pool.query(
    `INSERT INTO storage_locations (parent_id, name, kind, layout_type, rows, columns, position_code, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      req.body.parent_id || null,
      String(req.body.name || '').trim(),
      String(req.body.kind || 'location'),
      String(req.body.layout_type || (req.body.kind === 'box' ? 'grid' : 'none')),
      Number(req.body.rows || 0),
      Number(req.body.columns || 0),
      String(req.body.position_code || ''),
      String(req.body.notes || '')
    ]
  );
  await audit(pool, 'create', 'storage_location', result.rows[0].id);
  await recordEvent(pool, 'location.create', 'storage_location', result.rows[0].id, `新增位置：${result.rows[0].name}`, {
    kind: result.rows[0].kind,
    parent_id: result.rows[0].parent_id,
    position_code: result.rows[0].position_code
  });
  res.status(201).json(result.rows[0]);
});

app.put('/api/locations/:id', requireAuth, async (req, res) => {
  const layoutType = String(req.body.layout_type || (req.body.kind === 'box' ? 'grid' : 'none'));
  const result = await pool.query(
    `UPDATE storage_locations
     SET parent_id = $2, name = $3, kind = $4, layout_type = $5, rows = $6, columns = $7,
         position_code = $8, notes = $9, updated_at = now()
     WHERE id = $1 RETURNING *`,
    [
      req.params.id,
      req.body.parent_id || null,
      String(req.body.name || '').trim(),
      String(req.body.kind || 'location'),
      layoutType,
      Number(req.body.rows || 0),
      Number(req.body.columns || 0),
      String(req.body.position_code || '').trim().toUpperCase(),
      String(req.body.notes || '')
    ]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Location not found' });
  await audit(pool, 'update', 'storage_location', req.params.id);
  await recordEvent(pool, 'location.edit', 'storage_location', req.params.id, `编辑位置：${result.rows[0].name}`, {
    kind: result.rows[0].kind,
    parent_id: result.rows[0].parent_id,
    position_code: result.rows[0].position_code,
    rows: result.rows[0].rows,
    columns: result.rows[0].columns
  });
  res.json(result.rows[0]);
});

app.delete('/api/locations/:id', requireAuth, async (req, res) => {
  const [children, inventory] = await Promise.all([
    pool.query('SELECT count(*)::int AS count FROM storage_locations WHERE parent_id = $1', [req.params.id]),
    pool.query('SELECT count(*)::int AS count FROM inventory_items WHERE location_id = $1', [req.params.id])
  ]);
  if (children.rows[0].count > 0 || inventory.rows[0].count > 0) {
    return res.status(409).json({
      error: 'Location is not empty. Move or delete child locations and inventory first.'
    });
  }

  const result = await pool.query('DELETE FROM storage_locations WHERE id = $1 RETURNING id, name, kind, position_code', [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Location not found' });
  await audit(pool, 'delete', 'storage_location', req.params.id);
  await recordEvent(pool, 'location.delete', 'storage_location', req.params.id, `删除位置：${result.rows[0].name}`, {
    kind: result.rows[0].kind,
    position_code: result.rows[0].position_code
  });
  res.status(204).end();
});

app.get('/api/locations/:id/view', requireAuth, async (req, res) => {
  const location = await pool.query('SELECT * FROM storage_locations WHERE id = $1', [req.params.id]);
  if (!location.rowCount) return res.status(404).json({ error: 'Location not found' });
  const [inventory, children] = await Promise.all([
    pool.query(
    `SELECT * FROM inventory_items WHERE location_id = $1 ORDER BY slot_code ASC, updated_at DESC`,
    [req.params.id]
    ),
    pool.query(
      `SELECT * FROM storage_locations WHERE parent_id = $1 ORDER BY position_code ASC, name ASC`,
      [req.params.id]
    )
  ]);
  res.json(buildStorageView({
    location: location.rows[0],
    inventory: inventory.rows,
    children: children.rows
  }));
});

app.get('/api/inventory', requireAuth, async (req, res) => {
  const q = String(req.query.q || '').trim();
  const result = q
    ? await pool.query(
        `SELECT i.*, l.name AS location_name
         FROM inventory_items i
         LEFT JOIN storage_locations l ON l.id = i.location_id
         WHERE to_tsvector('simple', i.name || ' ' || i.identifier || ' ' || i.notes)
           @@ plainto_tsquery('simple', $1)
         ORDER BY i.updated_at DESC LIMIT 200`,
        [q]
      )
    : await pool.query(
        `SELECT i.*, l.name AS location_name
         FROM inventory_items i
         LEFT JOIN storage_locations l ON l.id = i.location_id
         ORDER BY i.updated_at DESC LIMIT 200`
      );
  res.json(result.rows);
});

app.post('/api/inventory', requireAuth, async (req, res) => {
  let slotCode = String(req.body.slot_code || '').trim().toUpperCase();
  if (req.body.location_id) {
    const location = await pool.query('SELECT * FROM storage_locations WHERE id = $1', [req.body.location_id]);
    if (!location.rowCount) return res.status(404).json({ error: 'Location not found' });
    const target = location.rows[0];
    if (target.layout_type === 'grid') {
      slotCode = validateSlotCode(slotCode, target.rows, target.columns);
      if (!slotCode) return res.status(400).json({ error: 'Invalid slot for selected box layout' });
    }
  }

  const result = await pool.query(
    `INSERT INTO inventory_items
      (location_id, type, name, identifier, slot_code, quantity, unit, stored_on, expires_on, status, notes, tags)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      req.body.location_id || null,
      String(req.body.type || 'sample'),
      String(req.body.name || '').trim(),
      String(req.body.identifier || ''),
      slotCode || '',
      Number(req.body.quantity || 0),
      String(req.body.unit || ''),
      req.body.stored_on || null,
      req.body.expires_on || null,
      String(req.body.status || 'available'),
      String(req.body.notes || ''),
      cleanTags(req.body.tags)
    ]
  );
  await pool.query(
    `INSERT INTO inventory_movements
      (item_id, action, to_location_id, to_slot_code, quantity_after, note)
     VALUES ($1, 'store', $2, $3, $4, $5)`,
    [
      result.rows[0].id,
      result.rows[0].location_id,
      result.rows[0].slot_code,
      result.rows[0].quantity,
      'Created inventory item'
    ]
  );
  await audit(pool, 'create', 'inventory_item', result.rows[0].id);
  await recordEvent(pool, 'inventory.store', 'inventory_item', result.rows[0].id, `存入库存：${result.rows[0].name}`, {
    location_id: result.rows[0].location_id,
    slot_code: result.rows[0].slot_code,
    quantity: result.rows[0].quantity,
    unit: result.rows[0].unit
  });
  res.status(201).json(result.rows[0]);
});

app.post('/api/inventory/:id/adjust', requireAuth, async (req, res) => {
  const existing = await pool.query('SELECT * FROM inventory_items WHERE id = $1', [req.params.id]);
  if (!existing.rowCount) return res.status(404).json({ error: 'Inventory item not found' });
  const nextQuantity = normalizeInventoryQuantity(existing.rows[0].quantity, req.body.delta);
  const result = await pool.query(
    `UPDATE inventory_items SET quantity = $2, updated_at = now() WHERE id = $1 RETURNING *`,
    [req.params.id, nextQuantity]
  );
  await pool.query(
    `INSERT INTO inventory_movements
      (item_id, action, from_location_id, to_location_id, from_slot_code, to_slot_code, quantity_before, quantity_after, note)
     SELECT id, 'adjust', location_id, location_id, slot_code, slot_code, $2, $3, $4
     FROM inventory_items WHERE id = $1`,
    [req.params.id, existing.rows[0].quantity, nextQuantity, String(req.body.note || '')]
  );
  await audit(pool, 'adjust_quantity', 'inventory_item', req.params.id, { delta: req.body.delta });
  const delta = Number(req.body.delta || 0);
  await recordEvent(
    pool,
    delta < 0 ? 'inventory.remove' : 'inventory.adjust',
    'inventory_item',
    req.params.id,
    `${delta < 0 ? '取用' : '调整'}库存：${existing.rows[0].name}（${existing.rows[0].quantity} -> ${nextQuantity}）`,
    {
      delta,
      quantity_before: existing.rows[0].quantity,
      quantity_after: nextQuantity,
      note: String(req.body.note || '')
    }
  );
  res.json(result.rows[0]);
});

app.put('/api/inventory/:id', requireAuth, async (req, res) => {
  const existing = await pool.query('SELECT * FROM inventory_items WHERE id = $1', [req.params.id]);
  if (!existing.rowCount) return res.status(404).json({ error: 'Inventory item not found' });

  let locationId = req.body.location_id || null;
  let slotCode = String(req.body.slot_code || '').trim().toUpperCase();
  if (locationId) {
    const location = await pool.query('SELECT * FROM storage_locations WHERE id = $1', [locationId]);
    if (!location.rowCount) return res.status(404).json({ error: 'Location not found' });
    const target = location.rows[0];
    if (target.layout_type === 'grid') {
      slotCode = validateSlotCode(slotCode, target.rows, target.columns);
      if (!slotCode) return res.status(400).json({ error: 'Invalid slot for selected box layout' });
    }
  }

  const result = await pool.query(
    `UPDATE inventory_items
     SET location_id = $2, type = $3, name = $4, identifier = $5, slot_code = $6,
         quantity = $7, unit = $8, stored_on = $9, expires_on = $10, status = $11, notes = $12,
         tags = $13, updated_at = now()
     WHERE id = $1 RETURNING *`,
    [
      req.params.id,
      locationId,
      String(req.body.type || 'sample'),
      String(req.body.name || '').trim(),
      String(req.body.identifier || ''),
      slotCode || '',
      Number(req.body.quantity || 0),
      String(req.body.unit || ''),
      req.body.stored_on || null,
      req.body.expires_on || null,
      String(req.body.status || 'available'),
      String(req.body.notes || ''),
      cleanTags(req.body.tags)
    ]
  );

  const moved =
    existing.rows[0].location_id !== result.rows[0].location_id ||
    existing.rows[0].slot_code !== result.rows[0].slot_code;
  await pool.query(
    `INSERT INTO inventory_movements
      (item_id, action, from_location_id, to_location_id, from_slot_code, to_slot_code, quantity_before, quantity_after, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      req.params.id,
      moved ? 'move' : 'edit',
      existing.rows[0].location_id,
      result.rows[0].location_id,
      existing.rows[0].slot_code,
      result.rows[0].slot_code,
      existing.rows[0].quantity,
      result.rows[0].quantity,
      String(req.body.note || (moved ? 'Edited item and storage position' : 'Edited item details'))
    ]
  );
  await audit(pool, 'update', 'inventory_item', req.params.id);
  await recordEvent(
    pool,
    moved ? 'inventory.move' : 'inventory.edit',
    'inventory_item',
    req.params.id,
    `${moved ? '移动/修改位置' : '编辑库存'}：${result.rows[0].name}`,
    {
      from_location_id: existing.rows[0].location_id,
      to_location_id: result.rows[0].location_id,
      from_slot_code: existing.rows[0].slot_code,
      to_slot_code: result.rows[0].slot_code,
      quantity_before: existing.rows[0].quantity,
      quantity_after: result.rows[0].quantity
    }
  );
  res.json(result.rows[0]);
});

app.post('/api/inventory/:id/move', requireAuth, async (req, res) => {
  const existing = await pool.query('SELECT * FROM inventory_items WHERE id = $1', [req.params.id]);
  if (!existing.rowCount) return res.status(404).json({ error: 'Inventory item not found' });

  const location = await pool.query('SELECT * FROM storage_locations WHERE id = $1', [req.body.location_id]);
  if (!location.rowCount) return res.status(404).json({ error: 'Target location not found' });

  const target = location.rows[0];
  const slotCode = target.layout_type === 'grid'
    ? validateSlotCode(req.body.slot_code, target.rows, target.columns)
    : String(req.body.slot_code || '').trim().toUpperCase();
  if (target.layout_type === 'grid' && !slotCode) {
    return res.status(400).json({ error: 'Invalid slot for selected box layout' });
  }

  const result = await pool.query(
    `UPDATE inventory_items
     SET location_id = $2, slot_code = $3, updated_at = now()
     WHERE id = $1 RETURNING *`,
    [req.params.id, target.id, slotCode || '']
  );

  await pool.query(
    `INSERT INTO inventory_movements
      (item_id, action, from_location_id, to_location_id, from_slot_code, to_slot_code, quantity_before, quantity_after, note)
     VALUES ($1, 'move', $2, $3, $4, $5, $6, $6, $7)`,
    [
      req.params.id,
      existing.rows[0].location_id,
      target.id,
      existing.rows[0].slot_code,
      slotCode || '',
      existing.rows[0].quantity,
      String(req.body.note || '')
    ]
  );
  await audit(pool, 'move', 'inventory_item', req.params.id, {
    from_location_id: existing.rows[0].location_id,
    to_location_id: target.id,
    to_slot_code: slotCode || ''
  });
  await recordEvent(pool, 'inventory.move', 'inventory_item', req.params.id, `移动库存：${existing.rows[0].name}`, {
    from_location_id: existing.rows[0].location_id,
    to_location_id: target.id,
    from_slot_code: existing.rows[0].slot_code,
    to_slot_code: slotCode || '',
    note: String(req.body.note || '')
  });
  res.json(result.rows[0]);
});

app.get('/api/inventory/:id/movements', requireAuth, async (req, res) => {
  const result = await pool.query(
    `SELECT m.*, fl.name AS from_location_name, tl.name AS to_location_name
     FROM inventory_movements m
     LEFT JOIN storage_locations fl ON fl.id = m.from_location_id
     LEFT JOIN storage_locations tl ON tl.id = m.to_location_id
     WHERE m.item_id = $1
     ORDER BY m.created_at DESC`,
    [req.params.id]
  );
  res.json(result.rows);
});

app.post('/api/entries/:entryId/inventory/:itemId', requireAuth, async (req, res) => {
  await pool.query(
    `INSERT INTO entry_inventory_links (entry_id, item_id)
     VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [req.params.entryId, req.params.itemId]
  );
  await audit(pool, 'link_inventory', 'experiment_entry', req.params.entryId, { item_id: req.params.itemId });
  await recordEvent(pool, 'entry.link_inventory', 'experiment_entry', req.params.entryId, '链接实验记录和库存', {
    item_id: req.params.itemId
  });
  res.status(204).end();
});

app.post('/api/attachments', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Missing file' });
  const result = await pool.query(
    `INSERT INTO attachments
      (entry_id, item_id, original_name, stored_name, mime_type, size_bytes, storage_path)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      req.body.entry_id || null,
      req.body.item_id || null,
      req.file.originalname,
      req.file.filename,
      req.file.mimetype,
      req.file.size,
      req.file.path
    ]
  );
  await audit(pool, 'upload', 'attachment', result.rows[0].id);
  await recordEvent(pool, 'attachment.upload', 'attachment', result.rows[0].id, `上传附件：${result.rows[0].original_name}`, {
    entry_id: result.rows[0].entry_id,
    item_id: result.rows[0].item_id,
    size_bytes: result.rows[0].size_bytes
  });
  res.status(201).json(result.rows[0]);
});

app.post('/api/external-links', requireAuth, async (req, res) => {
  const result = await pool.query(
    `INSERT INTO external_links (entry_id, item_id, label, url, provider)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [
      req.body.entry_id || null,
      req.body.item_id || null,
      String(req.body.label || 'External file'),
      String(req.body.url || ''),
      String(req.body.provider || 'link')
    ]
  );
  await audit(pool, 'create', 'external_link', result.rows[0].id);
  await recordEvent(pool, 'external_link.create', 'external_link', result.rows[0].id, `保存外链：${result.rows[0].label}`, {
    provider: result.rows[0].provider,
    entry_id: result.rows[0].entry_id,
    item_id: result.rows[0].item_id
  });
  res.status(201).json(result.rows[0]);
});

app.post('/api/export/manifest', requireAuth, async (_req, res) => {
  const data = await listAllForExport(pool);
  const result = await exportBackupManifest({
    exportsDir: config.paths.exports,
    ...data
  });
  await audit(pool, 'export_manifest', 'backup', result.filename);
  res.json(result);
});

app.get('/api/export/inventory.csv', requireAuth, async (_req, res) => {
  const result = await pool.query(
    `SELECT id, type, name, identifier, quantity, unit, status, stored_on, location_id
     FROM inventory_items ORDER BY updated_at DESC`
  );
  const rows = [
    ['id', 'type', 'name', 'identifier', 'quantity', 'unit', 'status', 'stored_on', 'location_id'],
    ...result.rows.map((row) => [
      row.id,
      row.type,
      row.name,
      row.identifier,
      row.quantity,
      row.unit,
      row.status,
      row.stored_on || '',
      row.location_id || ''
    ])
  ];
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
    .join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="labs-inventory.csv"');
  res.send(csv);
});

app.use((_req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

app.listen(config.port, () => {
  console.log(`labs-eln listening on ${config.port}`);
});
