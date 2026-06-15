export const inventoryTypes = [
  'sample',
  'reagent',
  'consumable',
  'plasmid',
  'cell_line',
  'antibody',
  'equipment',
  'other'
];

export function buildStoragePath(locations, leafId) {
  const byId = new Map(locations.map((location) => [location.id, location]));
  const names = [];
  let current = byId.get(leafId);
  const seen = new Set();

  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    names.unshift(current.name);
    current = current.parent_id ? byId.get(current.parent_id) : null;
  }

  return names.join(' / ');
}

export function normalizeInventoryQuantity(currentQuantity, deltaQuantity) {
  const current = Number(currentQuantity || 0);
  const delta = Number(deltaQuantity || 0);
  const next = current + delta;
  return Number.isFinite(next) && next > 0 ? next : 0;
}

export function slugifyIdPrefix(input) {
  return String(input || 'item')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
}
