import AppShell from "@/components/app/AppShell";

export default function Layout({ children }: { children: React.ReactNode }) {
  // Demo-safe: no auth gate here — middleware allows /app when Clerk keys are placeholders.
  return <AppShell>{children}</AppShell>;
}
