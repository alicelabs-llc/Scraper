
import React, { useEffect, useState } from 'react';
import { getLiveSignals, signalIcon, LiveSignal } from '../services/dataSources';
import { translations } from '../translations';
import { Language } from '../types';

/**
 * LiveSignals — FREE market radar. Reddit / Hacker News / Google Trends,
 * scraped keylessly (direct or via /api/signals when deployed on Vercel).
 * Works with ZERO configuration: the app shows real value before any API
 * key is entered. Fail-soft: if every source fails, the panel disappears.
 */

interface LiveSignalsProps {
  lang: Language;
  limit?: number;
}

const SOURCE_STYLES: Record<string, string> = {
  reddit: 'text-orange-400 border-orange-500/30 bg-orange-500/10',
  hackernews: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  googletrends: 'text-sky-400 border-sky-500/30 bg-sky-500/10',
};

const LiveSignals: React.FC<LiveSignalsProps> = ({ lang, limit = 6 }) => {
  const t = translations[lang];
  const [signals, setSignals] = useState<LiveSignal[] | null>(null);

  useEffect(() => {
    let alive = true;
    getLiveSignals().then((s) => { if (alive) setSignals(s); });
    return () => { alive = false; };
  }, []);

  if (signals !== null && signals.length === 0) return null; // honest: nothing scraped → no panel

  return (
    <div className="rounded-2xl border border-border bg-surface overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-emerald-500">radar</span>
          <div>
            <h3 className="text-white text-sm font-bold font-display uppercase tracking-wider">{t.signalsTitle}</h3>
            <p className="text-text-secondary text-[11px]">{t.signalsDesc}</p>
          </div>
        </div>
        <span className="flex items-center gap-1.5 text-[9px] font-black text-emerald-500 uppercase tracking-widest">
          <span className="size-1.5 bg-emerald-500 rounded-full animate-pulse"></span>{t.signalsLive}
        </span>
      </div>
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
        {(signals || Array.from({ length: limit }, () => null)).slice(0, limit).map((s, i) =>
          s ? (
            <a
              key={`${s.url}-${i}`}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="flex items-start gap-2 p-3 rounded-xl border border-border/60 bg-background/40 hover:border-primary/50 transition-all group"
            >
              <span className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded border text-[8px] font-black uppercase ${SOURCE_STYLES[s.source] || ''}`}>
                <span className="material-symbols-outlined text-[10px] mr-0.5">{signalIcon(s.source)}</span>
                {s.source === 'reddit' ? 'R' : s.source === 'hackernews' ? 'HN' : 'GT'}
              </span>
              <span className="text-[11px] text-text-secondary group-hover:text-white leading-snug line-clamp-2">
                {s.title}
              </span>
              <span className="ml-auto shrink-0 text-[9px] font-mono text-text-secondary/60">{s.score}</span>
            </a>
          ) : (
            <div key={i} className="h-[52px] rounded-xl bg-surface-light/40 animate-pulse"></div>
          )
        )}
      </div>
    </div>
  );
};

export default LiveSignals;
