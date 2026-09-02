
import React, { useState } from 'react';
import { assessSource, SourceStatus } from '../services/sourceTrust';
import { translations } from '../translations';
import { Language } from '../types';

/**
 * TrustBadge — Source Safety Gate badge.
 * Shown BEFORE the user clicks an external source link. Deterministic,
 * instant, honest: no fake "verified" claims, every state has real reasons.
 */

interface TrustBadgeProps {
  url: string | undefined | null;
  lang: Language;
  compact?: boolean;
}

const STYLES: Record<SourceStatus, { icon: string; cls: string }> = {
  marketplace: { icon: 'verified', cls: 'text-sky-400 bg-sky-500/10 border-sky-500/30' },
  external: { icon: 'public', cls: 'text-text-secondary bg-white/5 border-white/10' },
  caution: { icon: 'warning', cls: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  risky: { icon: 'gpp_bad', cls: 'text-red-400 bg-red-500/10 border-red-500/30' },
};

const TrustBadge: React.FC<TrustBadgeProps> = ({ url, lang, compact }) => {
  const t = translations[lang];
  const [showDetail, setShowDetail] = useState(false);
  const assessment = assessSource(url);
  if (!assessment) return null;

  const style = STYLES[assessment.status];
  const label =
    assessment.status === 'marketplace' ? t.trustMarketplace
    : assessment.status === 'caution' ? t.trustCaution
    : assessment.status === 'risky' ? t.trustRisky
    : t.trustExternal;

  return (
    <span className="relative inline-flex">
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowDetail(!showDetail); }}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[9px] font-black uppercase tracking-wider transition-all ${style.cls}`}
        title={`${t.trustTitle}: ${assessment.domain}`}
      >
        <span className="material-symbols-outlined text-[12px]">{style.icon}</span>
        {!compact && label}
      </button>
      {showDetail && (
        <span className="absolute z-50 top-full mt-1 right-0 w-56 bg-[#0d131d] border border-border rounded-lg p-3 shadow-2xl text-left">
          <span className="block text-[10px] font-bold text-white truncate">{assessment.domain}</span>
          {assessment.reasons.length > 0 ? (
            <span className="block mt-1 space-y-0.5">
              {assessment.reasons.map((r, i) => (
                <span key={i} className="block text-[9px] text-amber-400/90">• {r}</span>
              ))}
            </span>
          ) : (
            <span className="block mt-1 text-[9px] text-text-secondary">{t.trustNoIssues}</span>
          )}
        </span>
      )}
    </span>
  );
};

export default TrustBadge;
