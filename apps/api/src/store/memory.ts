import type { Receipt } from "@cieav/contracts";
import type { ReceiptStore } from "./types.js";
export class MemoryReceiptStore implements ReceiptStore {
  private receipts = new Map<string, Receipt>();
  async save(receipt: Receipt) { this.receipts.set(receipt.id, receipt); }
  async list(deviceId: string, limit: number) { return [...this.receipts.values()].filter(r => r.deviceId === deviceId).sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit); }
  async get(deviceId: string, id: string) { const r = this.receipts.get(id); return r?.deviceId === deviceId ? r : null; }
  async updateStatus(deviceId: string, id: string, status: Receipt["status"]) { const r = await this.get(deviceId, id); if (!r) return null; const next = {...r, status}; this.receipts.set(id, next); return next; }
  async close() {}
}
