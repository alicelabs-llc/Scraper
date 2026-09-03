
import React, { useState, useEffect } from 'react';
import { loadCompare, removeFromCompare, clearCompare, COMPARE_EVENT, MAX_COMPARE } from '../services/compare';
import { evaluateDomain } from '../services/sourceTrust';
import { compareProducts } from '../services/geminiService';
import { Language, WinningProduct } from '../types';
import { translations } from '../translations';

/**
 * Compare — side-by-side verdict for up to 3 saved products.
 * Deterministic metrics locally (price, margin, trend, UTA trust score) plus
 * an optional AI verdict through the currently configured provider.
 */

interface CompareProps {
  lang: Language;
  onAnalyzeProduct?: (product: WinningProduct) => void;
}

const TRUST_COLORS: Record<string, string> = {
  trusted: 'text-sky-400',
  unknown: 'text-text-secondary',
  caution: 'text-amber-400',
  risky: 'text-red-400',
};

const Compare: React.FC<CompareProps> = ({ lang, onAnalyzeProduct }) => {
  const t = translations[lang];
  const [items, setItems] = useState<WinningProduct[]>([]);
  const [verdict, setVerdict] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => setItems(loadCompare());
    refresh();
    window.addEventListener(COMPARE_EVENT, refresh);
    return () => window.removeEventListener(COMPARE_EVENT, refresh);
  }, []);

  const handleVerdict = async () => {
    if (items.length < 2) return;
    setLoading(true);
    setError(null);
    setVerdict(null);
    try {
      const text = await compareProducts(
        items.map((p) => ({
          name: p.name,
          niche: p.niche,
          priceEstimate: p.priceEstimate,
          potentialMargin: p.potentialMargin,
          trendScore: Number(p.trendScore) || 0,
        })),
        lang
      );
      setVerdict(text);
    } catch (err) {
      setError(String((err as Error)?.message || err).slice(0, 200));
    } finally {
      setLoading(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="p-8 max-w-[1600px] mx-auto animate-in fade-in duration-500">
        <h2 className="text-3xl font-bold text-white font-display mb-2">{t.compareTitle}</h2>
        <div className="bg-surface border border-border rounded-2xl p-16 mt-8 text-center">
          <span className="material-symbols-outlined text-6xl text-text-secondary/40 mb-6 block">compare_arrows</span>
          <p className="text-white font-bold text-lg">{t.compareEmpty}</p>
          <p className="text-text-secondary text-sm mt-3 max-w-md mx-auto leading-relaxed">{t.compareEmptyDesc}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8 max-w-[1600px] mx-auto animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-white font-display tracking-tight">{t.compareTitle}</h2>
          <p className="text-text-secondary text-sm mt-1">{t.compareDesc} · {items.length}/{MAX_COMPARE}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleVerdict}
            disabled={loading || items.length < 2}
            className="px-5 py-2 bg-primary hover:bg-primary-hover disabled:opacity-40 text-white rounded-full text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 shadow-lg shadow-primary/20"
          >
            <span className={`material-symbols-outlined text-sm ${loading ? 'animate-spin' : ''}`}>
              {loading ? 'progress_activity' : 'auto_awesome'}
            </span>
            {loading ? t.loading : t.compareVerdict}
          </button>
          <button
            onClick={() => { clearCompare(); setVerdict(null); }}
            className="px-5 py-2 bg-surface border border-border text-text-secondary hover:text-white rounded-full text-[10px] font-black uppercase tracking-widest transition-all"
          >
            {t.compareClear}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-xs text-red-400">{error}</div>
      )}

      {/* Comparison table (deterministic metrics + local trust engine) */}
      <div className="rounded-2xl border border-border bg-surface overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="px-5 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary">{t.compareProduct}</th>
              <th className="px-5 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary">{t.metrics.totalNiches}</th>
              <th className="px-5 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary">Precio</th>
              <th className="px-5 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary">Margen</th>
              <th className="px-5 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary">{t.sortTrend}</th>
              <th className="px-5 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary">{t.trustTitle}</th>
              <th className="px-5 py-4"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => {
              const trust = p.sourceUrl ? evaluateDomain(p.sourceUrl) : null;
              return (
                <tr key={p.name} className="border-b border-border/40 hover:bg-background/40 transition-colors">
                  <td className="px-5 py-4 max-w-[280px]">
                    <p className="text-[10px] font-bold text-primary uppercase">{p.niche}</p>
                    <p className="text-white font-bold text-sm line-clamp-2">{p.name}</p>
                  </td>
                  <td className="px-5 py-4 text-text-secondary text-xs">{p.niche || '—'}</td>
                  <td className="px-5 py-4 text-white font-bold text-xs">{p.priceEstimate}</td>
                  <td className="px-5 py-4 text-emerald-500 font-bold text-xs">{p.potentialMargin}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-2 bg-background rounded-full overflow-hidden border border-border/50">
                        <div className="h-full bg-gradient-to-r from-primary/70 to-primary" style={{ width: `${Math.max(4, Math.min(100, Number(p.trendScore) || 0))}%` }}></div>
                      </div>
                      <span className="text-[10px] font-mono text-text-secondary">{p.trendScore}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    {trust ? (
                      <span className={`text-[11px] font-black uppercase ${TRUST_COLORS[trust.verdict] || ''}`}>
                        {trust.score}/100
                      </span>
                    ) : <span className="text-text-secondary text-xs">—</span>}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onAnalyzeProduct?.(p)}
                        className="text-[9px] font-black uppercase px-3 py-1.5 bg-primary/10 border border-primary/30 hover:bg-primary text-white rounded-lg transition-all"
                      >
                        {t.deepAnalysis}
                      </button>
                      <button
                        onClick={() => removeFromCompare(p.name)}
                        className="p-1.5 rounded-lg border border-border text-text-secondary hover:text-red-400 hover:border-red-500/40 transition-all"
                        title={t.compareRemove}
                      >
                        <span className="material-symbols-outlined text-[14px]">close</span>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* AI verdict */}
      {(verdict || loading) && (
        <div className="rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/5 to-transparent p-8">
          <div className="flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-primary">psychology</span>
            <h3 className="text-white font-bold font-display uppercase tracking-wider text-sm">{t.compareVerdictTitle}</h3>
          </div>
          {loading ? (
            <div className="space-y-2 animate-pulse">
              <div className="h-4 bg-surface-light rounded w-3/4"></div>
              <div className="h-4 bg-surface-light rounded w-2/3"></div>
              <div className="h-4 bg-surface-light rounded w-1/2"></div>
            </div>
          ) : (
            <p className="text-text-secondary text-sm leading-relaxed whitespace-pre-wrap">{verdict}</p>
          )}
        </div>
      )}
    </div>
  );
};

export default Compare;
