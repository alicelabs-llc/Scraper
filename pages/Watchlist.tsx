
import React, { useState, useEffect, useMemo } from 'react';
import { WatchItem, loadWatchlist, removeFromWatchlist } from '../services/watchlist';
import { assessSource } from '../services/sourceTrust';
import TrustBadge from '../components/TrustBadge';
import { Language, WinningProduct } from '../types';
import { translations } from '../translations';

interface WatchlistProps {
  lang: Language;
  onAnalyzeProduct?: (product: WinningProduct) => void;
}

const Watchlist: React.FC<WatchlistProps> = ({ lang, onAnalyzeProduct }) => {
  const t = translations[lang];
  const [items, setItems] = useState<WatchItem[]>([]);

  useEffect(() => {
    const refresh = () => setItems(loadWatchlist());
    refresh();
    window.addEventListener('prodintel-watchlist-changed', refresh);
    return () => window.removeEventListener('prodintel-watchlist-changed', refresh);
  }, []);

  const sorted = useMemo(
    () => [...items].sort((a, b) => (b.lastScore || 0) - (a.lastScore || 0)),
    [items]
  );

  const exportCSV = () => {
    if (items.length === 0) return;
    const headers = ['Name', 'Niche', 'Price', 'Margin', 'TrendScore', 'AddedAt', 'SourceURL'];
    const rows = items.map((w) => [
      `"${w.name.replace(/"/g, '""')}"`,
      `"${w.niche}"`,
      `"${w.priceEstimate}"`,
      `"${w.potentialMargin}"`,
      w.lastScore,
      w.addedAt.slice(0, 10),
      `"${w.sourceUrl || ''}"`,
    ]);
    const csv = '\uFEFF' + headers.join(',') + '\n' + rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ProdIntel_Watchlist_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (items.length === 0) {
    return (
      <div className="p-8 max-w-[1600px] mx-auto animate-in fade-in duration-500">
        <h2 className="text-3xl font-bold text-white font-display mb-2">{t.watchlist}</h2>
        <div className="bg-surface border border-border rounded-2xl p-16 mt-8 text-center">
          <span className="material-symbols-outlined text-6xl text-text-secondary/40 mb-6 block">bookmarks</span>
          <p className="text-white font-bold text-lg">{t.watchlistEmpty}</p>
          <p className="text-text-secondary text-sm mt-3 max-w-md mx-auto leading-relaxed">{t.watchlistEmptyDesc}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8 max-w-[1600px] mx-auto animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-white font-display tracking-tight">{t.watchlist}</h2>
          <p className="text-text-secondary text-sm mt-1">{t.watchlistDesc} · {items.length}</p>
        </div>
        <button
          onClick={exportCSV}
          className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500 hover:text-white transition-all flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-sm">download</span> {t.downloadList}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {sorted.map((w) => {
          const assessment = assessSource(w.sourceUrl);
          const risky = assessment?.status === 'risky';
          return (
            <div key={w.name} className={`bg-surface border rounded-2xl p-5 flex flex-col gap-3 transition-all hover:shadow-2xl ${risky ? 'border-red-500/40' : 'border-border hover:border-primary'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-primary uppercase mb-1 truncate">{w.niche}</p>
                  <h3 className="text-sm font-bold text-white line-clamp-2 leading-snug">{w.name}</h3>
                </div>
                <button
                  onClick={() => removeFromWatchlist(w.name)}
                  className="shrink-0 p-1.5 rounded-lg border border-border text-text-secondary hover:text-red-400 hover:border-red-500/40 transition-all"
                  title={t.removeFromWatchlist}
                >
                  <span className="material-symbols-outlined text-[18px]">bookmark_remove</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-500 rounded text-[10px] font-black">
                  {w.lastScore}/100
                </span>
                <span className="text-xs font-bold text-white">{w.priceEstimate}</span>
                <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded">
                  {w.potentialMargin}
                </span>
                <TrustBadge url={w.sourceUrl} lang={lang} />
              </div>

              {assessment?.status === 'risky' && (
                <p className="text-[10px] text-red-400/90 leading-relaxed">
                  <span className="material-symbols-outlined text-[12px] align-middle">gpp_bad</span> {t.trustRisky} — {assessment.reasons[0]}
                </p>
              )}

              <div className="mt-auto flex items-center justify-between pt-2 border-t border-border/50">
                <span className="text-[10px] text-text-secondary font-mono">
                  {new Date(w.addedAt).toLocaleDateString(lang === 'zh' ? 'zh-CN' : lang, { month: 'short', day: 'numeric' })}
                </span>
                <div className="flex gap-2">
                  {w.sourceUrl?.startsWith('http') && (
                    <a href={w.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] font-black uppercase text-text-secondary hover:text-white transition-all flex items-center gap-1">
                      <span className="material-symbols-outlined text-[13px]">link</span> URL
                    </a>
                  )}
                  <button
                    onClick={() => onAnalyzeProduct?.(w)}
                    className="text-[10px] font-black uppercase px-3 py-1.5 bg-primary/10 border border-primary/30 hover:bg-primary text-white rounded-lg transition-all"
                  >
                    {t.deepAnalysis}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Watchlist;
