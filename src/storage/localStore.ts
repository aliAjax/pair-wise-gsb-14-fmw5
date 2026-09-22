import type { AppState } from "../types";
import { buildSeedState } from "../data/seed";

/**
 * 存储层：只管 localStorage 序列化与版本迁移，
 * 不包含任何业务规则。规则层不感知持久化细节。
 */

const STORAGE_KEY = "dfwlfront-9-lock-price-v1";

export function loadState(now: Date = new Date()): AppState {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    raw = null;
  }
  if (!raw) return buildSeedState(now);
  try {
    const parsed = JSON.parse(raw) as AppState;
    if (!parsed || !Array.isArray(parsed.quotes) || !Array.isArray(parsed.customers)) {
      return buildSeedState(now);
    }
    return normalize(parsed);
  } catch {
    return buildSeedState(now);
  }
}

/** 基础字段兜底：旧版本数据缺少新增字段时补默认值，保证刷新后结构一致 */
function normalize(state: AppState): AppState {
  const quotes: AppState["quotes"] = (state.quotes ?? []).map((q) => {
    const quote: AppState["quotes"][number] = {
      ...q,
      approval: q.approval ?? null,
      frozenOccupied: q.status === "effective" ? q.frozenOccupied ?? 0 : 0,
      versions: q.versions ?? [],
      activatedAt: q.activatedAt ?? null,
      withdrawnAt: q.withdrawnAt ?? null,
      expiredAt: q.expiredAt ?? null,
      notes: q.notes ?? ""
    };
    return quote;
  });
  return {
    customers: state.customers ?? [],
    products: state.products ?? [],
    quotes
  };
}

export function saveState(state: AppState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function resetState(now: Date = new Date()): AppState {
  const seed = buildSeedState(now);
  saveState(seed);
  return seed;
}
