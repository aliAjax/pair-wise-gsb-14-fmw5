import type { AppState, Quote } from "../types";
import { rangesOverlap } from "./domain";

/**
 * 规则层：冲突视图。
 * 刷新后依据持久化状态重新推导，输出两类冲突行，
 * 每行都带齐“客户、油品、数量、额度”四要素。
 */

export interface CreditSummary {
  customerId: string;
  customerName: string;
  limit: number;
  occupied: number;
  available: number;
  ratio: number;
  overLimit: boolean;
  quantity: number;
}

export type ConflictKind = "overlap" | "credit";

export interface ConflictRow {
  id: string;
  kind: ConflictKind;
  customerName: string;
  productName: string;
  /** 涉及数量（吨） */
  quantity: number;
  /** 涉及额度（元） */
  amount: number;
  detail: string;
  quoteIds: string[];
}

export function creditSummaries(state: AppState): CreditSummary[] {
  return state.customers.map((customer) => {
    const effective = state.quotes.filter(
      (q) => q.customerId === customer.id && q.status === "effective"
    );
    const occupied = effective.reduce((sum, q) => sum + q.frozenOccupied, 0);
    const quantity = effective.reduce((sum, q) => sum + q.quantity, 0);
    return {
      customerId: customer.id,
      customerName: customer.name,
      limit: customer.creditLimit,
      occupied,
      available: customer.creditLimit - occupied,
      ratio: customer.creditLimit > 0 ? occupied / customer.creditLimit : 0,
      overLimit: occupied > customer.creditLimit,
      quantity
    };
  });
}

function describeQuote(quote: Quote, state: AppState): string {
  const product = state.products.find((p) => p.id === quote.productId);
  return [
    quote.code,
    `${quote.startDate}~${quote.endDate}`,
    `${quote.quantity}${product?.unit ?? "吨"}`,
    `¥${Math.round(quote.frozenOccupied || quote.lockedPrice * quote.quantity).toLocaleString("zh-CN")}`
  ].join(" / ");
}

export function buildConflicts(state: AppState): ConflictRow[] {
  const rows: ConflictRow[] = [];
  const openQuotes = state.quotes.filter((q) => q.status === "draft" || q.status === "effective");

  // 一、时段重叠：同客户同油品、闭区间相交（端点相接即冲突）
  for (let i = 0; i < openQuotes.length; i++) {
    for (let j = i + 1; j < openQuotes.length; j++) {
      const a = openQuotes[i];
      const b = openQuotes[j];
      if (a.customerId !== b.customerId || a.productId !== b.productId) continue;
      if (!rangesOverlap(a.startDate, a.endDate, b.startDate, b.endDate)) continue;
      const customer = state.customers.find((c) => c.id === a.customerId);
      const product = state.products.find((p) => p.id === a.productId);
      rows.push({
        id: `overlap-${a.id}-${b.id}`,
        kind: "overlap",
        customerName: customer?.name ?? a.customerId,
        productName: product?.name ?? a.productId,
        quantity: a.quantity + b.quantity,
        amount: a.lockedPrice * a.quantity + b.lockedPrice * b.quantity,
        detail: [describeQuote(a, state), describeQuote(b, state)].join(" ；"),
        quoteIds: [a.id, b.id]
      });
    }
  }

  // 二、授信超限：生效中合同冻结额度合计超过授信
  for (const summary of creditSummaries(state)) {
    if (!summary.overLimit) continue;
    rows.push({
      id: `credit-${summary.customerId}`,
      kind: "credit",
      customerName: summary.customerName,
      productName: "全部生效油品",
      quantity: summary.quantity,
      amount: summary.occupied,
      detail: `占用 ¥${summary.occupied.toLocaleString("zh-CN")} / 授信 ¥${summary.limit.toLocaleString(
        "zh-CN"
      )}，超限 ¥${(summary.occupied - summary.limit).toLocaleString("zh-CN")}`,
      quoteIds: state.quotes
        .filter((q) => q.customerId === summary.customerId && q.status === "effective")
        .map((q) => q.id)
    });
  }

  return rows;
}
