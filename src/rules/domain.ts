import type {
  AmendInput,
  ApprovalNote,
  Customer,
  Product,
  Quote,
  QuoteInput,
  QuoteStatus
} from "../types";

/**
 * 规则层：全部为纯函数，描述批发锁价与授信占用业务规则，
 * 不接触 localStorage、不依赖 Vue。
 */

/** 两个闭区间 [s1,e1]、[s2,e2] 是否重叠（端点相接也算重叠） */
export function rangesOverlap(s1: string, e1: string, s2: string, e2: string): boolean {
  return s1 <= e2 && s2 <= e1;
}

export function isActiveStatus(status: QuoteStatus): boolean {
  return status === "effective";
}

/** 占用授信的只有生效中合同；草稿不占用，撤回/到期已释放 */
export function quoteOccupies(quote: Quote): boolean {
  return quote.status === "effective";
}

export function quoteAmount(quote: Quote): number {
  return quote.lockedPrice * quote.quantity;
}

export function isBelowCost(price: number, product: Product | undefined): boolean {
  return !!product && price < product.costLine;
}

/** 客户当前已占用授信 = 其所有生效合同冻结额度之和 */
export function occupiedOf(customerId: string, quotes: Quote[], excludeId?: string): number {
  return quotes
    .filter((q) => q.customerId === customerId && q.id !== excludeId && quoteOccupies(q))
    .reduce((sum, q) => sum + q.frozenOccupied, 0);
}

export interface Blockers {
  missingFields: string[];
  badInterval: boolean;
  overlaps: Quote[];
  belowCost: boolean;
  overCredit: boolean;
  missingApproval: boolean;
}

const BLOCKER_LABEL: Record<Exclude<keyof Blockers, "overlaps" | "missingFields">, string> = {
  badInterval: "生效区间不合法（结束日期不得早于开始日期）",
  belowCost: "锁定价低于成本线",
  overCredit: "生效后将超出客户授信额度",
  missingApproval: "低于成本线或超授信须填写审批依据（依据与审批人）"
};

function findOverlaps(input: QuoteInput, quotes: Quote[], selfId?: string): Quote[] {
  return quotes.filter(
    (q) =>
      q.id !== selfId &&
      (q.status === "draft" || q.status === "effective") &&
      q.customerId === input.customerId &&
      q.productId === input.productId &&
      rangesOverlap(input.startDate, input.endDate, q.startDate, q.endDate)
  );
}

/**
 * 生效前阻断检查。任一项不满足，整单只能留在草稿：
 * - 资料完整、区间合法
 * - 同客户同油品时段不重叠
 * - 低于成本线或超授信时必须有审批依据
 *
 * @param futureOnly 生效校验时重叠只看已生效合同；登记预警时草稿占位也计入
 */
export function evaluate(
  input: QuoteInput,
  context: {
    quotes: Quote[];
    customers: Customer[];
    products: Product[];
    selfId?: string;
    activeOverlapOnly?: boolean;
  }
): Blockers {
  const product = context.products.find((p) => p.id === input.productId);
  const customer = context.customers.find((c) => c.id === input.customerId);

  const missingFields = [
    ["customerId", "客户"],
    ["productId", "油品"],
    ["startDate", "生效开始日"],
    ["endDate", "生效结束日"],
    ["operator", "经办人"]
  ]
    .filter(([key]) => !String(input[key as keyof QuoteInput] ?? "").trim())
    .map(([, label]) => label);
  if (!(input.lockedPrice > 0)) missingFields.push("锁定价");
  if (!(input.quantity > 0)) missingFields.push("数量");

  const badInterval = !!input.startDate && !!input.endDate && input.endDate < input.startDate;

  let overlaps = findOverlaps(input, context.quotes, context.selfId);
  if (context.activeOverlapOnly) overlaps = overlaps.filter((q) => q.status === "effective");

  const belowCost = isBelowCost(input.lockedPrice, product);
  const amount = Math.max(0, input.lockedPrice) * Math.max(0, input.quantity);
  const occupied = customer ? occupiedOf(customer.id, context.quotes, context.selfId) : 0;
  const overCredit = !!customer && occupied + amount > customer.creditLimit;

  const exceptional = belowCost || overCredit;
  const missingApproval =
    exceptional && (!input.approvalReason.trim() || !input.approver.trim());

  return { missingFields, badInterval, overlaps, belowCost, overCredit, missingApproval };
}

