
import React, { useState, useEffect, useMemo } from 'react';
import { huntWinningProducts } from '../services/geminiService';
import { WinningProduct, Language } from '../types';
import { translations } from '../translations';
import TrustBadge from '../components/TrustBadge';
import LiveSignals from '../components/LiveSignals';
import { isWatched, toggleWatchlist, rememberScanNames, previousScanNames } from '../services/watchlist';
import { isCompared, toggleCompare } from '../services/compare';
import { safeExternalUrl } from '../services/security';
import { batchVerifySources, ServerVerdict } from '../services/reputationClient';

function domainOf(url: string | undefined): string {
  try { return url ? new URL(url).hostname.toLowerCase() : ''; } catch { return ''; }
}

interface DailyFinderProps {
  onAnalyzeProduct?: (product: WinningProduct) => void;
  lang: Language;
}

const ProductImage: React.FC<{ src: string; alt: string; sourceUrl?: string; name: string; lang: Language }> = ({ src, alt, sourceUrl, name, lang }) => {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const t = translations[lang];

  const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(name + ' buy online')}`;

  return (
    <div className="relative aspect-square overflow-hidden bg-background">
      {!loaded && !error && (
        <div className="absolute inset-0 bg-surface animate-pulse flex items-center justify-center">
          <span className="material-symbols-outlined text-text-secondary animate-spin">progress_activity</span>
        </div>
      )}
      {(error || !src || src === 'placeholder') ? (
        <div className="absolute inset-0 bg-surface flex flex-col items-center justify-center p-4 text-center space-y-3">
          <span className="material-symbols-outlined text-4xl text-text-secondary/30">search_off</span>
          <p className="text-[10px] text-text-secondary uppercase font-bold tracking-widest leading-tight">Sin Imagen Directa</p>
          <div className="flex flex-col gap-2 w-full px-4">
            {sourceUrl && sourceUrl.startsWith('http') && (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full px-3 py-1.5 bg-primary/20 border border-primary/40 text-primary text-[9px] font-black uppercase rounded hover:bg-primary hover:text-white transition-all truncate"
              >
                Link Directo
              </a>
            )}
            <a
              href={googleSearchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full px-3 py-1.5 bg-white/5 border border-white/10 text-white text-[9px] font-black uppercase rounded hover:bg-white/20 transition-all"
            >
              {t.searchSafety}
            </a>
          </div>
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          className={`size-full object-contain p-2 group-hover:scale-105 transition-transform duration-700 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
    </div>
  );
};

