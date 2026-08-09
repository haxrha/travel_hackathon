"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Upload, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

type Doc = {
  id: string;
  name: string;
  size: number;
  extracted: { kind: string; title: string; detail: string }[];
  tripId?: string;
  createdAt: string | Date;
};

export default function InboxClient({ initialDocs }: { initialDocs: Doc[] }) {
  const [docs, setDocs] = useState(initialDocs);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/inbox");
    if (res.ok) {
      const data = await res.json();
      setDocs(data.docs ?? []);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function upload(file: File) {
    setBusy(true);
    setMessage(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/inbox", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setMessage(`Extracted into Travel Graph${data.tripId ? " · linked to active trip" : ""}`);
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) upload(file);
  }

  return (
    <div className="space-y-6">
      <section className="wp-card rounded-2xl p-8">
        <div className="wp-eyebrow">Vision capture</div>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "mt-4 rounded-xl border-2 border-dashed p-10 text-center transition",
            dragging ? "border-ember bg-ember/10" : "border-white/15 text-text-secondary",
          )}
        >
          <Upload className="mx-auto mb-3 text-ember" size={28} strokeWidth={1.5} />
          <p>Drop a screenshot of an itinerary, menu, or boarding pass</p>
          <p className="mt-1 text-xs text-text-tertiary">or choose a file from your device</p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="wp-cta inline-flex items-center gap-2 px-5 py-2.5 text-sm"
            >
              <FileText size={16} />
              {busy ? "Uploading…" : "Choose file"}
            </button>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept="image/*,.pdf,.png,.jpg,.jpeg,.webp"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
                e.target.value = "";
              }}
            />
          </div>
          {message && <p className="mt-4 text-sm text-ember">{message}</p>}
        </div>
      </section>

      <section className="space-y-3">
        <div className="wp-eyebrow">Parsed into graph</div>
        {docs.length === 0 ? (
          <div className="wp-card rounded-2xl p-8 text-center text-text-secondary">No documents yet.</div>
        ) : (
          docs.map((d) => (
            <div key={d.id} className="wp-card rounded-2xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{d.name}</div>
                  <div className="mt-1 text-xs text-text-tertiary">{Math.round(d.size / 1024)} KB</div>
                </div>
                {d.tripId && (
                  <Link href={`/app/trips/${d.tripId}`} className="wp-cta-ghost px-3 py-1.5 text-xs">
                    Open trip
                  </Link>
                )}
              </div>
              <ul className="mt-3 space-y-1 text-sm text-text-secondary">
                {d.extracted.map((x, i) => (
                  <li key={i}>
                    <span className="text-ember">{x.kind}</span> — {x.title}
                    <span className="text-text-tertiary"> · {x.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