/** 生效是否放行：草稿之外的硬阻断全部清空 */
export function canActivate(blockers: Blockers): boolean {
  return (
    blockers.missingFields.length === 0 &&
    !blockers.badInterval &&
    blockers.overlaps.length === 0 &&
    !blockers.missingApproval
  );
}

export function blockerMessages(blockers: Blockers): string[] {
  const messages: string[] = [];
  if (blockers.missingFields.length) messages.push(`请补全：${blockers.missingFields.join("、")}`);
  if (blockers.badInterval) messages.push(BLOCKER_LABEL.badInterval);
  if (blockers.overlaps.length) {
    messages.push(`与 ${blockers.overlaps.length} 张同客户同油品报价单时段重叠`);
  }
  if (blockers.belowCost) messages.push(BLOCKER_LABEL.belowCost);
  if (blockers.overCredit) messages.push(BLOCKER_LABEL.overCredit);
  if (blockers.missingApproval) messages.push(BLOCKER_LABEL.missingApproval);
  return messages;
}

export function buildApproval(
  input: QuoteInput,
  blockers: Pick<Blockers, "belowCost" | "overCredit">,
  now: Date
): ApprovalNote | null {
  if (!blockers.belowCost && !blockers.overCredit) return null;
  return {
    belowCost: blockers.belowCost,
    overCredit: blockers.overCredit,
    reason: input.approvalReason.trim(),
    approver: input.approver.trim(),
    approvedAt: now.toISOString()
  };
}

/** 合同生效：冻结价格版本与授信占用额 */
export function activate(quote: Quote, now: Date): Quote {
  if (quote.status !== "draft") return quote;
  return {
    ...quote,
    status: "effective",
    frozenOccupied: quote.lockedPrice * quote.quantity,
    activatedAt: now.toISOString()
  };
}

/** 撤回：释放授信 */
export function withdraw(quote: Quote, now: Date): Quote {
  if (quote.status !== "effective") return quote;
  return {
    ...quote,
    status: "withdrawn",
    frozenOccupied: 0,
    withdrawnAt: now.toISOString()
  };
}

/** 到期回退：释放授信 */
export function expire(quote: Quote, now: Date): Quote {
  if (quote.status !== "effective") return quote;
  return {
    ...quote,
    status: "expired",
    frozenOccupied: 0,
    expiredAt: now.toISOString()
  };
}

/** 批量处理到期合同（endDate 早于今天即回退） */
export function sweepExpired(quotes: Quote[], today: string, now: Date): Quote[] {
  return quotes.map((q) =>
    q.status === "effective" && q.endDate < today ? expire(q, now) : q
  );
}

/**
 * 生效后价格冻结：不允许原地改价，
 * 任何改动都带原因追加为新版本；授信冻结额保持生效时快照不变。
 */
export function amendPrice(quote: Quote, input: AmendInput, now: Date): Quote {
  if (quote.status !== "effective") return quote;
  const price = Number(input.price);
  const reason = input.reason.trim();
  const operator = input.operator.trim();
  if (!(price > 0) || !reason || !operator) return quote;
  return {
    ...quote,
    lockedPrice: price,
    versions: [
      ...quote.versions,
      {
        version: quote.versions.length + 1,
        price,
        reason,
        operator,
        changedAt: now.toISOString()
      }
    ]
  };
}

/** 生成报价单编号：BJ-YYYYMMDD-序号 */
export function makeQuoteCode(today: Date, seq: number): string {
  const ymd = today.toISOString().slice(0, 10).replace(/-/g, "");
  return `BJ-${ymd}-${String(seq).padStart(3, "0")}`;
}
