"use client";

import type { LocalnessScore } from "@/lib/discovery/localness";

export default function LocalnessCard({ spot }: { spot: LocalnessScore }) {
  const b = spot.breakdown;
  return (
    <article className="wp-card flex flex-col rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-xl leading-snug">{spot.title}</h2>
        <div className="shrink-0 text-right">
          <div className="text-[10px] uppercase tracking-widest text-text-tertiary">Localness</div>
          <div className="font-display text-3xl text-ember">{spot.score}</div>
        </div>
      </div>

      <p className="mt-3 text-sm text-text-secondary">{spot.blurb}</p>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-text-secondary">
        <div className="flex justify-between gap-2 border-b border-white/5 pb-1">
          <dt>Tourist density</dt>
          <dd className="text-white/80">{b.touristDensity}</dd>
        </div>
        <div className="flex justify-between gap-2 border-b border-white/5 pb-1">
          <dt>Local review ratio</dt>
          <dd className="text-white/80">{b.localReviewRatio}</dd>
        </div>
        <div className="flex justify-between gap-2 border-b border-white/5 pb-1">
          <dt>Chain probability</dt>
          <dd className="text-white/80">{b.chainProbability}%</dd>
        </div>
        <div className="flex justify-between gap-2 border-b border-white/5 pb-1">
          <dt>Creator mentions</dt>
          <dd className="text-white/80">{b.creatorMentions}</dd>
        </div>
        <div className="flex justify-between gap-2 border-b border-white/5 pb-1">
          <dt>Neighborhood fit</dt>
          <dd className="text-white/80">{b.neighborhoodFit}</dd>
        </div>
        <div className="flex justify-between gap-2 border-b border-white/5 pb-1">
          <dt>Distance</dt>
          <dd className="text-white/80">{b.distanceMinutes} min</dd>
        </div>
      </dl>

      {spot.url && spot.url !== "#" && (
        <a href={spot.url} target="_blank" rel="noreferrer" className="mt-4 text-xs text-ember hover:underline">
          Source →
        </a>
      )}
    </article>
  );
}
