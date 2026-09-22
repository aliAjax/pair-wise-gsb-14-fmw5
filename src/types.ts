/**
 * 领域模型：批发锁价与信用占用台
 * 只描述数据结构，不包含任何规则、存储与界面逻辑。
 */

/** 报价单状态：草稿 → 生效 →（撤回 | 到期） */
export type QuoteStatus = "draft" | "effective" | "withdrawn" | "expired";

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: "草稿",
  effective: "生效中",
  withdrawn: "已撤回",
  expired: "已到期"
};

/** 客户档案：授信额度单位为元 */
export interface Customer {
  id: string;
  name: string;
  creditLimit: number;
}

/** 油品档案：成本线/挂牌价单位为元/吨 */
export interface Product {
  id: string;
  name: string;
  unit: string;
  costLine: number;
  listPrice: number;
}

/** 锁定价版本：v1 为登记/生效快照，生效后改价只追加新版本 */
export interface PriceVersion {
  version: number;
  price: number;
  reason: string;
  operator: string;
  changedAt: string;
}

/** 审批依据：低于成本线或超授信时必须留存 */
export interface ApprovalNote {
  belowCost: boolean;
  overCredit: boolean;
  reason: string;
  approver: string;
  approvedAt: string;
}

/** 报价单（锁价合同） */
export interface Quote {
  id: string;
  code: string;
  customerId: string;
  productId: string;
  /** 当前锁定价（元/吨）；生效后只随版本链追加而变化 */
  lockedPrice: number;
  quantity: number;
  startDate: string;
  endDate: string;
  operator: string;
  notes: string;
  status: QuoteStatus;
  approval: ApprovalNote | null;
  versions: PriceVersion[];
  /** 生效时冻结的授信占用额 = 生效锁定价 × 数量，撤回/到期前不随改价变化 */
  frozenOccupied: number;
  createdAt: string;
  activatedAt: string | null;
  withdrawnAt: string | null;
  expiredAt: string | null;
}

/** 登记表单输入 */
export interface QuoteInput {
  customerId: string;
  productId: string;
  lockedPrice: number;
  quantity: number;
  startDate: string;
  endDate: string;
  operator: string;
  notes: string;
  approvalReason: string;
  approver: string;
}

/** 改价输入（生效后价格冻结，改动须另存原因版本） */
export interface AmendInput {
  price: number;
  reason: string;
  operator: string;
}

export interface AppState {
  customers: Customer[];
  products: Product[];
  quotes: Quote[];
}
