
import React, { useState, useEffect, useMemo } from 'react';
import { UserConfig, Language } from '../types';
import { translations } from '../translations';
import { getApiKey, setApiKey, testConnection } from '../services/geminiService';
import {
  getProviderChoice, setProviderChoice, getCustomBase, setCustomBase,
  getStoredModel, setStoredModel, invalidateDetection, providerSummary,
} from '../services/ai/client';
import { PROVIDERS, PROVIDER_ORDER, detectFromPrefix } from '../services/ai/providers';
import { sanitizeApiKey, looksLikeApiKey, maskKey } from '../services/security';

interface SettingsProps {
  config: UserConfig;
  onUpdate: (newConfig: UserConfig) => void;
}

const Settings: React.FC<SettingsProps> = ({ config, onUpdate }) => {
  const [localConfig, setLocalConfig] = useState<UserConfig>(config);
  const [isSaved, setIsSaved] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState<string>(getApiKey() || '');
  const [showKey, setShowKey] = useState(false);
  const [provider, setProviderState] = useState<string>(getProviderChoice());
  const [customBase, setCustomBaseState] = useState<string>(getCustomBase());
  const [model, setModelState] = useState<string>(getStoredModel());
  const [detectLabel, setDetectLabel] = useState<string>('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; detail: string } | null>(null);
  const t = translations[localConfig.language];

  // Sincronizar si config cambia externamente
  useEffect(() => {
    setLocalConfig(config);
  }, [config]);

  // Live prefix detection (offline, instant) — "paste ANY key" UX
  useEffect(() => {
    const key = sanitizeApiKey(apiKeyInput);
    if (!key) { setDetectLabel(''); return; }
    let alive = true;
    const timer = setTimeout(async () => {
      const det = await detectFromPrefix(key);
      if (!alive) return;
      if (!det) { setDetectLabel(t.setKeyInvalid); return; }
      if (det.sure) setDetectLabel(`${t.setDetected}: ${PROVIDERS[det.sure].name}`);
      else if (det.candidates.length === 1) setDetectLabel(`${t.setDetected}: ${PROVIDERS[det.candidates[0]].name}`);
      else setDetectLabel(t.setWillProbe);
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [apiKeyInput, t]);

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
    const clean = sanitizeApiKey(apiKeyInput);
    if (clean && !looksLikeApiKey(clean)) {
      setTestResult({ ok: false, detail: t.setKeyInvalid });
      return;
    }
    setApiKey(clean);
    setProviderChoice(provider as any);
    setCustomBase(customBase);
    setStoredModel(model);
    invalidateDetection(); // force fresh detection with the new key/provider
    setIsSaved(true);
    setTestResult(null);
    setTimeout(() => setIsSaved(false), 3000);
  };

  const handleTest = async () => {
    const clean = sanitizeApiKey(apiKeyInput);
    if (clean && !looksLikeApiKey(clean)) {
      setTestResult({ ok: false, detail: t.setKeyInvalid });
      return;
    }
    setApiKey(clean);
    setProviderChoice(provider as any);
    setCustomBase(customBase);
    setStoredModel(model);
    invalidateDetection();
    setTesting(true);
    setTestResult(null);
    const result = await testConnection();
    setTestResult(result);
    setTesting(false);
  };

  return (
    <div className="p-8 max-w-[800px] mx-auto animate-in slide-in-from-bottom-4 duration-500">
      <div className="mb-8 flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold text-white font-display mb-2">{t.settings}</h2>
          <p className="text-text-secondary">ProdIntel v5 — Alicelabs.</p>
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
          {/* AI Connection — ANY provider BYOK */}
          <section className="space-y-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">key</span>
              {t.aiSection}
            </h3>

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
              <p className="text-[11px] text-text-secondary/80 leading-relaxed">{t.apiKeyDesc}</p>
              {getApiKey() && (
                <p className="text-[10px] text-text-secondary/60 font-mono">
                  {t.setKeyStored}: <span className="text-emerald-500">{maskKey(getApiKey()!)}</span>
                  {currentProviderInfo ? ` · ${currentProviderInfo.name}` : ''}
                </p>
              )}
              <button
                onClick={handleTest}
                disabled={testing || !apiKeyInput.trim()}
                className="px-5 py-3 bg-primary/10 border border-primary/30 hover:bg-primary text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all disabled:opacity-40"
              >
                {testing ? t.setConnecting : testResult?.ok ? t.connectionOk : testResult ? t.connectionFail : t.testConnection}
              </button>
              {testResult && (
                <p className={`text-[11px] font-mono break-all ${testResult.ok ? 'text-emerald-500' : 'text-red-400'}`}>
                  {testResult.ok ? `✓ ${testResult.detail}` : testResult.detail.slice(0, 200)}
                </p>
              )}
            </div>

            {/* Provider selection */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-text-secondary uppercase">{t.setProvider}</label>
                <select
                  value={provider}
                  onChange={(e) => {
                    setProviderState(e.target.value);
                    setModelState('');
                    setTestResult(null);
                  }}
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
              <div className="space-y-2">
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
