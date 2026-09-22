import { defineStore } from "pinia";
import type { AppState, Quote, QuoteInput, AmendInput } from "../types";
import {
  activate,
  amendPrice,
  buildApproval,
  canActivate,
  evaluate,
  makeQuoteCode,
  sweepExpired,
  withdraw,
  type Blockers
} from "../rules/domain";
import { buildConflicts, creditSummaries } from "../rules/conflicts";
import { loadState, resetState, saveState } from "../storage/localStore";

/**
 * 状态中枢：只做编排——调用规则层纯函数、落盘存储层，
 * 界面组件不直接改 localStorage，也不内联业务规则。
 */

export interface ActionResult {
  ok: boolean;
  messages: string[];
  quoteId?: string;
}

function todayString(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export const useQuoteStore = defineStore("lock-price", {
  state: () => {
    const now = new Date();
    const today = todayString(now);
    // 刷新即一致性整理：到期合同回退释放；非生效合同不得残留冻结额度
    const loaded: AppState = (() => {
      const initial = loadState(now);
      const sweptQuotes = sweepExpired(initial.quotes, today, now);
      return {
        ...initial,
        quotes: sweptQuotes.map((q) =>
          q.status === "effective" ? q : { ...q, frozenOccupied: 0 }
        )
      };
    })();
    saveState(loaded);
    return { ...loaded, today, lastResult: null as ActionResult | null, editingId: null as string | null };
  },

  getters: {
    customerById: (state) => (id: string) => state.customers.find((c) => c.id === id),
    productById: (state) => (id: string) => state.products.find((p) => p.id === id),
    quoteById: (state) => (id: string) => state.quotes.find((q) => q.id === id),
    sortedQuotes(state): Quote[] {
      return [...state.quotes].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    },
    credits(state) {
      return creditSummaries({
        customers: state.customers,
        products: state.products,
        quotes: state.quotes
      });
    },
    conflicts(state) {
      return buildConflicts({
        customers: state.customers,
        products: state.products,
        quotes: state.quotes
      });
    },
    metrics(state) {
      const effective = state.quotes.filter((q) => q.status === "effective");
      return {
        total: state.quotes.length,
        effective: effective.length,
        draft: state.quotes.filter((q) => q.status === "draft").length,
        occupied: effective.reduce((sum, q) => sum + q.frozenOccupied, 0)
      };
    }
  },

  actions: {
    persist() {
      saveState({ customers: this.customers, products: this.products, quotes: this.quotes });
    },

    evaluateInput(input: QuoteInput, selfId?: string, activeOverlapOnly = false) {
      return evaluate(input, {
        quotes: this.quotes,
        customers: this.customers,
        products: this.products,
        selfId,
        activeOverlapOnly
      });
    },

    nextCode(): string {
      const ymd = this.today.replace(/-/g, "");
      const sameDay = this.quotes.filter((q) => q.code.includes(ymd)).length;
      return makeQuoteCode(new Date(this.today + "T00:00:00"), sameDay + 1);
    },

    /** 登记报价单：校验未通过的整单一律落为草稿，并回带阻断原因 */
    register(input: QuoteInput): ActionResult {
      const blockers = this.evaluateInput(input);
      const now = new Date();
      const quote: Quote = {
        id: crypto.randomUUID(),
        code: this.nextCode(),
        customerId: input.customerId,
        productId: input.productId,
        lockedPrice: Number(input.lockedPrice) || 0,
        quantity: Number(input.quantity) || 0,
        startDate: input.startDate,
        endDate: input.endDate,
        operator: input.operator.trim(),
        notes: input.notes.trim(),
        status: "draft",
        approval: buildApproval(input, blockers, now),
        versions: [
          {
            version: 1,
            price: Number(input.lockedPrice) || 0,
            reason: "登记锁价（草稿）",
            operator: input.operator.trim() || "—",
            changedAt: now.toISOString()
          }
        ],
        frozenOccupied: 0,
        createdAt: now.toISOString(),
        activatedAt: null,
        withdrawnAt: null,
        expiredAt: null
      };
      this.quotes.unshift(quote);
      this.persist();

      const ok = canActivate(blockers);
      const messages = canActivate(blockers)
        ? ["资料齐备，可提交生效（生效后占用授信并冻结价格）"]
        : ["整单已留草稿", ...describeBlockers(blockers)];
      this.lastResult = { ok, messages, quoteId: quote.id };
      return this.lastResult;
    },

    /** 载入草稿到表单进行编辑 */
    startEdit(id: string): boolean {
      const quote = this.quotes.find((q) => q.id === id);
      if (!quote || quote.status !== "draft") return false;
      this.editingId = id;
      return true;
    },

    cancelEdit(): void {
      this.editingId = null;
    },

    /** 草稿编辑：仅草稿可改字段，改后同样可能留在草稿 */
    updateDraft(id: string, input: QuoteInput): ActionResult {
      const quote = this.quotes.find((q) => q.id === id);
      if (!quote || quote.status !== "draft") {
        this.lastResult = { ok: false, messages: ["仅草稿状态的报价单可以编辑"] };
        return this.lastResult;
      }
      const blockers = this.evaluateInput(input, id);
      Object.assign(quote, {
        customerId: input.customerId,
        productId: input.productId,
        lockedPrice: Number(input.lockedPrice) || 0,
        quantity: Number(input.quantity) || 0,
        startDate: input.startDate,
        endDate: input.endDate,
        operator: input.operator.trim(),
        notes: input.notes.trim(),
        approval: buildApproval(input, blockers, new Date())
      });
      this.persist();
      const messages = canActivate(blockers)
        ? ["草稿已更新，可提交生效"]
        : ["草稿已更新，仍存在阻断项", ...describeBlockers(blockers)];
      this.lastResult = { ok: canActivate(blockers), messages, quoteId: id };
      return this.lastResult;
    },

    /** 生效：合同生效才占用授信；阻断项存在则继续留草稿 */
    activate(id: string): ActionResult {
      const quote = this.quotes.find((q) => q.id === id);
      if (!quote) return { ok: false, messages: ["报价单不存在"] };
      if (quote.status !== "draft") {
        this.lastResult = { ok: false, messages: ["只有草稿可以提交生效"], quoteId: id };
        return this.lastResult;
      }
      const input = toInput(quote);
      const blockers = this.evaluateInput(input, id, true);
      if (!canActivate(blockers)) {
        this.persist();
        this.lastResult = {
          ok: false,
          messages: ["生效被拦截，整单继续留草稿", ...describeBlockers(blockers)],
          quoteId: id
        };
        return this.lastResult;
      }
      Object.assign(quote, activate(quote, new Date()));
      this.persist();
      this.lastResult = {
        ok: true,
        messages: [
          `合同已生效，授信占用 ¥${quote.frozenOccupied.toLocaleString("zh-CN")}（已冻结），价格同步冻结`
        ],
        quoteId: id
      };
      return this.lastResult;
    },

    /** 撤回：释放授信 */
    withdraw(id: string): ActionResult {
      const quote = this.quotes.find((q) => q.id === id);
      if (!quote || quote.status !== "effective") {
        this.lastResult = { ok: false, messages: ["只有生效中的合同可以撤回"], quoteId: id };
        return this.lastResult;
      }
      const released = quote.frozenOccupied;
      Object.assign(quote, withdraw(quote, new Date()));
      this.persist();
      this.lastResult = {
        ok: true,
        messages: [`合同已撤回，释放授信 ¥${released.toLocaleString("zh-CN")}`],
        quoteId: id
      };
      return this.lastResult;
    },

    /** 改价：生效后价格冻结，改动只能另存原因版本 */
    amend(id: string, input: AmendInput): ActionResult {
      const quote = this.quotes.find((q) => q.id === id);
      if (!quote || quote.status !== "effective") {
        this.lastResult = { ok: false, messages: ["只有生效中的合同可以登记改价版本"] };
        return this.lastResult;
      }
      if (!(Number(input.price) > 0) || !input.reason.trim() || !input.operator.trim()) {
        this.lastResult = { ok: false, messages: ["改价版本必须填写新价格、原因和经办人"] };
        return this.lastResult;
      }
      const before = quote.lockedPrice;
      Object.assign(quote, amendPrice(quote, input, new Date()));
      this.persist();
      this.lastResult = {
        ok: true,
        messages: [
          `已追加版本 v${quote.versions.length}：¥${before} → ¥${quote.lockedPrice}；授信冻结额不变（¥${quote.frozenOccupied.toLocaleString("zh-CN")}）`
        ],
        quoteId: id
      };
      return this.lastResult;
    },

    /** 刷新/手动巡检：到期合同回退授信 */
    refresh(): ActionResult {
      const now = new Date();
      const before = this.quotes.filter((q) => q.status === "effective").length;
      this.quotes = sweepExpired(this.quotes, this.today, now);
      this.quotes = this.quotes.map((q) =>
        q.status === "effective" ? q : { ...q, frozenOccupied: 0 }
      );
      this.persist();
      const after = this.quotes.filter((q) => q.status === "effective").length;
      this.lastResult = {
        ok: true,
        messages: [
          `刷新完成：${before - after} 张到期合同已回退授信，报价、占用与版本链已重新对齐`
        ]
      };
      return this.lastResult;
    },

    remove(id: string): ActionResult {
      const quote = this.quotes.find((q) => q.id === id);
      if (quote?.status === "effective") {
        this.lastResult = { ok: false, messages: ["生效中合同不可删除，请先撤回"] };
        return this.lastResult;
      }
      this.quotes = this.quotes.filter((q) => q.id !== id);
      this.persist();
      this.lastResult = { ok: true, messages: ["报价单已删除"] };
      return this.lastResult;
    },

    resetDemo(): ActionResult {
      const state = resetState(new Date());
      this.customers = state.customers;
      this.products = state.products;
      this.quotes = state.quotes;
      this.lastResult = { ok: true, messages: ["已恢复演示数据"] };
      return this.lastResult;
    }
  }
});

function describeBlockers(blockers: Blockers) {
  const messages: string[] = [];
  if (blockers.missingFields.length) messages.push(`请补全：${blockers.missingFields.join("、")}`);
  if (blockers.badInterval) messages.push("生效区间不合法（结束日期不得早于开始日期）");
  if (blockers.overlaps.length) {
    messages.push(
      `同客户同油品时段与 ${blockers.overlaps.length} 张报价单重叠（${blockers.overlaps
        .map((q) => q.code)
        .join("、")}）`
    );
  }
  if (blockers.belowCost) messages.push("锁定价低于成本线，须审批依据");
  if (blockers.overCredit) messages.push("生效后将超出授信额度，须审批依据");
  if (blockers.missingApproval) messages.push("请填写审批依据与审批人，否则整单留草稿");
  return messages;
}

/** 生效复核时从既有报价单还原登记输入（审批依据取留档内容） */
function toInput(quote: Quote): QuoteInput {
  return {
    customerId: quote.customerId,
    productId: quote.productId,
    lockedPrice: quote.lockedPrice,
    quantity: quote.quantity,
    startDate: quote.startDate,
    endDate: quote.endDate,
    operator: quote.operator,
    notes: quote.notes,
    approvalReason: quote.approval?.reason ?? "",
    approver: quote.approval?.approver ?? ""
  };
}