const DailyFinder: React.FC<DailyFinderProps> = ({ onAnalyzeProduct, lang }) => {
  const t = translations[lang];
  const [products, setProducts] = useState<WinningProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanStep, setScanStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // toolbar
  const [query, setQuery] = useState('');
  const [nicheFilter, setNicheFilter] = useState('');
  const [sortBy, setSortBy] = useState<'trend' | 'name'>('trend');
  // watchlist + new badges (tick forces re-render on toggle)
  const [watchTick, setWatchTick] = useState(0);
  const [serverVerdicts, setServerVerdicts] = useState<Record<string, ServerVerdict>>({});
  const prevNames = useMemo(() => previousScanNames(lang), [lang]);

  const downloadCSV = () => {
    if (products.length === 0) return;

    const headers = ["Nombre", "Nicho", "Precio Estimado", "Razon", "Margen", "Trend Score", "URL Fuente", "URL Imagen"];
    const rows = products.map(p => [
      `"${p.name.replace(/"/g, '""')}"`,
      `"${p.niche}"`,
      `"${p.priceEstimate}"`,
      `"${p.reasonWhyWinning.replace(/"/g, '""')}"`,
      `"${p.potentialMargin}"`,
      p.trendScore,
      `"${p.sourceUrl || ''}"`,
      `"${p.imageUrl || ''}"`
    ]);

    // BOM prefix so Excel opens accents/quotes correctly; Blob avoids encodeURI corruption
    const csvContent = "\uFEFF"
      + headers.join(",") + "\n"
      + rows.map(e => e.join(",")).join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `ProdIntel_Data_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const fetchProducts = async () => {
    setLoading(true);
    setScanStep(0);
    setError(null);

    const logInterval = setInterval(() => {
      setScanStep(prev => (prev < t.scanSteps.length - 1 ? prev + 1 : prev));
    }, 2000);

    try {
      // Remember the CURRENT scan's products as "previous" before overwriting,
      // so the next render can flag genuinely NEW findings.
      try {
        const currentCache = localStorage.getItem(`daily_products_v4_${lang}`);
        if (currentCache) {
          const parsed = JSON.parse(currentCache);
          if (Array.isArray(parsed?.items)) {
            rememberScanNames(parsed.items.map((p: WinningProduct) => p.name), lang);
          }
        }
      } catch { /* ignore cache read errors */ }

      const results = await huntWinningProducts(lang);
      // Validar que los resultados tengan un nombre por lo menos
      const validResults = results.filter((r: any) => r.name && r.name !== "");
      setProducts(validResults);
      localStorage.setItem(`daily_products_v4_${lang}`, JSON.stringify({
        date: new Date().toDateString(),
        items: validResults
      }));
    } catch (err) {
      console.error("Scanning failed", err);
      setError(
        (err as Error)?.name === 'MissingApiKeyError'
          ? `${t.needApiKey} — ${t.needApiKeyDesc}`
          : `${t.errorTitle}: ${String((err as Error)?.message || err).slice(0, 160)}`
      );
    } finally {
      clearInterval(logInterval);
      setLoading(false);
    }
  };

  useEffect(() => {
    const cached = localStorage.getItem(`daily_products_v4_${lang}`);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.date === new Date().toDateString()) {
        setProducts(parsed.items);
        return;
      }
    }
    fetchProducts();
  }, [lang]);

  // Live UTA Reputation confirmation: after the local badges render, ask the
  // /api/reputation endpoint for server verdicts (fail-soft, cached 24h).
  useEffect(() => {
    const stop = batchVerifySources(products.map((p) => p.sourceUrl), (v) =>
      setServerVerdicts((prev) => ({ ...prev, [v.domain]: v }))
    );
    return stop;
  }, [products]);

  const niches = useMemo(
    () => [...new Set(products.map((p) => p.niche).filter(Boolean))].sort(),
    [products]
  );

  const visible = useMemo(() => {
    let list = products;
    if (nicheFilter) list = list.filter((p) => p.niche === nicheFilter);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        (p.niche || '').toLowerCase().includes(q) ||
        (p.reasonWhyWinning || '').toLowerCase().includes(q)
      );
    }
    if (sortBy === 'trend') list = [...list].sort((a, b) => (b.trendScore || 0) - (a.trendScore || 0));
    if (sortBy === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [products, query, nicheFilter, sortBy]);

  const handleToggleWatch = (p: WinningProduct) => {
    toggleWatchlist(p);
    setWatchTick((n) => n + 1);
  };

  const HeartButton: React.FC<{ product: WinningProduct; className?: string }> = ({ product, className = '' }) => {
    const saved = isWatched(product.name);
    return (
      <button
        onClick={(e) => { e.stopPropagation(); handleToggleWatch(product); }}
        title={saved ? t.removeFromWatchlist : t.addToWatchlist}
        className={`shrink-0 p-1.5 rounded-lg border backdrop-blur transition-all ${
          saved
            ? 'bg-primary/90 border-primary text-white shadow-lg'
            : 'bg-background/70 border-border text-text-secondary hover:text-white hover:border-primary/50'
        } ${className}`}
      >
        <span className="material-symbols-outlined text-[16px]">{saved ? 'bookmark' : 'bookmark_add'}</span>
      </button>
    );
  };

  const CompareButton: React.FC<{ product: WinningProduct; className?: string }> = ({ product, className = '' }) => {
    const active = isCompared(product.name);
    return (
      <button
        onClick={(e) => { e.stopPropagation(); toggleCompare(product); setWatchTick((n) => n + 1); }}
        title={active ? t.compareRemove : t.compareAdd}
        className={`shrink-0 p-1.5 rounded-lg border backdrop-blur transition-all ${
          active
            ? 'bg-amber-500/90 border-amber-500 text-white shadow-lg'
            : 'bg-background/70 border-border text-text-secondary hover:text-white hover:border-amber-500/50'
        } ${className}`}
      >
        <span className="material-symbols-outlined text-[16px]">{active ? 'compare_arrows' : 'balance'}</span>
      </button>
    );
  };

  return (
    <div className="p-8 space-y-8 max-w-[1600px] mx-auto animate-in fade-in duration-700">
      <div className="flex flex-col xl:flex-row items-stretch gap-6">
        <div className="flex-1 bg-surface border border-border p-8 rounded-2xl shadow-2xl relative overflow-hidden">
          <div className="relative z-10 space-y-4">
            <div className="flex items-center gap-3">
              <div className="size-3 bg-emerald-500 rounded-full animate-pulse"></div>
              <span className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em] font-display">{t.realTime}</span>
            </div>
            <h2 className="text-4xl font-bold text-white font-display tracking-tight">{t.trends48h}</h2>
            <div className="flex flex-wrap items-center gap-4">
               <p className="text-text-secondary text-sm max-w-2xl">Investigación activa de productos ganadores. Fuentes evaluadas por el Source Safety Gate antes de mostrarse.</p>
               {products.length > 0 && !loading && (
                 <button
                  onClick={downloadCSV}
                  className="px-4 py-1.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500 hover:text-white transition-all flex items-center gap-2"
                 >
                   <span className="material-symbols-outlined text-sm">download</span>
                   {t.downloadList}
                 </button>
               )}
            </div>
          </div>
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-[100px] rounded-full -mr-20 -mt-20"></div>
        </div>

        <div className="xl:w-80 flex flex-col justify-center gap-4">
           <button
             onClick={fetchProducts}
             disabled={loading}
             className="w-full py-4 bg-primary hover:bg-primary-hover text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-3 disabled:opacity-50 active:scale-95"
           >
             <span className={`material-symbols-outlined ${loading ? 'animate-spin' : ''}`}>
               {loading ? 'autorenew' : 'search_insights'}
             </span>
             {loading ? t.loading : t.scanWeb}
           </button>
           {!loading && (
             <div className="text-[10px] text-center text-text-secondary font-mono uppercase tracking-widest">
               {products.length} productos identificados
             </div>
           )}
        </div>
      </div>

      <LiveSignals lang={lang} limit={6} />

      {error && !loading && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center gap-4">
          <span className="material-symbols-outlined text-red-500 text-3xl">error</span>
          <div className="flex-1">
            <p className="text-white font-bold text-sm">{t.errorTitle}</p>
            <p className="text-text-secondary text-xs mt-1">{error}</p>
          </div>
          <button
            onClick={fetchProducts}
            className="px-5 py-2 bg-red-500/20 border border-red-500/40 hover:bg-red-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all"
          >
            {t.errorRetry}
          </button>
        </div>
      )}

      {loading ? (
        <div className="bg-[#0d131d] border border-border rounded-2xl p-12 flex flex-col items-center justify-center min-h-[500px] text-center">
          <div className="size-20 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-8"></div>
          <p className="text-primary font-mono text-sm uppercase tracking-widest font-bold mb-2">
            {t.scanSteps[scanStep]}
          </p>
          <div className="w-64 h-1.5 bg-background rounded-full overflow-hidden mt-4 border border-border">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${((scanStep + 1) / t.scanSteps.length) * 100}%` }}
            ></div>
          </div>
        </div>
      ) : (
        <div className="space-y-12">
          {products.length === 0 && !error && (
            <div className="bg-surface border border-border rounded-2xl p-12 text-center">
              <span className="material-symbols-outlined text-5xl text-text-secondary/40 mb-4 block">search_off</span>
              <p className="text-white font-bold">{t.emptyDash}</p>
              <p className="text-text-secondary text-sm mt-2">{t.emptyDashDesc}</p>
            </div>
          )}
          {/* Top Seller Highlight */}
          {products.length > 0 && (
            <div className="bg-gradient-to-r from-primary/20 to-transparent border border-primary/30 rounded-3xl p-8 flex flex-col lg:flex-row gap-8 items-center relative overflow-hidden group">
              <div className="absolute top-4 left-4 px-4 py-1.5 bg-primary text-white font-black text-xs uppercase tracking-[0.2em] rounded-full z-20 shadow-xl">
                {t.topSeller} #1
              </div>
              <div className="absolute top-4 right-4 z-20 flex gap-2">
                <CompareButton product={products[0]} />
                <HeartButton product={products[0]} />
              </div>
              <div className="w-full lg:w-1/3 aspect-square max-w-[300px] bg-white rounded-2xl overflow-hidden shadow-2xl relative shrink-0">
                <ProductImage src={products[0].imageUrl} alt={products[0].name} name={products[0].name} sourceUrl={products[0].sourceUrl} lang={lang} />
              </div>
              <div className="flex-1 space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                   <span className="material-symbols-outlined text-emerald-500 fill-1">verified</span>
                   <span className="text-[11px] font-bold text-emerald-500 uppercase tracking-widest">{t.verified}</span>
                   <TrustBadge url={products[0].sourceUrl} lang={lang} server={serverVerdicts[domainOf(products[0].sourceUrl)]} />
                </div>
                <h3 className="text-3xl font-bold text-white font-display leading-tight">{products[0].name}</h3>
                <p className="text-text-secondary leading-relaxed max-w-2xl italic">"{products[0].reasonWhyWinning}"</p>
                <div className="flex flex-wrap items-center gap-6">
                  <div>
                    <p className="text-[10px] text-text-secondary uppercase mb-1 font-bold">Precio Mercado</p>
                    <p className="text-2xl font-bold text-white font-display">{products[0].priceEstimate}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-emerald-500 uppercase mb-1 font-bold">Margen Bruto</p>
                    <p className="text-2xl font-bold text-emerald-500 font-display">{products[0].potentialMargin}</p>
                  </div>
                  <div className="ml-auto flex gap-2">
                    {products[0].sourceUrl && products[0].sourceUrl.startsWith('http') && (
                      <a href={products[0].sourceUrl} target="_blank" rel="noopener noreferrer" className="px-6 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-2">
                          <span className="material-symbols-outlined text-sm">link</span> Enlace Fuente
                      </a>
                    )}
                    <a href={`https://www.google.com/search?q=${encodeURIComponent(products[0].name)}`} target="_blank" rel="noopener noreferrer" className="px-6 py-2 bg-primary/20 hover:bg-primary border border-primary/30 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm">search</span> Google
                    </a>
                  </div>
                </div>
                <button
                  onClick={() => onAnalyzeProduct?.(products[0])}
                  className="px-8 py-3 bg-primary hover:bg-primary-hover text-white font-bold rounded-xl shadow-lg transition-all"
                >
                  Abrir Informe de Inteligencia
                </button>
              </div>
            </div>
          )}

          {/* Toolbar: search / filter / sort */}
          {products.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-[18px]">search</span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t.searchPh}
                  className="w-full bg-surface border border-border rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-primary focus:outline-none transition-all placeholder:text-text-secondary/40"
                />
              </div>
              <select
                value={nicheFilter}
                onChange={(e) => setNicheFilter(e.target.value)}
                className="bg-surface border border-border rounded-xl px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-primary focus:outline-none transition-all"
              >
                <option value="">{t.filterNiche} ({niches.length})</option>
                {niches.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'trend' | 'name')}
                className="bg-surface border border-border rounded-xl px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-primary focus:outline-none transition-all"
              >
                <option value="trend">{t.sortBy}: {t.sortTrend}</option>
                <option value="name">{t.sortBy}: {t.sortName}</option>
              </select>
            </div>
          )}

          {/* Grid of products */}
          {visible.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
              {visible.map((product, i) => {
                const isNew = prevNames.length > 0 && !prevNames.includes(product.name);
                return (
                  <div key={product.name + i} className="bg-surface border border-border rounded-2xl overflow-hidden hover:border-primary transition-all group flex flex-col h-full hover:shadow-2xl hover:-translate-y-1">
                    <div className="relative">
                      <ProductImage src={product.imageUrl} alt={product.name} name={product.name} sourceUrl={product.sourceUrl} lang={lang} />
                      <div className="absolute top-3 left-3 flex gap-1.5 z-10">
                        <div className="px-2 py-1 bg-background/80 backdrop-blur rounded text-[10px] font-bold text-white border border-border">
                          #{i + 1}
                        </div>
                        {isNew && (
                          <div className="px-2 py-1 bg-amber-500 text-black rounded text-[10px] font-black shadow-lg animate-pulse">
                            {t.newBadge}
                          </div>
                        )}
                      </div>
                      <div className="absolute top-3 right-3 flex gap-1.5 z-10">
                        <div className="px-2 py-1 bg-emerald-500/90 text-white rounded text-[10px] font-black shadow-lg">
                          {product.trendScore}%
                        </div>
                      </div>
                      <div className="absolute bottom-3 right-3 z-10 flex gap-1.5">
                        <CompareButton product={product} />
                        <HeartButton product={product} key={watchTick} />
                      </div>
                    </div>

                    <div className="p-5 flex flex-col flex-1">
                      <p className="text-[10px] font-bold text-primary uppercase mb-1">{product.niche}</p>
                      <h3 className="text-sm font-bold text-white mb-4 line-clamp-2 h-10">{product.name}</h3>
                      <div className="p-3 bg-background/50 rounded-xl border border-border/50 flex-1 mb-4 italic text-[11px] text-text-secondary leading-relaxed line-clamp-3">
                        "{product.reasonWhyWinning}"
                      </div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold text-white">{product.priceEstimate}</span>
                        <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded">Margen: {product.potentialMargin}</span>
                      </div>
                      <div className="flex items-center justify-between mb-4">
                        <TrustBadge url={product.sourceUrl} lang={lang} server={serverVerdicts[domainOf(product.sourceUrl)]} />
                        <span className="text-[9px] text-text-secondary/60 font-mono truncate max-w-[120px]">{product.sourceUrl ? new URL(product.sourceUrl).hostname : ''}</span>
                      </div>
                      <div className="flex flex-col gap-2">
                        <button
                          onClick={() => onAnalyzeProduct?.(product)}
                          className="w-full py-2 bg-primary/10 border border-primary/30 hover:bg-primary text-white text-[10px] font-black uppercase rounded-lg transition-all"
                        >
                          {t.deepAnalysis}
                        </button>
                        <div className="grid grid-cols-2 gap-2">
                          {product.sourceUrl && product.sourceUrl.startsWith('http') ? (
                              <a
                                href={safeExternalUrl(product.sourceUrl) || undefined}
                                target="_blank"
                                rel="noopener noreferrer nofollow"
                                className="py-2 bg-surface border border-border hover:bg-surface-light text-text-secondary hover:text-white text-[10px] font-black uppercase rounded-lg transition-all flex items-center justify-center gap-1 truncate px-1"
                              >
                                <span className="material-symbols-outlined text-sm">link</span> URL
                              </a>
                          ) : (
                              <div className="py-2 bg-surface/50 border border-dashed border-border text-text-secondary/50 text-[10px] font-black uppercase rounded-lg flex items-center justify-center italic">
                                No Link
                              </div>
                          )}
                          <a
                            href={`https://www.google.com/search?q=${encodeURIComponent(product.name)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="py-2 bg-surface border border-border hover:bg-surface-light text-text-secondary hover:text-white text-[10px] font-black uppercase rounded-lg transition-all flex items-center justify-center gap-1"
                          >
                            <span className="material-symbols-outlined text-sm">search</span> Google
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {products.length > 0 && visible.length === 0 && (
            <div className="bg-surface border border-border rounded-2xl p-10 text-center">
              <span className="material-symbols-outlined text-4xl text-text-secondary/40 mb-3 block">filter_alt_off</span>
              <p className="text-text-secondary text-sm">0 / {products.length} — {t.searchPh}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DailyFinder;
