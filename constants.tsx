
import React from 'react';
import { NicheData } from './types';

export const NICHES: NicheData[] = [
  { name: 'Pet Supplies', revenue: '$1.2M', growth: '+14%', sellers: 124, status: 'High Opportunity', color: 'bg-emerald-500/20 border-emerald-500/30' },
  { name: 'Office Furniture', revenue: '$850k', growth: '+2%', sellers: 89, status: 'Moderate', color: 'bg-yellow-500/20 border-yellow-500/30' },
  { name: 'Eco Toys', revenue: '$420k', growth: '+22%', sellers: 45, status: 'High Opportunity', color: 'bg-emerald-500/40 border-emerald-500' },
  { name: 'Home Decor', revenue: '$680k', growth: 'Stable', sellers: 210, status: 'Stable', color: 'bg-yellow-500/15 border-yellow-500/20' },
  { name: 'Fitness Gear', revenue: '$540k', growth: '+8%', sellers: 76, status: 'High Opportunity', color: 'bg-emerald-500/20 border-emerald-500/30' },
  { name: 'Supplements', revenue: '$410k', growth: '-5%', sellers: 412, status: 'Saturated', color: 'bg-red-500/20 border-red-500/30' },
];

export const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'space_dashboard' },
  { id: 'daily-hunt', label: 'Daily Hunt', icon: 'travel_explore' },
  { id: 'analysis', label: 'Market Analysis', icon: 'analytics' },
  { id: 'watchlist', label: 'Watchlist', icon: 'bookmarks' },
  { id: 'compare', label: 'Compare', icon: 'compare_arrows' },
  { id: 'assistant', label: 'AI Assistant', icon: 'smart_toy' },
  { id: 'details', label: 'Product Details', icon: 'inventory_2' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];
