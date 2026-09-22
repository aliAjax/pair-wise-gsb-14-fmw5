// 数据层：批发锁价与信用占用台的领域模型（纯类型，不含任何逻辑）

export type QuoteStatus = "draft" | "active" | "withdrawn" | "expired";

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: "草稿",
  active: "生效中",
  withdrawn: "已撤回",
  expired: "已到期"
};

/** 客户与授信额度 */
export interface Customer {
  id: string;
  name: string;
  /** 授信额度（元） */
  creditLimit: number;
}

/** 油品与成本线 */
export interface Fuel {
  id: string;
  name: string;
  unit: string;
  /** 成本线（元/单位），低于此价锁价须审批依据 */
  costPrice: number;
  /** 挂牌价（元/单位） */
  listPrice: number;
}

/**
 * 价格版本：合同生效时写入 v1 初始快照；
 * 生效后价格/数量被冻结，任何改动都必须带原因另存一条版本。
 */
export interface PriceVersion {
  version: number;
  lockedPrice: number;
  quantity: number;
  reason: string;
  approvalBasis: string;
  operator: string;
  changedAt: string;
}

/** 批发锁价报价单 */
export interface Quote {
  id: string;
  quoteNo: string;
  customerId: string;
  fuelId: string;
  /** 锁定价（元/单位） */
  lockedPrice: number;
  /** 锁价数量 */
  quantity: number;
  /** 生效起始日 yyyy-mm-dd */
  startDate: string;
  endDate: string;
  operator: string;
  /** 审批依据：低于成本线或超授信时必填 */
  approvalBasis: string;
  status: QuoteStatus;
  createdAt: string;
  activatedAt?: string;
  withdrawnAt?: string;
  expiredAt?: string;
  /** 版本链，仅生效后存在，v1 为生效快照 */
  versions: PriceVersion[];
}

/** 落库根对象 */
export interface DeskData {
  customers: Customer[];
  fuels: Fuel[];
  quotes: Quote[];
}

export type ConflictKind = "overlap" | "belowCost" | "overCredit" | "invalidRange";

export const CONFLICT_KIND_LABEL: Record<ConflictKind, string> = {
  overlap: "时段重叠",
  belowCost: "低于成本线",
  overCredit: "超出授信",
  invalidRange: "区间/数值无效"
};

/** 一条阻断或提示性冲突，列表固定列出客户、油品、数量、额度 */
export interface ConflictItem {
  kind: ConflictKind;
  blocking: boolean;
  quoteId: string;
  quoteNo: string;
  customerId: string;
  customerName: string;
  fuelId: string;
  fuelName: string;
  quantity: number;
  /** 涉及额度 = 锁定价 × 数量（元） */
  amount: number;
  detail: string;
}

/** 报价单表单输入 */
export interface QuoteInput {
  id?: string;
  customerId: string;
  fuelId: string;
  lockedPrice: number;
  quantity: number;
  startDate: string;
  endDate: string;
  operator: string;
  approvalBasis: string;
}

/** 生效后调价输入（改动另存原因版本） */
export interface PriceChangeInput {
  lockedPrice: number;
  quantity: number;
  reason: string;
  approvalBasis: string;
  operator: string;
}

export interface ActionResult {
  ok: boolean;
  conflicts: ConflictItem[];
}
