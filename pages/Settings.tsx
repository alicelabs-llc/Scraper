
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { UserConfig, Language } from '../types';
import { translations } from '../translations';
import { testConnection } from '../services/geminiService';
import {
  getProviderChoice, setProviderChoice, getCustomBase, setCustomBase,
  getStoredModel, setStoredModel, invalidateDetection, providerSummary, pingKey,
} from '../services/ai/client';
import { PROVIDERS, PROVIDER_ORDER, detectFromPrefix } from '../services/ai/providers';
import {
  getVault, addToVault, removeFromVault, moveVault, setVaultStatus,
  VAULT_EVENT, VaultEntry,
} from '../services/ai/vault';
import { parseAiError } from '../services/ai/errors';
import { sanitizeApiKey, looksLikeApiKey, maskKey } from '../services/security';


interface SettingsProps {
  config: UserConfig;
  onUpdate: (newConfig: UserConfig) => void;
  onNavigate?: (tab: string) => void;
}

const FREE_KEY_LINKS = [
  { name: 'Google Gemini', url: 'https://aistudio.google.com/apikey', tag: 'AIza…' },
  { name: 'Groq', url: 'https://console.groq.com/keys', tag: 'gsk_…' },
  { name: 'Cerebras', url: 'https://cloud.cerebras.ai', tag: 'csk-…' },
  { name: 'OpenRouter', url: 'https://openrouter.ai/keys', tag: 'sk-or-…' },
];

const STATUS_DOT: Record<string, string> = {
  ok: 'bg-emerald-500',
  invalid: 'bg-red-500',
  error: 'bg-amber-500',
  unknown: 'bg-zinc-600',
};

