export function formatMoney(value: number): string {
  return `¥${Math.round(value).toLocaleString("zh-CN")}`;
}

export function formatNumber(value: number): string {
  return value.toLocaleString("zh-CN");
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return iso.replace("T", " ").slice(0, 16);
}
