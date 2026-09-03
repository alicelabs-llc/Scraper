
import React, { useState, useEffect } from 'react';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import DailyFinder from './pages/DailyFinder';
import Analysis from './pages/Analysis';
import AIAssistant from './pages/AIAssistant';
import ProductDetails from './pages/ProductDetails';
import Watchlist from './pages/Watchlist';
import Compare from './pages/Compare';
import Settings from './pages/Settings';
import { WinningProduct, UserConfig } from './types';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedProduct, setSelectedProduct] = useState<WinningProduct | null>(null);
  const [userConfig, setUserConfig] = useState<UserConfig>(() => {
    const saved = localStorage.getItem('prodintel_config');
    return saved ? JSON.parse(saved) : {
      name: 'Alex Morgan',
      role: 'Seller Pro',
      language: 'es',
      avatar: 'https://picsum.photos/seed/alex_2026/100'
    };
  });

  // Guardar cada cambio de userConfig en localStorage
  useEffect(() => {
    localStorage.setItem('prodintel_config', JSON.stringify(userConfig));
  }, [userConfig]);

  const handleAnalyzeProduct = (product: WinningProduct) => {
    setSelectedProduct(product);
    setActiveTab('details');
  };

  const renderContent = () => {
    const lang = userConfig.language;
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard lang={lang} />;
      case 'daily-hunt':
        return <DailyFinder lang={lang} onAnalyzeProduct={handleAnalyzeProduct} />;
      case 'analysis':
        return <Analysis lang={lang} niche={selectedProduct?.niche || `E-commerce ${new Date().getFullYear()}`} />;
      case 'watchlist':
        return <Watchlist lang={lang} onAnalyzeProduct={handleAnalyzeProduct} />;
      case 'compare':
        return <Compare lang={lang} onAnalyzeProduct={handleAnalyzeProduct} />;
      case 'assistant':
        return <AIAssistant lang={lang} />;
      case 'details':
        return <ProductDetails lang={lang} product={selectedProduct} />;
      case 'settings':
        return <Settings config={userConfig} onUpdate={setUserConfig} />;
      default:
        return <Dashboard lang={lang} />;
    }
  };

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab} user={userConfig}>
      {renderContent()}
    </Layout>
  );
};

export default App;