const Settings: React.FC<SettingsProps> = ({ config, onUpdate, onNavigate }) => {
  const [localConfig, setLocalConfig] = useState<UserConfig>(config);
  const [isSaved, setIsSaved] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState<string>('');
  const [showKey, setShowKey] = useState(false);
  const [provider, setProviderState] = useState<string>(getProviderChoice());
  const [customBase, setCustomBaseState] = useState<string>(getCustomBase());
  const [model, setModelState] = useState<string>(getStoredModel());
  const [detectLabel, setDetectLabel] = useState<string>('');
  const [infraWarn, setInfraWarn] = useState<string>('');
  const [vault, setVault] = useState<VaultEntry[]>([]);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [globalTest, setGlobalTest] = useState<{ ok: boolean; detail: string; attempts?: { provider: string; keyLabel: string; error: string }[] } | null>(null);
  const [autoConnected, setAutoConnected] = useState<{ provider: string; model: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const t = translations[localConfig.language];

  const refreshVault = useCallback(async () => {
    try { setVault(await getVault()); } catch { /* ignore */ }
  }, []);

  useEffect(() => { setLocalConfig(config); }, [config]);
  useEffect(() => { refreshVault(); }, [refreshVault]);
  useEffect(() => {
    const h = () => { refreshVault(); };
    window.addEventListener(VAULT_EVENT, h);
    return () => window.removeEventListener(VAULT_EVENT, h);
  }, [refreshVault]);

  // Live prefix detection (offline, instant) — "paste ANY key" UX.
  // Infra tokens (Vercel/GitHub/…) get an explicit warning and are rejected.
  useEffect(() => {
    const key = sanitizeApiKey(apiKeyInput);
    if (!key) { setDetectLabel(''); setInfraWarn(''); return; }
    let alive = true;
    const timer = setTimeout(async () => {
      if (!alive) return;
      const det = await detectFromPrefix(key);
      if (!alive) return;
      if (!det) { setDetectLabel(t.setKeyInvalid); setInfraWarn(''); return; }
      if (det.infra) {
        setDetectLabel('');
        setInfraWarn(
          det.infra.kind === 'vercel' ? t.setInfraVercel
            : det.infra.kind === 'github' ? t.setInfraGithub
            : t.setInfraOther
        );
        return;
      }
      setInfraWarn('');
      if (det.sure) setDetectLabel(`${t.setDetected}: ${PROVIDERS[det.sure].name}`);
      else if (det.candidates.length === 1) setDetectLabel(`${t.setDetected}: ${PROVIDERS[det.candidates[0]].name}`);
      else setDetectLabel(t.setWillProbe);
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [apiKeyInput, t]);

  const canAdd = useMemo(() => {
    const key = sanitizeApiKey(apiKeyInput);
    return !!key && looksLikeApiKey(key) && !infraWarn;
  }, [apiKeyInput, infraWarn]);

  /** Add key to the vault, then TEST it immediately — "work right away". */
  const handleAddKey = async () => {
    const key = sanitizeApiKey(apiKeyInput);
    if (!key || !looksLikeApiKey(key) || infraWarn) return;
    setAdding(true);
    setGlobalTest(null);
    try {
      const entry = await addToVault(key);
      setApiKeyInput('');
      if (entry) {
        setTestingId(entry.id);
        const res = await pingKey(key);
        if (res.ok && res.provider) {
          await setVaultStatus(entry.id, 'ok', `${res.provider} · ${res.model || ''}`);
          setAutoConnected({
            provider: PROVIDERS[res.provider as keyof typeof PROVIDERS]?.name || res.provider,
            model: res.model || 'auto',
          });
        } else {
          const parsed = parseAiError(res.error || '');
          const hint = parsed.kind === 'rejected' ? t.errRejected
            : parsed.kind === 'quota' ? t.errQuota
            : parsed.kind === 'network' ? t.errNetwork
            : parsed.kind === 'infra' ? t.errInfra
            : parsed.kind === 'timeout' ? t.errTimeout
            : `${t.errOther}: ${(res.error || '').slice(0, 60)}`;
          await setVaultStatus(entry.id, parsed.kind === 'rejected' ? 'invalid' : 'error', hint);
          setAutoConnected(null);
        }
        setTestingId(null);
        await refreshVault();
      }
    } finally {
      setAdding(false);
    }
  };

  const handleTestRow = async (entry: VaultEntry) => {
    setTestingId(entry.id);
    try {
      const res = await pingKey(entry.key);
      if (res.ok) {
        await setVaultStatus(entry.id, 'ok', `${res.provider || ''} · ${res.model || ''}`);
      } else {
        const parsed = parseAiError(res.error || '');
        await setVaultStatus(entry.id, parsed.kind === 'rejected' ? 'invalid' : 'error', res.error || '');
      }
    } finally {
      setTestingId(null);
      refreshVault();
    }
  };

  const handleGlobalTest = async () => {
    setGlobalTest(null);
    setAdding(true);
    try {
      const res = await testConnection();
      setGlobalTest(res);
      refreshVault();
    } finally {
      setAdding(false);
    }
  };

  const currentProviderInfo = providerSummary();

  const providerOptions = useMemo(
    () => [{ id: 'auto' as const, name: t.setProviderAuto }, ...PROVIDER_ORDER.map((id) => ({ id, name: PROVIDERS[id].name }))],
    [t]
  );

  const modelOptions = useMemo(() => {
    if (provider === 'auto') return [];
    if (provider === 'custom') return [];
    return PROVIDERS[provider as keyof typeof PROVIDERS].models || [];
  }, [provider]);

  const handleSave = () => {
    onUpdate(localConfig);
    setProviderChoice(provider as any);
    setCustomBase(customBase);
    setStoredModel(model);
    invalidateDetection(); // force fresh detection with the new key/provider
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  return (
    <div className="p-8 max-w-[800px] mx-auto animate-in slide-in-from-bottom-4 duration-500">
      <div className="mb-8 flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold text-white font-display mb-2">{t.settings}</h2>
          <p className="text-text-secondary">ProdIntel v5.1 — Alicelabs.</p>
        </div>
        {isSaved && (
          <div className="flex items-center gap-2 text-emerald-500 font-bold text-sm bg-emerald-500/10 px-4 py-2 rounded-full animate-bounce">
            <span className="material-symbols-outlined text-[18px]">check_circle</span>
            {t.changesSaved}
          </div>
        )}
      </div>

      <div className="bg-surface rounded-2xl border border-border overflow-hidden shadow-2xl transition-all duration-300">
        <div className="p-8 space-y-8">
          {/* ===== AI Connection — vault with failover ===== */}
          <section className="space-y-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">key</span>
              {t.aiSection}
            </h3>

            {/* Auto-connect banner: "work right away" */}
            {autoConnected && (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center gap-3">
                <span className="material-symbols-outlined text-emerald-500">bolt</span>
                <p className="text-[12px] text-white flex-1">
                  <b className="text-emerald-500">{t.autoConnected}</b> {autoConnected.provider} · <span className="font-mono text-[11px]">{autoConnected.model}</span>
                </p>
                {onNavigate && (
                  <button
                    onClick={() => onNavigate('daily-hunt')}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white text-[10px] font-black uppercase tracking-wider rounded-lg transition-all whitespace-nowrap"
                  >
                    {t.goScanNow}
                  </button>
                )}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-bold text-text-secondary uppercase">{t.apiKey}</label>
              <div className="flex gap-2">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="AIza… · sk-… · sk-ant-… · gsk_… · xai-…"
                  autoComplete="off"
                  spellCheck={false}
                  className="flex-1 bg-background border border-border rounded-xl p-4 text-white font-mono text-sm focus:ring-2 focus:ring-primary focus:outline-none transition-all"
                />
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="px-4 bg-background border border-border rounded-xl text-text-secondary hover:text-white transition-all"
                  aria-label="toggle key visibility"
                >
                  <span className="material-symbols-outlined">{showKey ? 'visibility_off' : 'visibility'}</span>
                </button>
              </div>
              {detectLabel && (
                <p className="text-[11px] text-primary font-bold flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[14px]">auto_awesome</span>{detectLabel}
                </p>
              )}
              {infraWarn && (
                <p className="text-[11px] text-amber-400 font-bold flex items-start gap-1.5 leading-relaxed">
                  <span className="material-symbols-outlined text-[16px] shrink-0">warning</span>{infraWarn}
                </p>
              )}
              <p className="text-[11px] text-text-secondary/80 leading-relaxed">{t.apiKeyDesc}</p>
              <button
                onClick={handleAddKey}
                disabled={!canAdd || adding}
                className="px-5 py-3 bg-primary/10 border border-primary/30 hover:bg-primary text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all disabled:opacity-40 flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[16px]">{adding ? 'progress_activity' : 'add_circle'}</span>
                {adding ? t.setConnecting : t.setAddKeyBtn}
              </button>
            </div>

            {/* Key vault — ordered, with failover */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-text-secondary uppercase flex items-center gap-2">
                  {t.setVault}
                  <span className="px-2 py-0.5 bg-primary/10 border border-primary/30 text-primary rounded-full text-[9px]">{vault.length}</span>
                </label>
              </div>
              <p className="text-[11px] text-text-secondary/70 leading-relaxed">{t.setVaultDesc}</p>

              {vault.map((e, i) => (
                <div key={e.id} className="flex items-center gap-2 bg-background border border-border rounded-xl px-3 py-2.5">
                  <span className={`size-2.5 rounded-full shrink-0 ${STATUS_DOT[e.status] || 'bg-zinc-600'}`} title={e.statusDetail || ''}></span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-mono text-white truncate">
                      {i === 0 && <span className="text-primary font-black mr-1">★</span>}
                      {maskKey(e.key)}
                    </p>
                    <p className="text-[9px] text-text-secondary/70 truncate">
                      {e.provider && PROVIDERS[e.provider as keyof typeof PROVIDERS] ? `${PROVIDERS[e.provider as keyof typeof PROVIDERS].name} · ` : ''}
                      {e.status === 'ok' ? `${t.setKeyOk}${e.statusDetail ? ` · ${e.statusDetail.slice(0, 40)}` : ''}`
                        : e.status === 'invalid' ? `${t.setKeyInvalidState}${e.statusDetail ? ` · ${e.statusDetail.slice(0, 50)}` : ''}`
                        : e.status === 'error' ? (e.statusDetail ? `${e.statusDetail.slice(0, 70)}` : t.errOther)
                        : t.setKeyUntested}
                    </p>
                  </div>
                  <button
                    onClick={() => moveVault(e.id, -1)}
                    disabled={i === 0}
                    title={t.setUp}
                    className="p-1.5 rounded-lg text-text-secondary hover:text-white disabled:opacity-20 transition-all"
                  >
                    <span className="material-symbols-outlined text-[16px]">keyboard_arrow_up</span>
                  </button>
                  <button
                    onClick={() => moveVault(e.id, 1)}
                    disabled={i === vault.length - 1}
                    title={t.setDown}
                    className="p-1.5 rounded-lg text-text-secondary hover:text-white disabled:opacity-20 transition-all"
                  >
                    <span className="material-symbols-outlined text-[16px]">keyboard_arrow_down</span>
                  </button>
                  <button
                    onClick={() => handleTestRow(e)}
                    disabled={testingId === e.id}
                    title={t.setKeyTest}
                    className="px-2 py-1.5 rounded-lg border border-border text-[9px] font-black uppercase text-text-secondary hover:text-white hover:border-primary/50 transition-all disabled:opacity-40"
                  >
                    {testingId === e.id ? '…' : t.setKeyTest}
                  </button>
                  <button
                    onClick={async () => { await removeFromVault(e.id); refreshVault(); }}
                    title={t.setKeyDelete}
                    className="p-1.5 rounded-lg text-text-secondary hover:text-red-400 transition-all"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                  </button>
                </div>
              ))}

              {vault.length > 0 && (
                <button
                  onClick={handleGlobalTest}
                  disabled={adding}
                  className="px-4 py-2 bg-background border border-border rounded-xl text-[10px] font-black uppercase tracking-widest text-text-secondary hover:text-white hover:border-primary/50 transition-all disabled:opacity-40"
                >
                  {t.testConnection}
                </button>
              )}

              {globalTest && (
                <div className={`p-3 rounded-xl border text-[10px] font-mono space-y-1 ${globalTest.ok ? 'bg-emerald-500/5 border-emerald-500/30 text-emerald-500' : 'bg-red-500/5 border-red-500/30 text-red-400'}`}>
                  <p className="font-bold">{globalTest.ok ? `✓ ${globalTest.detail}` : `✗ ${t.errOther}`}</p>
                  {(globalTest.attempts || []).map((a, i) => (
                    <p key={i} className="opacity-80 break-all">
                      ✗ {a.keyLabel} · {a.provider} — {a.error.slice(0, 90)}
                    </p>
                  ))}
                </div>
              )}
            </div>

            {/* Free AI keys — the honest path out of a dead key */}
            <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-2">
              <p className="text-[11px] font-bold text-white flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[15px] text-primary">redeem</span>{t.setFreeKeys}
              </p>
              <p className="text-[10px] text-text-secondary/80">{t.setFreeKeysHint}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                {FREE_KEY_LINKS.map((l) => (
                  <a
                    key={l.url}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 bg-background border border-border rounded-lg text-[10px] font-bold text-text-secondary hover:text-white hover:border-primary/50 transition-all flex items-center gap-1.5"
                  >
                    {l.name}
                    <span className="font-mono text-[8px] text-primary/70">{l.tag}</span>
                    <span className="material-symbols-outlined text-[12px]">open_in_new</span>
                  </a>
                ))}
              </div>
            </div>

            {/* Advanced: provider / model / custom endpoint */}
            <details className="group">
              <summary className="cursor-pointer text-[11px] font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1.5 select-none">
                <span className="material-symbols-outlined text-[16px] group-open:rotate-90 transition-transform">chevron_right</span>
                {t.setProvider} · {t.modelLabel}
                {currentProviderInfo && (
                  <span className="ml-2 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 rounded-full text-[9px] normal-case font-mono">
                    {currentProviderInfo.name} · {currentProviderInfo.model}
                  </span>
                )}
              </summary>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-text-secondary uppercase">{t.setProvider}</label>
                  <select
                    value={provider}
                    onChange={(e) => { setProviderState(e.target.value); setModelState(''); setGlobalTest(null); }}
                    className="w-full bg-background border border-border rounded-xl p-4 text-white text-sm focus:ring-2 focus:ring-primary focus:outline-none transition-all"
                  >
                    {providerOptions.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  {provider !== 'auto' && provider !== 'custom' && (
                    <p className="text-[10px] text-text-secondary/60">{PROVIDERS[provider as keyof typeof PROVIDERS].keyHint}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-text-secondary uppercase">{t.modelLabel}</label>
                  {provider === 'custom' ? (
                    <input
                      type="text"
                      value={model}
                      onChange={(e) => setModelState(e.target.value)}
                      placeholder={t.setModelPh}
                      spellCheck={false}
                      className="w-full bg-background border border-border rounded-xl p-4 text-white font-mono text-sm focus:ring-2 focus:ring-primary focus:outline-none transition-all"
                    />
                  ) : (
                    <select
                      value={model}
                      onChange={(e) => setModelState(e.target.value)}
                      className="w-full bg-background border border-border rounded-xl p-4 text-white text-sm focus:ring-2 focus:ring-primary focus:outline-none transition-all"
                    >
                      <option value="">{t.setModelAuto}</option>
                      {modelOptions.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {provider === 'custom' && (
                <div className="space-y-2 mt-4">
                  <label className="text-xs font-bold text-text-secondary uppercase">{t.setCustomBase}</label>
                  <input
                    type="url"
                    value={customBase}
                    onChange={(e) => setCustomBaseState(e.target.value)}
                    placeholder="https://mi-gateway.com/v1"
                    spellCheck={false}
                    className="w-full bg-background border border-border rounded-xl p-4 text-white font-mono text-sm focus:ring-2 focus:ring-primary focus:outline-none transition-all"
                  />
                  <p className="text-[10px] text-text-secondary/60">{t.setCustomHint}</p>
                </div>
              )}
            </details>

            {/* Security note */}
            <div className="flex gap-3 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
              <span className="material-symbols-outlined text-emerald-500 text-[18px]">security</span>
              <p className="text-[11px] text-text-secondary leading-relaxed">{t.setSecurityNote}</p>
            </div>
          </section>

          <section className="space-y-6 pt-8 border-t border-border">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">person</span>
              {t.profileInfo}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-text-secondary uppercase">{t.userName}</label>
                <input
                  type="text"
                  value={localConfig.name}
                  onChange={(e) => setLocalConfig({...localConfig, name: e.target.value})}
                  className="w-full bg-background border border-border rounded-xl p-4 text-white focus:ring-2 focus:ring-primary focus:outline-none transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-text-secondary uppercase">{t.userRole}</label>
                <input
                  type="text"
                  value={localConfig.role}
                  onChange={(e) => setLocalConfig({...localConfig, role: e.target.value})}
                  className="w-full bg-background border border-border rounded-xl p-4 text-white focus:ring-2 focus:ring-primary focus:outline-none transition-all"
                />
              </div>
            </div>
          </section>

          <section className="space-y-6 pt-8 border-t border-border">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">language</span>
              {t.selectLanguage}
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { id: 'en', label: 'English', flag: '🇺🇸' },
                { id: 'es', label: 'Español', flag: '🇪🇸' },
                { id: 'fr', label: 'Français', flag: '🇫🇷' },
                { id: 'de', label: 'Deutsch', flag: '🇩🇪' },
                { id: 'zh', label: '中文', flag: '🇨🇳' }
              ].map((lang) => (
                <button
                  key={lang.id}
                  onClick={() => setLocalConfig({...localConfig, language: lang.id as Language})}
                  className={`p-4 rounded-xl border transition-all duration-300 flex flex-col items-center gap-2 ${
                    localConfig.language === lang.id
                    ? 'border-primary bg-primary/10 text-white shadow-lg'
                    : 'border-border bg-background text-text-secondary hover:border-border/80'
                  }`}
                >
                  <span className="text-2xl">{lang.flag}</span>
                  <span className="text-xs font-bold">{lang.label}</span>
                </button>
              ))}
            </div>
          </section>

          <button
            onClick={handleSave}
            className={`w-full py-4 font-black uppercase tracking-widest rounded-xl transition-all shadow-xl flex items-center justify-center gap-3 ${
              isSaved ? 'bg-emerald-500 text-white' : 'bg-primary hover:bg-primary-hover text-white shadow-primary/20'
            }`}
          >
            <span className="material-symbols-outlined">
              {isSaved ? 'check_circle' : 'save'}
            </span>
            {isSaved ? t.changesSaved : t.saveChanges}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Settings;
