
import React, { useState } from 'react';
import { generateProductDescription } from '../services/geminiService';
import { Language } from '../types';
import { translations } from '../translations';

interface AIAssistantProps {
  lang: Language;
}

const AIAssistant: React.FC<AIAssistantProps> = ({ lang }) => {
  const t = translations[lang];
  const [productInfo, setProductInfo] = useState('');
  const [tone, setTone] = useState('Professional');
  const [audience, setAudience] = useState('General Public');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!productInfo) return;
    setLoading(true);
    try {
      const text = await generateProductDescription(productInfo, tone, audience, lang);
      setResult(text || "Error");
    } catch (error) {
      setResult("Error connecting to AI.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-[1200px] mx-auto animate-in slide-in-from-bottom-4 duration-500">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-white font-display mb-2">{t.assistant.title}</h2>
        <p className="text-text-secondary">{t.assistant.desc}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-surface rounded-xl border border-border p-6 shadow-xl">
            <div className="space-y-6">
              <div className="flex flex-col gap-2">
                <label className="text-white text-sm font-bold">{t.assistant.inputLabel}</label>
                <textarea 
                  value={productInfo}
                  onChange={(e) => setProductInfo(e.target.value)}
                  className="w-full min-h-[160px] bg-background border border-border rounded-lg text-white p-4 text-sm focus:ring-2 focus:ring-primary focus:outline-none transition-all placeholder:text-text-secondary/30"
                  placeholder={t.assistant.inputPlaceholder}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-white text-sm font-bold">{t.assistant.tone}</label>
                  <select 
                    value={tone}
                    onChange={(e) => setTone(e.target.value)}
                    className="bg-background border border-border rounded-lg text-white p-3 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                  >
                    <option>Professional</option>
                    <option>Witty & Fun</option>
                    <option>Persuasive</option>
                    <option>Luxurious</option>
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-white text-sm font-bold">{t.assistant.audience}</label>
                  <select 
                    value={audience}
                    onChange={(e) => setAudience(e.target.value)}
                    className="bg-background border border-border rounded-lg text-white p-3 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                  >
                    <option>General Public</option>
                    <option>Tech Enthusiasts</option>
                    <option>Gen Z</option>
                    <option>Budget Shoppers</option>
                  </select>
                </div>
              </div>

              <button 
                onClick={handleGenerate}
                disabled={loading}
                className="w-full py-4 bg-primary hover:bg-primary-hover disabled:bg-primary/50 text-white font-bold rounded-lg shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2"
              >
                {loading ? <span className="material-symbols-outlined animate-spin text-[20px]">autorenew</span> : <span className="material-symbols-outlined text-[20px]">auto_awesome</span>}
                {loading ? t.loading : t.assistant.generateBtn}
              </button>
            </div>
          </div>

          <div className="bg-gradient-to-br from-primary/10 to-transparent border border-primary/20 rounded-xl p-5 flex gap-4">
            <span className="material-symbols-outlined text-primary">lightbulb</span>
            <p className="text-text-secondary text-xs">{t.assistant.proTip}</p>
          </div>
        </div>

        <div className="bg-surface rounded-xl border border-border overflow-hidden flex flex-col min-h-[500px] shadow-2xl relative">
          <div className="px-6 py-4 border-b border-border bg-[#1a2332]/50 flex justify-between items-center text-white text-xs font-bold uppercase tracking-widest">
            AI Generated Output
          </div>
          <div className="flex-1 p-8 overflow-y-auto bg-[#0f1521] text-text-secondary font-body leading-relaxed whitespace-pre-wrap">
            {result || <p className="opacity-30 italic text-center mt-20">Waiting for generation...</p>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIAssistant;
