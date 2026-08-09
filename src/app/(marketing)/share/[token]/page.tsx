import { getShare, shareMarkdown } from "@/lib/share/trip";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const share = getShare(token);
  if (!share) notFound();
  const md = shareMarkdown(share);

  return (
    <main className="min-h-screen bg-[#140e0c] px-6 py-16 text-white">
      <div className="mx-auto max-w-2xl space-y-8">
        <div>
          <p className="text-[10px] uppercase tracking-[0.28em] text-ember">WAYPORT proposal</p>
          <h1 className="mt-3 font-display text-4xl">{share.title}</h1>
          <p className="mt-2 text-text-secondary">{share.destination}</p>
          <p className="mt-4 text-sm text-text-secondary">{share.summary}</p>
          <p className="mt-3 text-ember">Total est. ${Math.round(share.grandTotalUsd)}</p>
        </div>

        <ol className="space-y-3 border-t border-white/10 pt-6">
          {share.items.map((it, i) => (
            <li key={i} className="flex justify-between gap-4 text-sm">
              <span>
                <span className="text-text-tertiary">{it.kind}</span> · {it.title}
              </span>
              {it.priceUsd != null && <span className="text-ember">${it.priceUsd}</span>}
            </li>
          ))}
        </ol>

        {share.quality && (
          <div className="border-t border-white/10 pt-6">
            <p className="text-[10px] uppercase tracking-[0.22em] text-text-tertiary">Quality vector</p>
            <ul className="mt-3 grid grid-cols-2 gap-2 text-sm text-text-secondary">
              {Object.entries(share.quality).map(([k, v]) => (
                <li key={k}>
                  {k}: {typeof v === "number" ? Math.round(v * 100) / 100 : String(v)}
                </li>
              ))}
            </ul>
          </div>
        )}

        <details className="border-t border-white/10 pt-6 text-sm text-text-secondary">
          <summary className="cursor-pointer text-ember">Export markdown</summary>
          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-xl bg-black/40 p-4 font-mono text-xs">{md}</pre>
        </details>

        <Link href="/app" className="inline-block text-sm text-ember underline-offset-4 hover:underline">
          Open WAYPORT →
        </Link>
      </div>
    </main>
  );
}
