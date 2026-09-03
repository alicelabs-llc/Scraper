
import React, { useState, useEffect, useMemo } from 'react';
import { MetricCardProps, Language, WinningProduct } from '../types';
import { analyzeMarketTrends } from '../services/geminiService';
import { summarizeSources, assessSource } from '../services/sourceTrust';
import LiveSignals from '../components/LiveSignals';
import { translations } from '../translations';

interface DashboardProps {
  lang: Language;
}

const Sparkline: React.FC<{ data: number[]; trend: 'up' | 'down' }> = ({ data, trend }) => {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const width = 100;
  const height = 30;

  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((val - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  const color = trend === 'up' ? '#10b981' : '#ef4444';

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="mt-2">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
};

const MetricCard: React.FC<MetricCardProps> = ({ label, value, change, trend, icon, trendData }) => (
  <div className="p-5 rounded-xl border border-border bg-surface hover:border-primary/50 transition-all group">
    <div className="flex justify-between items-start mb-3">
      <p className="text-text-secondary text-xs font-medium uppercase tracking-wider">{label}</p>
      <span className="material-symbols-outlined text-text-secondary group-hover:text-white text-[20px] transition-colors">{icon}</span>
    </div>
    <div className="flex items-baseline gap-2">
      <h3 className="text-white text-2xl font-bold font-display">{value}</h3>
      {change && (
        <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded flex items-center ${
          trend === 'up' ? 'text-emerald-500 bg-emerald-500/10' : 'text-red-500 bg-red-500/10'
        }`}>
          {change}
        </span>
      )}
    </div>
    {trendData && trendData.length > 1 && <Sparkline data={trendData} trend={trend} />}
  </div>
);

const MarketSummary: React.FC<{ lang: Language }> = ({ lang }) => {
  const t = translations[lang];
  const [summary, setSummary] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchSummary = async () => {
      setLoading(true);
      try {
        const query = lang === 'es'
          ? "tendencias generales de e-commerce y productos ganadores esta semana"
          : `General e-commerce trends and winning products this week (${lang})`;
        const result = await analyzeMarketTrends(query, lang);
        setSummary(result || "No data");
      } catch {
        setSummary("");
      } finally {
        setLoading(false);
      }
    };
    fetchSummary();
  }, [lang]);

  if (!loading && !summary) return null; // honest: if AI is unavailable, show nothing rather than a canned line

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/5 to-transparent p-6 mb-8">
      <div className="flex items-start gap-4 relative z-10">
        <div className="size-10 rounded-lg bg-primary/20 flex items-center justify-center text-primary shrink-0">
          <span className="material-symbols-outlined">psychology</span>
        </div>
        <div className="space-y-2 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-white font-bold font-display uppercase tracking-wider text-sm">IA Market Insight</h3>
            <span className="px-2 py-0.5 rounded bg-primary text-[10px] text-white font-bold animate-pulse">LIVE</span>
          </div>
          {loading ? (
            <div className="h-4 bg-surface-light rounded w-3/4 animate-pulse"></div>
          ) : (
            <p className="text-text-secondary text-sm leading-relaxed italic max-w-5xl">
              "{summary.length > 300 ? summary.slice(0, 300) + '...' : summary}"
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

interface ScanHistoryEntry { avg: number; count: number; cacheDate: string; ts: number }

const readCache = (lang: Language): { date: string; items: WinningProduct[] } | null => {
  try {
    const raw = localStorage.getItem(`daily_products_v4_${lang}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
};

const readHistory = (): ScanHistoryEntry[] => {
  try {
    const raw = localStorage.getItem('prodintel_scan_history');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const Dashboard: React.FC<DashboardProps> = ({ lang }) => {
  const t = translations[lang];

  // Every metric below is DERIVED FROM REAL SCAN DATA (localStorage cache of Daily Hunt).
  // No invented numbers: if the user has not scanned yet, we say so instead of faking it.
  const cache = useMemo(() => readCache(lang), [lang]);

  const history = useMemo(() => {
    const hist = readHistory();
    if (cache && !hist.some((h) => h.cacheDate === cache.date)) {
      const scores = cache.items.map((p) => Number(p.trendScore) || 0);
      const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
      hist.push({ avg, count: cache.items.length, cacheDate: cache.date, ts: Date.now() });
      try {
        localStorage.setItem('prodintel_scan_history', JSON.stringify(hist.slice(-30)));
      } catch { /* storage full — metrics still render without sparkline history */ }
    }
    return hist;
  }, [cache]);

  const nicheCounts = useMemo(() => {
    if (!cache) return [];
    const counts = new Map<string, number>();
    for (const p of cache.items) {
      const niche = (p.niche || '—').trim();
      counts.set(niche, (counts.get(niche) || 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count, pct: Math.round((count / cache.items.length) * 100) }));
  }, [cache]);

  if (!cache) {
    return (
      <div className="p-8 max-w-[1600px] mx-auto animate-in fade-in duration-500 space-y-8">
        <MarketSummary lang={lang} />
        <LiveSignals lang={lang} limit={6} />
        <div className="bg-surface border border-border rounded-2xl p-16 text-center">
          <span className="material-symbols-outlined text-6xl text-text-secondary/40 mb-6 block">radar</span>
          <h3 className="text-white text-xl font-bold font-display">{t.emptyDash}</h3>
          <p className="text-text-secondary text-sm mt-3 max-w-md mx-auto leading-relaxed">{t.emptyDashDesc}</p>
        </div>
      </div>
    );
  }

  const scores = cache.items.map((p) => Number(p.trendScore) || 0);
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const topNiche = nicheCounts[0]?.name || '—';
  const lastScan = cache.date ? new Date(cache.date).toLocaleDateString(lang === 'zh' ? 'zh-CN' : lang, { month: 'short', day: 'numeric' }) : '—';
  const sparkData = history.slice(-7).map((h) => Math.round(h.avg));

  const maxCount = nicheCounts[0]?.count || 1;
  const safety = useMemo(
    () => summarizeSources(cache.items.map((p) => p.sourceUrl)),
    [cache]
  );
  const hasSources = cache.items.some((p) => p.sourceUrl && p.sourceUrl.startsWith('http'));

  return (
    <div className="p-8 space-y-8 max-w-[1600px] mx-auto animate-in fade-in duration-500">
      <MarketSummary lang={lang} />
      <LiveSignals lang={lang} limit={6} />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard label={t.metrics.totalNiches} value={String(cache.items.length)} change="" trend="up" icon="dataset" />
        <MetricCard label={t.metrics.avgOpportunity} value={`${avgScore}/100`} change="" trend="up" icon="score" trendData={sparkData} />
        <MetricCard label={t.metrics.trendingCategory} value={topNiche.length > 18 ? topNiche.slice(0, 18) + '…' : topNiche} change="" trend="up" icon="local_mall" />
        <MetricCard label={t.metrics.marketVolume} value={lastScan} change="" trend="up" icon="schedule" />
      </div>

      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-white text-lg font-bold font-display">{t.metrics.saturationTitle}</h3>
            <p className="text-text-secondary text-sm">{t.metrics.saturationDesc} · {t.productsInCache}: {cache.items.length}</p>
          </div>
        </div>
        <div className="p-6 space-y-4">
          {nicheCounts.map((n) => (
            <div key={n.name} className="flex items-center gap-4">
              <span className="w-40 shrink-0 text-sm text-white font-medium truncate">{n.name}</span>
              <div className="flex-1 h-8 bg-background rounded-lg overflow-hidden border border-border/50">
                <div
                  className="h-full bg-gradient-to-r from-primary/70 to-primary rounded-lg transition-all duration-700"
                  style={{ width: `${Math.max(6, (n.count / maxCount) * 100)}%` }}
                ></div>
              </div>
              <span className="w-16 shrink-0 text-right text-xs font-bold text-text-secondary font-mono">
                {n.count} · {n.pct}%
              </span>
            </div>
          ))}
          <p className="text-[10px] text-text-secondary/70 uppercase tracking-widest pt-2">{t.nicheDist}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Source Safety Gate — evaluated BEFORE any link was shown to the user */}
        {hasSources && (
          <div className="rounded-2xl border border-border bg-surface overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <h3 className="text-white text-lg font-bold font-display">{t.safetyPanelTitle}</h3>
            </div>
            <div className="p-6 grid grid-cols-2 gap-3">
              {([
                { key: 'marketplace', icon: 'verified', cls: 'text-sky-400 bg-sky-500/10 border-sky-500/30' },
                { key: 'external', icon: 'public', cls: 'text-text-secondary bg-white/5 border-white/10' },
                { key: 'caution', icon: 'warning', cls: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
                { key: 'risky', icon: 'gpp_bad', cls: 'text-red-400 bg-red-500/10 border-red-500/30' },
              ] as const).map(({ key, icon, cls }) => (
                <div key={key} className={`rounded-xl border p-4 ${cls}`}>
                  <div className="flex items-center justify-between">
                    <span className="material-symbols-outlined text-[18px]">{icon}</span>
                    <span className="text-xl font-black font-display">{safety[key]}</span>
                  </div>
                  <p className="text-[9px] font-black uppercase tracking-wider mt-1 opacity-80">
                    {key === 'marketplace' ? t.trustMarketplace : key === 'external' ? t.trustExternal : key === 'caution' ? t.trustCaution : t.trustRisky}
                  </p>
                </div>
              ))}
              <p className="col-span-2 text-[10px] text-text-secondary/70 uppercase tracking-widest">{t.trustNoIssues}</p>
            </div>
          </div>
        )}

        {/* Scan history (real, local) */}
        {history.length > 1 && (
          <div className="rounded-2xl border border-border bg-surface overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <h3 className="text-white text-lg font-bold font-display">{t.scanHistoryTitle}</h3>
            </div>
            <div className="p-6 space-y-3">
              {history.slice(-7).reverse().map((h, i) => (
                <div key={i} className="flex items-center gap-4">
                  <span className="w-20 shrink-0 text-[11px] font-mono text-text-secondary">
                    {new Date(h.ts).toLocaleDateString(lang === 'zh' ? 'zh-CN' : lang, { month: 'short', day: 'numeric' })}
                  </span>
                  <div className="flex-1 h-2.5 bg-background rounded-full overflow-hidden border border-border/50">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500/70 to-emerald-500 rounded-full"
                      style={{ width: `${Math.min(100, Math.max(4, (h.count / Math.max(...history.map((x) => x.count), 1)) * 100))}%` }}
                    ></div>
                  </div>
                  <span className="w-24 shrink-0 text-right text-[10px] font-bold text-text-secondary font-mono">
                    {h.count} · avg {Math.round(h.avg)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
