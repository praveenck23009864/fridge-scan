import {api, type DetectedItem, type FridgeScan} from './api';

export type CurrentInventory = {scan: FridgeScan | undefined; items: DetectedItem[]};

export async function loadCurrentInventory(): Promise<CurrentInventory> {
  // These endpoints return complete arrays (no pagination). Older reviewed scans
  // are snapshots, not additional inventory: combining them would duplicate food.
  const scans = await api.getScans();
  const scan = scans.filter(entry => entry.status === 'reviewed').sort((a, b) => b.id - a.id)[0];
  const items = scan ? await api.getScanItems(scan.id) : [];
  return {scan, items: items.filter(item => item.confirmed)};
}
