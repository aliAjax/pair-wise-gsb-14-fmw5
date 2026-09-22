// 状态层：连接规则与存储的 Pinia store，界面只与它交互
import { computed, ref } from "vue";
import { defineStore } from "pinia";
import type {
  ActionResult,
  ConflictItem,
  DeskData,
  PriceChangeInput,
  Quote,
  QuoteInput
} from "./types";
import {
  blockingConflicts,
  creditBoard,
  occupiedCredit,
  quoteAmount,
  rollExpired,
  round2,
  scanConflicts,
  validatePriceChange,
  validateQuote
} from "./rules";
import { storage } from "./storage";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function nextQuoteNo(quotes: Quote[]): string {
  const prefix = `BJ-${new Date().toISOString().slice(0, 7).replace("-", "")}-`;
  const max = quotes
    .filter((q) => q.quoteNo.startsWith(prefix))
    .reduce((m, q) => Math.max(m, Number(q.quoteNo.slice(prefix.length)) || 0), 0);
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

export const useDeskStore = defineStore("lockPriceDesk", () => {
  const data = ref<DeskData>(storage.load());
  const today = ref(todayStr());
  /** 最近一次操作产生的冲突，供界面置顶提示 */
  const lastConflicts = ref<ConflictItem[]>([]);

  const customers = computed(() => data.value.customers);
  const fuels = computed(() => data.value.fuels);
  const quotes = computed(() => data.value.quotes);

  const customerMap = computed(() => new Map(customers.value.map((c) => [c.id, c])));
  const fuelMap = computed(() => new Map(fuels.value.map((f) => [f.id, f])));

  function persist() {
    storage.save(data.value);
  }

  /** 刷新：重新落库读取并执行到期回退，保证报价、占用、版本链一致 */
  function refresh() {
    today.value = todayStr();
    const loaded = storage.load();
    const rolled = rollExpired(loaded.quotes, today.value);
    if (rolled !== loaded.quotes) {
      loaded.quotes = rolled;
      storage.save(loaded);
    }
    data.value = loaded;
    lastConflicts.value = scanConflicts(loaded.customers, loaded.fuels, loaded.quotes, today.value);
  }

  function resetAll() {
    data.value = storage.reset();
    lastConflicts.value = [];
  }

  /** 登记报价单：整单先落草稿；低于成本线/超授信且无依据等阻断冲突会被带回 */
  function registerQuote(input: QuoteInput): ActionResult {
    const conflicts = validateQuote(input, data.value, today.value);
    const quote: Quote = {
      id: crypto.randomUUID(),
      quoteNo: nextQuoteNo(data.value.quotes),
      customerId: input.customerId,
      fuelId: input.fuelId,
      lockedPrice: round2(Number(input.lockedPrice) || 0),
      quantity: Number(input.quantity) || 0,
      startDate: input.startDate,
      endDate: input.endDate,
      operator: input.operator || "未填写",
      approvalBasis: input.approvalBasis.trim(),
      status: "draft",
      createdAt: new Date().toISOString(),
      versions: []
    };
    data.value.quotes = [quote, ...data.value.quotes];
    persist();
    lastConflicts.value = conflicts;
    return { ok: blockingConflicts(conflicts).length === 0, conflicts };
  }

  /** 合同生效：校验通过才占用授信，写入 v1 冻结快照；否则整单留草稿 */
  function activateQuote(id: string): ActionResult {
    const quote = data.value.quotes.find((q) => q.id === id);
    if (!quote || quote.status !== "draft") {
      return { ok: false, conflicts: lastConflicts.value };
    }
    const conflicts = validateQuote(
      {
        id: quote.id,
        customerId: quote.customerId,
        fuelId: quote.fuelId,
        lockedPrice: quote.lockedPrice,
        quantity: quote.quantity,
        startDate: quote.startDate,
        endDate: quote.endDate,
        operator: quote.operator,
        approvalBasis: quote.approvalBasis
      },
      data.value,
      today.value
    );
    if (blockingConflicts(conflicts).length > 0) {
      lastConflicts.value = conflicts;
      return { ok: false, conflicts };
    }
    const nowIso = new Date().toISOString();
    quote.status = "active";
    quote.activatedAt = nowIso;
    quote.versions = [
      {
        version: 1,
        lockedPrice: quote.lockedPrice,
        quantity: quote.quantity,
        reason: "合同生效初始锁价",
        approvalBasis: quote.approvalBasis,
        operator: quote.operator,
        changedAt: nowIso
      }
    ];
    persist();
    lastConflicts.value = scanConflicts(data.value.customers, data.value.fuels, data.value.quotes, today.value);
    return { ok: true, conflicts: lastConflicts.value };
  }

  /** 撤回：立即释放授信 */
  function withdrawQuote(id: string): ActionResult {
    const quote = data.value.quotes.find((q) => q.id === id);
    if (!quote || quote.status !== "active") return { ok: false, conflicts: [] };
    quote.status = "withdrawn";
    quote.withdrawnAt = new Date().toISOString();
    persist();
    lastConflicts.value = scanConflicts(data.value.customers, data.value.fuels, data.value.quotes, today.value);
    return { ok: true, conflicts: lastConflicts.value };
  }

  /** 生效后价格/数量冻结，改动必须带原因，另存一个版本 */
  function changePrice(id: string, change: PriceChangeInput): ActionResult {
    const quote = data.value.quotes.find((q) => q.id === id);
    if (!quote || quote.status !== "active") return { ok: false, conflicts: [] };
    const conflicts = validatePriceChange(quote, change, data.value);
    if (blockingConflicts(conflicts).length > 0) {
      lastConflicts.value = conflicts;
      return { ok: false, conflicts };
    }
    quote.lockedPrice = round2(Number(change.lockedPrice));
    quote.quantity = Number(change.quantity);
    quote.approvalBasis = change.approvalBasis.trim() || quote.approvalBasis;
    quote.versions.push({
      version: quote.versions.length + 1,
      lockedPrice: quote.lockedPrice,
      quantity: quote.quantity,
      reason: change.reason.trim(),
      approvalBasis: change.approvalBasis.trim(),
      operator: change.operator || quote.operator,
      changedAt: new Date().toISOString()
    });
    persist();
    lastConflicts.value = scanConflicts(data.value.customers, data.value.fuels, data.value.quotes, today.value);
    return { ok: true, conflicts: lastConflicts.value };
  }

  /** 删除草稿/已撤回单（生效单不可删，只能撤回） */
  function removeQuote(id: string) {
    data.value.quotes = data.value.quotes.filter((q) => q.id !== id);
    persist();
  }

  function occupiedOf(customerId: string): number {
    return occupiedCredit(data.value.quotes, customerId, today.value);
  }

  function amountOf(quote: Quote): number {
    return quoteAmount(quote);
  }

  const globalConflicts = computed(() =>
    scanConflicts(data.value.customers, data.value.fuels, data.value.quotes, today.value)
  );

  const metrics = computed(() => {
    const qs = data.value.quotes;
    const active = qs.filter((q) => q.status === "active");
    const draft = qs.filter((q) => q.status === "draft");
    const board = creditBoard(data.value.customers, data.value.quotes, today.value);
    const occupied = round2(board.reduce((sum, row) => sum + row.occupied, 0));
    return { total: qs.length, active: active.length, draft: draft.length, occupied };
  });

  return {
    data,
    today,
    lastConflicts,
    customers,
    fuels,
    quotes,
    customerMap,
    fuelMap,
    globalConflicts,
    metrics,
    refresh,
    resetAll,
    registerQuote,
    activateQuote,
    withdrawQuote,
    changePrice,
    removeQuote,
    occupiedOf,
    amountOf
  };
});
