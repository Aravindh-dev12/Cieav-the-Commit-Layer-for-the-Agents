import type { Receipt } from "@cieav/contracts";
export interface ReceiptStore { save(receipt: Receipt): Promise<void>; list(deviceId: string, limit: number): Promise<Receipt[]>; get(deviceId: string, id: string): Promise<Receipt | null>; updateStatus(deviceId: string, id: string, status: Receipt["status"]): Promise<Receipt | null>; close(): Promise<void>; }
