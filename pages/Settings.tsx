
import React, { useState, useEffect } from 'react';
import { UserConfig, Language } from '../types';
import { translations } from '../translations';
import { getApiKey, setApiKey, getModel, setModel, testConnection } from '../services/geminiService';

interface SettingsProps {
  config: UserConfig;
  onUpdate: (newConfig: UserConfig) => void;
}

const MODEL_OPTIONS = [
  { id: 'gemini-flash-latest', label: 'Flash (recommended — fast, stable)' },
  { id: 'gemini-3-flash-preview', label: 'Flash Preview (latest features)' },
  { id: 'gemini-pro-latest', label: 'Pro (higher quality, slower)' },
];

const Settings: React.FC<SettingsProps> = ({ config, onUpdate }) => {
  const [localConfig, setLocalConfig] = useState<UserConfig>(config);
  const [isSaved, setIsSaved] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState<string>(getApiKey() || '');
  const [showKey, setShowKey] = useState(false);
  const [model, setModelState] = useState<string>(getModel());
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; detail: string } | null>(null);
  const t = translations[localConfig.language];

  // Sincronizar si config cambia externamente
  useEffect(() => {
    setLocalConfig(config);
  }, [config]);

  const handleSave = () => {
    onUpdate(localConfig);
    setApiKey(apiKeyInput); // BYOK — key lives in localStorage only, never in the repo or bundle
    setModel(model);
    setIsSaved(true);
    setTestResult(null);
    setTimeout(() => setIsSaved(false), 3000);
  };

  const handleTest = async () => {
    setApiKey(apiKeyInput);
    setModel(model);
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
          <p className="text-text-secondary">Personaliza tu experiencia ProdIntel.</p>
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
          {/* AI Connection — BYOK */}
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
                  placeholder="AIza..."
                  autoComplete="off"
                  className="flex-1 bg-background border border-border rounded-xl p-4 text-white font-mono text-sm focus:ring-2 focus:ring-primary focus:outline-none transition-all"
                />
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="px-4 bg-background border border-border rounded-xl text-text-secondary hover:text-white transition-all"
                  aria-label="toggle key visibility"
                >
                  <span className="material-symbols-outlined">{showKey ? 'visibility_off' : 'visibility'}</span>
                </button>
                <button
                  onClick={handleTest}
                  disabled={testing || !apiKeyInput.trim()}
                  className="px-5 bg-primary/10 border border-primary/30 hover:bg-primary text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all disabled:opacity-40"
                >
                  {testing ? t.testing : testResult?.ok ? t.connectionOk : testResult ? t.connectionFail : t.testConnection}
                </button>
              </div>
              <p className="text-[11px] text-text-secondary/80 leading-relaxed">{t.apiKeyDesc}</p>
              {testResult && !testResult.ok && (
                <p className="text-[11px] text-red-400 font-mono break-all">{testResult.detail.slice(0, 160)}</p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-text-secondary uppercase">{t.modelLabel}</label>
              <select
                value={model}
                onChange={(e) => setModelState(e.target.value)}
                className="w-full bg-background border border-border rounded-xl p-4 text-white text-sm focus:ring-2 focus:ring-primary focus:outline-none transition-all"
              >
                {MODEL_OPTIONS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
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
