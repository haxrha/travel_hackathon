import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | string, currency = "USD"): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(num);
}

export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (Math.abs(diffMin) < 1) return "now";
  if (Math.abs(diffMin) < 60) return `${Math.abs(diffMin)}m ${diffMin > 0 ? "ahead" : "ago"}`;
  const diffHr = Math.round(diffMin / 60);
  if (Math.abs(diffHr) < 24) return `${Math.abs(diffHr)}h ${diffHr > 0 ? "ahead" : "ago"}`;
  const diffDay = Math.round(diffHr / 24);
  return `${Math.abs(diffDay)}d ${diffDay > 0 ? "ahead" : "ago"}`;
}
