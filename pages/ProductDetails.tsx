
import React, { useState, useEffect } from 'react';
import { WinningProduct, Language } from '../types';
import { getDeepProductAnalysis } from '../services/geminiService';
import { translations } from '../translations';
import TrustBadge from '../components/TrustBadge';

interface ProductDetailsProps {
  product: WinningProduct | null;
  lang: Language;
}

const ProductDetails: React.FC<ProductDetailsProps> = ({ product, lang }) => {
  const t = translations[lang];
  const [analysis, setAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    if (product) {
      const fetchDeepAnalysis = async () => {
        setAnalysis(null);
        setLoading(true);
        setError(false);
        setImgError(false);
        try {
          const data = await getDeepProductAnalysis(product.name, lang);
          if (!data || Object.keys(data).length === 0) throw new Error("Empty data");
          setAnalysis(data);
        } catch (error) {
          console.error("Deep analysis failed", error);
          setError(true);
        } finally {
          setLoading(false);
        }
      };
      fetchDeepAnalysis();
    }
  }, [product, lang]);

  if (!product) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center text-center p-20 opacity-40">
        <span className="material-symbols-outlined text-[100px] mb-6 animate-pulse">inventory_2</span>
        <h2 className="text-3xl font-bold font-display">{t.noProduct}</h2>
        <p className="max-w-md mt-4 text-text-secondary">{t.noProductDesc}</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 animate-in zoom-in-95 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-border/50 pb-8">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-[10px] text-text-secondary uppercase tracking-[0.2em] font-black">
            <span>Marketplace</span>
            <span className="material-symbols-outlined text-[14px]">chevron_right</span>
            <span>{product.niche}</span>
          </div>
          <h1 className="text-4xl font-bold text-white font-display tracking-tight mt-2 flex items-center gap-4">
            {product.name}
            {loading && <span className="size-4 border-2 border-primary/20 border-t-primary rounded-full animate-spin"></span>}
          </h1>
        </div>
        {product.sourceUrl && (
          <a href={product.sourceUrl} target="_blank" rel="noopener noreferrer" className="px-6 py-2 bg-primary/20 border border-primary/40 text-primary hover:bg-primary hover:text-white rounded-full text-xs font-bold transition-all flex items-center gap-2 shadow-lg shadow-primary/10">
             <span className="material-symbols-outlined text-sm">open_in_new</span> {t.checkSource}
          </a>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 xl:col-span-3 space-y-6">
          <div className="bg-surface rounded-2xl border border-border p-6 space-y-6 shadow-2xl relative">
            <div className="absolute top-4 left-4 z-10 bg-emerald-500 text-white text-[9px] font-black px-2 py-0.5 rounded shadow-lg uppercase">Análisis Real</div>
            
            <div className="w-full aspect-square bg-white rounded-xl overflow-hidden flex items-center justify-center">
              {!imgError ? (
                <img 
                  src={product.imageUrl} 
                  className="size-full object-contain p-4" 
                  alt={product.name} 
                  onError={() => setImgError(true)} 
                />
              ) : (
                <div className="flex flex-col items-center justify-center gap-4 text-center p-6">
                  <span className="material-symbols-outlined text-4xl text-text-secondary opacity-30">image_not_supported</span>
                  <p className="text-xs text-text-secondary font-bold uppercase tracking-widest">{t.checkSource}</p>
                  <a href={product.sourceUrl} target="_blank" className="text-[10px] text-primary underline break-all font-mono">{product.sourceUrl}</a>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
               <div><p className="text-[10px] text-text-secondary uppercase font-bold">Precio Est.</p><p className="text-2xl font-bold text-white font-display">{product.priceEstimate}</p></div>
               <div className="text-right"><p className="text-[10px] text-emerald-500 uppercase font-bold">Margen</p><p className="text-2xl font-bold text-emerald-500 font-display">{product.potentialMargin}</p></div>
            </div>
          </div>
          
          <div className="bg-[#0d131d] rounded-2xl border border-border p-6 shadow-inner">
            <h4 className="text-white font-bold text-sm mb-4 flex items-center gap-2 uppercase tracking-widest">
              <span className="material-symbols-outlined text-primary">warning</span>
              {t.risks}
            </h4>
            <ul className="space-y-3">
              {analysis?.topRisks?.map((risk: string, i: number) => (
                <li key={i} className="text-xs text-text-secondary flex gap-2 items-start bg-surface/30 p-2 rounded border border-border/30">
                  <span className="text-red-500 font-bold shrink-0">•</span> 
                  <span className="leading-relaxed">{risk}</span>
                </li>
              )) || (
                <div className="animate-pulse space-y-3">
                  <div className="h-8 bg-surface rounded w-full"></div>
                  <div className="h-8 bg-surface rounded w-3/4"></div>
                  <div className="h-8 bg-surface rounded w-5/6"></div>
                </div>
              )}
              {error && <li className="text-xs text-red-400 italic">No se pudieron cargar los riesgos. Intenta refrescar.</li>}
            </ul>
          </div>
        </div>

        <div className="lg:col-span-8 xl:col-span-9 space-y-6">
          <div className="bg-surface rounded-2xl border border-border p-8 shadow-xl">
             <div className="flex items-center justify-between mb-8">
               <h3 className="text-xl font-bold text-white uppercase tracking-tight">{t.competitors}</h3>
               <span className="text-[10px] text-text-secondary font-mono tracking-widest">REAL-TIME DATA 2026</span>
             </div>
             
             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
               {analysis?.competitors?.map((comp: string, i: number) => (
                 <div key={i} className="p-4 bg-background border border-border rounded-xl flex items-center justify-between group hover:border-primary transition-all cursor-default shadow-sm">
                    <span className="text-white font-medium text-sm">{comp}</span>
                    <span className="material-symbols-outlined text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity text-[18px]">check_circle</span>
                 </div>
               )) || (
                 <div className="col-span-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
                   {Array(6).fill(0).map((_, i) => <div key={i} className="h-14 bg-background border border-border rounded-xl"></div>)}
                 </div>
               )}
               {error && <div className="col-span-full text-center p-8 border border-dashed border-border rounded-xl text-text-secondary text-sm">Sin datos de competencia disponibles para este SKU.</div>}
             </div>

             <div className="mt-8 p-6 bg-background/50 rounded-2xl border border-border relative">
                <div className="absolute top-[-10px] left-6 px-3 py-0.5 bg-primary text-white text-[9px] font-black rounded-full uppercase">{t.sentiment}</div>
                <p className="text-sm text-text-secondary leading-relaxed italic mt-2">
                  {analysis?.customerSentiment || (loading ? "Analizando hilos de Reddit, TikTok y reseñas de Amazon..." : "Análisis no disponible en este momento.")}
                </p>
             </div>

             <div className="mt-8 pt-6 border-t border-border">
                <h4 className="text-[10px] font-black text-text-secondary uppercase mb-4 tracking-[0.2em]">{t.source} · {t.trustTitle}</h4>
                <div className="flex flex-wrap gap-2">
                   {analysis?.sources?.map((s: any, i: number) => (
                     <div key={i} className="flex items-center gap-2">
                       <a href={s.uri} target="_blank" rel="noopener noreferrer" className="px-3 py-2 bg-surface-light border border-border rounded-lg text-[10px] text-white hover:bg-primary hover:border-primary transition-all flex items-center gap-2 font-bold group flex-1 min-w-0">
                          <span className="material-symbols-outlined text-[14px] group-hover:animate-bounce">language</span> <span className="truncate">{s.title}</span>
                       </a>
                       <TrustBadge url={s.uri} lang={lang} compact />
                     </div>
                   )) || <div className="h-8 w-32 bg-background rounded animate-pulse"></div>}
                </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductDetails;
