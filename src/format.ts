// 界面层辅助：仅做展示格式化
export function money(n: number): string {
  return "¥" + (n || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

export function num(n: number): string {
  return (n || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

export function dt(iso?: string): string {
  if (!iso) return "—";
  return iso.replace("T", " ").slice(0, 16);
}
