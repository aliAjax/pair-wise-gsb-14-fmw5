// 规则层：锁价/授信/版本全部业务规则，纯函数，不接触存储与界面
import type {
  ConflictItem,
  Customer,
  Fuel,
  PriceChangeInput,
  Quote,
  QuoteInput
} from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** 日期字符串转零点时间戳 */
export function dayStart(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1).getTime();
}

/** 两个半开/闭区间是否重叠：生效区间按自然日含首尾，故用 +1 天判定 */
export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return dayStart(aStart) <= dayStart(bEnd) + DAY_MS - 1 &&
    dayStart(bStart) <= dayStart(aEnd) + DAY_MS - 1;
}

/** 是否落在区间内（含首尾日） */
export function dateWithin(date: string, start: string, end: string): boolean {
  const t = dayStart(date);
  return t >= dayStart(start) && t <= dayStart(end);
}

export function quoteAmount(quote: { lockedPrice: number; quantity: number }): number {
  return round2(quote.lockedPrice * quote.quantity);
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** 某客户在指定日期（默认今天）的授信占用：生效中且覆盖当日的报价额度合计 */
export function occupiedCredit(quotes: Quote[], customerId: string, onDate: string): number {
  return round2(
    quotes
      .filter(
        (q) =>
          q.customerId === customerId &&
          q.status === "active" &&
          dateWithin(onDate, q.startDate, q.endDate)
      )
      .reduce((sum, q) => sum + quoteAmount(q), 0)
  );
}

/** 客户授信面板：总额度、当日占用、可用额度，以及逐笔占用明细 */
export function creditBoard(
  customers: Customer[],
  quotes: Quote[],
  onDate: string
): Array<{
  customer: Customer;
  occupied: number;
  available: number;
  usageRate: number;
  items: Quote[];
}> {
  return customers.map((customer) => {
    const items = quotes.filter(
      (q) =>
        q.customerId === customer.id &&
        q.status === "active" &&
        dateWithin(onDate, q.startDate, q.endDate)
    );
    const occupied = round2(items.reduce((sum, q) => sum + quoteAmount(q), 0));
    return {
      customer,
      items,
      occupied,
      available: round2(customer.creditLimit - occupied),
      usageRate: customer.creditLimit > 0 ? occupied / customer.creditLimit : 0
    };
  });
}

/** 到期回退：把生效区间已过的单子标记为 expired，并返回被回退的单子 */
export function rollExpired(quotes: Quote[], today: string): Quote[] {
  return quotes.map((q) =>
    q.status === "active" && dayStart(today) > dayStart(q.endDate)
      ? { ...q, status: "expired", expiredAt: today }
      : q
  );
}

interface RuleContext {
  customers: Customer[];
  fuels: Fuel[];
  quotes: Quote[];
}

/**
 * 校验报价输入（登记或改动版本时共用）。
 * - 区间/数值无效：阻断
 * - 同客户同油品时段重叠（忽略自身与非生效单）：阻断
 * - 价格低于成本线：无审批依据则阻断
 * - 生效后将导致当日超授信：无审批依据则阻断（有依据时仍给出非阻断提示）
 */
export function validateQuote(input: QuoteInput, ctx: RuleContext, today: string): ConflictItem[] {
  const conflicts: ConflictItem[] = [];
  const customer = ctx.customers.find((c) => c.id === input.customerId);
  const fuel = ctx.fuels.find((f) => f.id === input.fuelId);
  const amount = round2((Number(input.lockedPrice) || 0) * (Number(input.quantity) || 0));

  const base = {
    quoteId: input.id || "",
    quoteNo: input.id ? ctx.quotes.find((q) => q.id === input.id)?.quoteNo || "" : "(新单)",
    customerId: input.customerId,
    customerName: customer?.name || "未选客户",
    fuelId: input.fuelId,
    fuelName: fuel?.name || "未选油品",
    quantity: Number(input.quantity) || 0,
    amount
  };

  if (!customer || !fuel) {
    conflicts.push({ ...base, kind: "invalidRange", blocking: true, detail: "必须选择客户与油品" });
    return conflicts;
  }

  const price = Number(input.lockedPrice);
  const qty = Number(input.quantity);
  if (!(price > 0) || !(qty > 0)) {
    conflicts.push({ ...base, kind: "invalidRange", blocking: true, detail: "锁定价与数量必须大于 0" });
  }
  if (!input.startDate || !input.endDate || dayStart(input.startDate) > dayStart(input.endDate)) {
    conflicts.push({ ...base, kind: "invalidRange", blocking: true, detail: "生效区间不完整或起始晚于结束" });
  }

  if (input.startDate && input.endDate && dayStart(input.startDate) <= dayStart(input.endDate)) {
    const overlap = ctx.quotes.find(
      (q) =>
        q.id !== input.id &&
        q.customerId === input.customerId &&
        q.fuelId === input.fuelId &&
        (q.status === "active" || q.status === "draft") &&
        rangesOverlap(input.startDate, input.endDate, q.startDate, q.endDate)
    );
    if (overlap) {
      conflicts.push({
        ...base,
        kind: "overlap",
        blocking: true,
        detail: `与报价单 ${overlap.quoteNo}（${overlap.startDate} ~ ${overlap.endDate}，数量 ${overlap.quantity}）时段重叠`
      });
    }
  }

  if (fuel && price > 0 && price < fuel.costPrice) {
    conflicts.push({
      ...base,
      kind: "belowCost",
      blocking: !input.approvalBasis.trim(),
      detail: `锁定价 ${price} 低于成本线 ${fuel.costPrice}（挂牌价 ${fuel.listPrice}），须填写审批依据`
    });
  }

  // 授信占用按生效首日测算（占用从生效区间第一天开始）
  if (customer && price > 0 && qty > 0 && input.startDate) {
    const others = ctx.quotes.filter(
      (q) =>
        q.id !== input.id &&
        q.customerId === customer.id &&
        q.status === "active" &&
        dateWithin(input.startDate, q.startDate, q.endDate)
    );
    const used = round2(others.reduce((s, q) => s + quoteAmount(q), 0));
    const after = round2(used + amount);
    if (after > customer.creditLimit) {
      conflicts.push({
        ...base,
        kind: "overCredit",
        blocking: !input.approvalBasis.trim(),
        detail: `生效首日占用 ${after} 元，超授信额度 ${customer.creditLimit} 元（已占用 ${used}，本单 ${amount}）`
      });
    }
  }

  return conflicts;
}

/** 生效后调价的版本校验：区间不可改，只允许改价格/数量；低于成本线或超授信须写原因+依据 */
export function validatePriceChange(
  quote: Quote,
  change: PriceChangeInput,
  ctx: RuleContext
): ConflictItem[] {
  const conflicts = validateQuote(
    {
      id: quote.id,
      customerId: quote.customerId,
      fuelId: quote.fuelId,
      lockedPrice: change.lockedPrice,
      quantity: change.quantity,
      startDate: quote.startDate,
      endDate: quote.endDate,
      operator: change.operator,
      approvalBasis: change.approvalBasis
    },
    ctx,
    quote.startDate
  );
  if (!change.reason.trim()) {
    const customer = ctx.customers.find((c) => c.id === quote.customerId);
    const fuel = ctx.fuels.find((f) => f.id === quote.fuelId);
    conflicts.push({
      kind: "invalidRange",
      blocking: true,
      quoteId: quote.id,
      quoteNo: quote.quoteNo,
      customerId: quote.customerId,
      customerName: customer?.name || "",
      fuelId: quote.fuelId,
      fuelName: fuel?.name || "",
      quantity: Number(change.quantity) || 0,
      amount: round2((Number(change.lockedPrice) || 0) * (Number(change.quantity) || 0)),
      detail: "生效后价格冻结，改动必须填写变更原因并另存版本"
    });
  }
  return conflicts;
}

export function blockingConflicts(conflicts: ConflictItem[]): ConflictItem[] {
  return conflicts.filter((c) => c.blocking);
}

/** 全站冲突扫描：列出重叠、低于成本线、超授信的客户/油品/数量/额度 */
export function scanConflicts(customers: Customer[], fuels: Fuel[], quotes: Quote[], today: string): ConflictItem[] {
  const result: ConflictItem[] = [];

  for (const q of quotes) {
    if (q.status === "withdrawn" || q.status === "expired") continue;
    const customer = customers.find((c) => c.id === q.customerId);
    const fuel = fuels.find((f) => f.id === q.fuelId);
    if (!customer || !fuel) continue;
    const amount = quoteAmount(q);
    const head = {
      quoteId: q.id,
      quoteNo: q.quoteNo,
      customerId: customer.id,
      customerName: customer.name,
      fuelId: fuel.id,
      fuelName: fuel.name,
      quantity: q.quantity,
      amount
    };

    if (q.lockedPrice < fuel.costPrice && !q.approvalBasis.trim()) {
      result.push({
        ...head,
        kind: "belowCost",
        blocking: q.status === "draft",
        detail: `锁定价 ${q.lockedPrice} 低于成本线 ${fuel.costPrice}，缺少审批依据`
      });
    }

    const others = quotes.filter(
      (o) =>
        o.id !== q.id &&
        o.customerId === q.customerId &&
        o.fuelId === q.fuelId &&
        (o.status === "active" || o.status === "draft") &&
        rangesOverlap(q.startDate, q.endDate, o.startDate, o.endDate)
    );
    for (const o of others) {
      if (o.id < q.id) continue; // 每对只报一次
      result.push({
        ...head,
        kind: "overlap",
        blocking: true,
        detail: `与 ${o.quoteNo}（${o.startDate} ~ ${o.endDate}，数量 ${o.quantity}）时段重叠`
      });
    }

    const usedElse = quotes
      .filter(
        (o) =>
          o.id !== q.id &&
          o.customerId === q.customerId &&
          o.status === "active" &&
          dateWithin(q.startDate, o.startDate, o.endDate)
      )
      .reduce((s, o) => s + quoteAmount(o), 0);
    if (q.status === "active" && round2(usedElse + amount) > customer.creditLimit) {
      result.push({
        ...head,
        kind: "overCredit",
        blocking: false,
        detail: `生效首日占用 ${round2(usedElse + amount)} 元，超授信额度 ${customer.creditLimit} 元` +
          (q.approvalBasis.trim() ? `（已审批：${q.approvalBasis}）` : "，缺少审批依据")
      });
    }
  }
  return result;
}
