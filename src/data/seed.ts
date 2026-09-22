import type { AppState } from "../types";

/**
 * 数据层：内置种子数据。
 * 以“今天”为基准生成生效区间，保证首次打开即可看到授信占用与冲突效果。
 */
export function buildSeedState(now: Date = new Date()): AppState {
  const day = 86400000;
  const at = (offset: number) => new Date(now.getTime() + offset * day).toISOString().slice(0, 10);
  const stamp = (offset: number) => new Date(now.getTime() + offset * day).toISOString();

  const customers = [
    { id: "c1", name: "华东物流集团", creditLimit: 5_000_000 },
    { id: "c2", name: "顺通运输公司", creditLimit: 2_000_000 },
    { id: "c3", name: "宏远石化贸易", creditLimit: 8_000_000 }
  ];

  const products = [
    { id: "p92", name: "92号汽油", unit: "吨", costLine: 7400, listPrice: 7620 },
    { id: "p95", name: "95号汽油", unit: "吨", costLine: 7850, listPrice: 8120 },
    { id: "p98", name: "98号汽油", unit: "吨", costLine: 8600, listPrice: 8980 },
    { id: "pd0", name: "0号柴油", unit: "吨", costLine: 6900, listPrice: 7180 }
  ];

  return {
    customers,
    products,
    quotes: [
      {
        id: "seed-q1",
        code: "BJ-20260901-001",
        customerId: "c1",
        productId: "p92",
        lockedPrice: 7600,
        quantity: 600,
        startDate: at(-5),
        endDate: at(25),
        operator: "销售主管",
        notes: "季度框架协议首批锁价",
        status: "effective",
        approval: null,
        versions: [
          { version: 1, price: 7600, reason: "初始锁价", operator: "销售主管", changedAt: stamp(-5) }
        ],
        frozenOccupied: 7600 * 600,
        createdAt: stamp(-6),
        activatedAt: stamp(-5),
        withdrawnAt: null,
        expiredAt: null
      },
      {
        id: "seed-q2",
        code: "BJ-20260902-002",
        customerId: "c2",
        productId: "pd0",
        lockedPrice: 7050,
        quantity: 300,
        startDate: at(-2),
        endDate: at(12),
        operator: "客户经理",
        notes: "大客户月度补货，金额超授信，补齐审批依据后方可生效",
        status: "draft",
        approval: null,
        versions: [
          { version: 1, price: 7050, reason: "初始锁价", operator: "客户经理", changedAt: stamp(-2) }
        ],
        frozenOccupied: 0,
        createdAt: stamp(-2),
        activatedAt: null,
        withdrawnAt: null,
        expiredAt: null
      },
      {
        id: "seed-q3",
        code: "BJ-20260903-003",
        customerId: "c3",
        productId: "p95",
        lockedPrice: 7820,
        quantity: 500,
        startDate: at(-10),
        endDate: at(-3),
        operator: "销售主管",
        notes: "短期锁价已到期，授信自动回退",
        status: "expired",
        approval: {
          belowCost: true,
          overCredit: false,
          reason: "清库存冲量，价格部邮件批复 #2026-0917",
          approver: "价格委员会",
          approvedAt: stamp(-11)
        },
        versions: [
          { version: 1, price: 7820, reason: "初始锁价（低于成本线，附审批）", operator: "销售主管", changedAt: stamp(-10) }
        ],
        frozenOccupied: 0,
        createdAt: stamp(-11),
        activatedAt: stamp(-10),
        withdrawnAt: null,
        expiredAt: stamp(-3)
      }
    ]
  };
}
