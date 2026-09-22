// 存储层：仅负责 DeskData 的持久化与种子数据，不含业务规则
import type { DeskData } from "./types";

const STORAGE_KEY = "dfwlfront-9-lock-price-desk";

export function seedData(): DeskData {
  const today = new Date();
  const iso = (offsetDays: number) => {
    const d = new Date(today.getTime() + offsetDays * 86400000);
    return d.toISOString().slice(0, 10);
  };
  const now = () => new Date().toISOString();

  return {
    customers: [
      { id: "c1", name: "华东物流集团", creditLimit: 5000000 },
      { id: "c2", name: "顺通运输公司", creditLimit: 2000000 },
      { id: "c3", name: "港口加油站连锁", creditLimit: 8000000 }
    ],
    fuels: [
      { id: "f92", name: "92号汽油", unit: "吨", costPrice: 7400, listPrice: 7620 },
      { id: "f95", name: "95号汽油", unit: "吨", costPrice: 7850, listPrice: 8120 },
      { id: "f98", name: "98号汽油", unit: "吨", costPrice: 8600, listPrice: 8980 },
      { id: "f0", name: "0号柴油", unit: "吨", costPrice: 6900, listPrice: 7180 }
    ],
    quotes: [
      {
        id: "seed-q1",
        quoteNo: "BJ-202609-001",
        customerId: "c1",
        fuelId: "f92",
        lockedPrice: 7520,
        quantity: 300,
        startDate: iso(-5),
        endDate: iso(10),
        operator: "王锁价",
        approvalBasis: "",
        status: "active",
        createdAt: now(),
        activatedAt: now(),
        versions: [
          {
            version: 1,
            lockedPrice: 7520,
            quantity: 300,
            reason: "合同生效初始锁价",
            approvalBasis: "",
            operator: "王锁价",
            changedAt: now()
          }
        ]
      },
      {
        id: "seed-q2",
        quoteNo: "BJ-202609-002",
        customerId: "c2",
        fuelId: "f0",
        lockedPrice: 6850,
        quantity: 100,
        startDate: iso(0),
        endDate: iso(20),
        operator: "李审批",
        approvalBasis: "大客户季度协议，低于成本 50 元/吨由销售总监特批（批件 SP-2026-118）",
        status: "draft",
        createdAt: now(),
        versions: []
      },
      {
        id: "seed-q3",
        quoteNo: "BJ-202609-003",
        customerId: "c3",
        fuelId: "f95",
        lockedPrice: 8000,
        quantity: 500,
        startDate: iso(-15),
        endDate: iso(-2),
        operator: "王锁价",
        approvalBasis: "",
        status: "active",
        createdAt: now(),
        activatedAt: now(),
        versions: [
          {
            version: 1,
            lockedPrice: 8000,
            quantity: 500,
            reason: "合同生效初始锁价",
            approvalBasis: "",
            operator: "王锁价",
            changedAt: now()
          }
        ]
      }
    ]
  };
}

export const storage = {
  load(): DeskData {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedData();
    try {
      const parsed = JSON.parse(raw) as DeskData;
      if (!parsed.customers || !parsed.fuels || !parsed.quotes) return seedData();
      return parsed;
    } catch {
      return seedData();
    }
  },
  save(data: DeskData): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  },
  reset(): DeskData {
    const data = seedData();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return data;
  }
};
