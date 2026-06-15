import { generateSlotGrid } from './domain.js';

export function itemState(item) {
  if (!item) return 'empty';
  if (item.status === 'depleted' || Number(item.quantity || 0) <= 0) return 'depleted';
  if (item.status === 'reserved') return 'reserved';
  if (item.status === 'discarded') return 'discarded';
  return 'occupied';
}

export function buildStorageView({ location, inventory = [] }) {
  const rows = Number(location?.rows || 8);
  const columns = Number(location?.columns || 12);
  const bySlot = new Map(
    inventory
      .filter((item) => item.slot_code)
      .map((item) => [String(item.slot_code).toUpperCase(), item])
  );

  return {
    location,
    rows,
    columns,
    slots: generateSlotGrid(rows, columns).map((slot) => {
      const item = bySlot.get(slot.code) || null;
      return {
        ...slot,
        item,
        state: itemState(item)
      };
    })
  };
}
