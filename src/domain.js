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

export function rowLabelForIndex(index) {
  let value = index;
  let label = '';
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

export function generateSlotGrid(rows = 8, columns = 12) {
  const safeRows = Math.max(1, Math.min(Number(rows || 8), 26));
  const safeColumns = Math.max(1, Math.min(Number(columns || 12), 48));
  const slots = [];

  for (let row = 1; row <= safeRows; row += 1) {
    const rowLabel = rowLabelForIndex(row);
    for (let column = 1; column <= safeColumns; column += 1) {
      const columnLabel = String(column);
      slots.push({
        row,
        column,
        rowLabel,
        columnLabel,
        code: `${rowLabel}${columnLabel}`
      });
    }
  }

  return slots;
}

export function validateSlotCode(slotCode, rows = 8, columns = 12) {
  const normalized = String(slotCode || '').trim().toUpperCase();
  if (!/^[A-Z]+[0-9]+$/.test(normalized)) return null;

  const valid = new Set(generateSlotGrid(rows, columns).map((slot) => slot.code));
  return valid.has(normalized) ? normalized : null;
}

export function defaultChildLocationForSlot(parentLocation, slotCode) {
  const code = String(slotCode || '').trim().toUpperCase();
  if (!code) return null;

  if (parentLocation?.kind === 'freezer') {
    return {
      name: `抽屉 ${code}`,
      kind: 'drawer',
      layout_type: 'grid',
      rows: 1,
      columns: 5,
      position_code: code
    };
  }

  if (parentLocation?.kind === 'drawer' || parentLocation?.kind === 'rack') {
    return {
      name: `盒子 ${code}`,
      kind: 'box',
      layout_type: 'grid',
      rows: 9,
      columns: 9,
      position_code: code
    };
  }

  return null;
}

export function slugifyIdPrefix(input) {
  return String(input || 'item')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
}
