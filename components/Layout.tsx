
import React from 'react';
import { NAV_ITEMS } from '../constants';
import { UserConfig } from '../types';
import { translations } from '../translations';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (id: string) => void;
  user: UserConfig;
}

const Layout: React.FC<LayoutProps> = ({ children, activeTab, setActiveTab, user }) => {
  const t = translations[user.language];

  const getLabel = (id: string) => {
    switch(id) {
      case 'dashboard': return t.dashboard;
      case 'daily-hunt': return t.dailyHunt;
      case 'analysis': return t.marketAnalysis;
      case 'watchlist': return t.watchlist;
      case 'assistant': return t.aiAssistant;
      case 'details': return t.productDetails;
      case 'settings': return t.settings;
      default: return id;
    }
  };

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden selection:bg-primary/30 selection:text-white">
      <aside className="hidden lg:flex flex-col w-72 h-full bg-[#0d131d] border-r border-border shrink-0 z-40 relative">
        <div className="p-8">
          <div className="flex items-center gap-3 mb-12">
            <div className="size-11 rounded-xl bg-gradient-to-br from-primary to-primary-hover flex items-center justify-center text-white shadow-lg shadow-primary/20 ring-4 ring-primary/10">
              <span className="material-symbols-outlined text-[28px]">insights</span>
            </div>
            <div>
              <h1 className="text-white text-xl font-black font-display tracking-tight leading-none">ProdIntel</h1>
              <p className="text-primary text-[9px] uppercase font-black tracking-[0.2em] mt-1.5 opacity-80">2026 Edition</p>
            </div>
          </div>

          <nav className="flex flex-col gap-2">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 relative group ${
                  activeTab === item.id
                    ? 'bg-primary text-white font-bold shadow-xl shadow-primary/20 translate-x-1'
                    : 'text-text-secondary hover:bg-surface hover:text-white'
                }`}
              >
                {activeTab === item.id && (
                  <span className="absolute left-[-1.5rem] w-1.5 h-6 bg-primary rounded-r-full"></span>
                )}
                <span className={`material-symbols-outlined text-[22px] ${activeTab === item.id ? 'fill-1' : ''}`}>
                  {item.icon}
                </span>
                <span className="text-sm font-semibold">{getLabel(item.id)}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="mt-auto p-6 border-t border-border/50">
          <button 
            onClick={() => setActiveTab('settings')}
            className="flex items-center gap-3 w-full px-2 group hover:bg-surface/50 p-3 rounded-2xl transition-all"
          >
            <div className="relative">
              <img 
                src={user.avatar} 
                className="size-10 rounded-full border-2 border-border group-hover:border-primary transition-all shadow-md" 
                alt="Profile"
              />
              <span className="absolute bottom-0 right-0 size-3 bg-emerald-500 border-2 border-[#0d131d] rounded-full"></span>
            </div>
            <div className="text-left overflow-hidden">
              <p className="text-white text-sm font-black truncate">{user.name}</p>
              <p className="text-text-secondary text-[10px] font-bold uppercase tracking-wider opacity-60">{user.role}</p>
            </div>
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-full relative overflow-hidden bg-background">
        <header className="h-20 flex items-center justify-between px-8 border-b border-border/50 bg-[#101622]/90 backdrop-blur-xl sticky top-0 z-30">
          <div className="flex items-center gap-4">
             <h2 className="text-white font-bold font-display text-xl tracking-tight">
                {getLabel(activeTab)}
             </h2>
             <span className="text-[10px] font-black text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded">2026 LIVE</span>
          </div>
          <div className="flex items-center gap-4">
             <div className="text-right hidden sm:block">
                <p className="text-white font-bold text-xs">{t.welcome}, {user.name.split(' ')[0]}</p>
                <p className="text-text-secondary text-[10px] uppercase font-bold">{user.language.toUpperCase()} REGION</p>
             </div>
             <button onClick={() => setActiveTab('settings')} className="size-11 rounded-xl bg-surface hover:bg-surface-light border border-border text-text-secondary hover:text-white flex items-center justify-center transition-all">
              <span className="material-symbols-outlined">settings</span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto bg-background custom-scrollbar">
            {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
