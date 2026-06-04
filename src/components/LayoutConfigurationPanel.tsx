/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Sliders, LayoutGrid, Play, Plus, Minus, Edit, Trash2, ArrowRight, Save, RotateCcw, Lock } from 'lucide-react';
import { ShopTopology } from '../types';

interface LayoutConfigurationPanelProps {
  shops: ShopTopology[];
  onUpdateShop: (id: number, updatedFields: Partial<ShopTopology>) => void;
  onResetShop: (id: number) => void;
  onNavigate: (step: 'configuration' | 'layout' | 'simulation') => void;
}

export default function LayoutConfigurationPanel({
  shops,
  onUpdateShop,
  onResetShop,
  onNavigate
}: LayoutConfigurationPanelProps) {
  const [notification, setNotification] = useState<string | null>(null);

  const getHMS = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return { h, m, s };
  };

  const getSuccessorOptions = (currentId: number) => {
    // Return all shops that are further downstream (or 'None')
    const options = shops
      .filter(s => s.id > currentId)
      .map(s => s.name);
    options.push('None');
    return options;
  };

  const handleNumericChange = (
    id: number,
    field: keyof ShopTopology,
    delta: number,
    exactValue: string | null = null
  ) => {
    const shop = shops.find(s => s.id === id);
    if (!shop) return;

    let newValue = exactValue !== null ? parseInt(exactValue) : (shop[field] as number) + delta;
    if (isNaN(newValue)) return;

    // Apply strict guidelines constraints
    if (field === 'width' || field === 'height') {
      newValue = Math.max(5, Math.min(100, newValue));
      onUpdateShop(id, { [field]: newValue });
    } else if (field === 'stations') {
      const minStations = shop.id === 1 ? 1 : 0;
      newValue = Math.max(minStations, Math.min(1000, newValue));
      const updatedFields: Partial<ShopTopology> = { stations: newValue };
      if (newValue > shop.bufferSize) {
        updatedFields.bufferSize = newValue;
      }
      onUpdateShop(id, updatedFields);
    } else if (field === 'cycleTime') {
      newValue = Math.max(1, Math.min(86400, newValue));
      onUpdateShop(id, { [field]: newValue });
    } else if (field === 'bufferSize') {
      newValue = Math.max(shop.stations, Math.min(1000, newValue));
      onUpdateShop(id, { [field]: newValue });
    }
  };

  // Calculations for bottom-row metrics
  const totalWidth = shops.reduce((sum, s) => sum + s.width, 0);
  const maxHeight = Math.max(...shops.map(s => s.height), 0);
  const scaledWidth = Math.round(totalWidth * 0.8);
  const scaledHeight = Math.round(maxHeight * 1.2);

  const triggerSaveNotification = () => {
    setNotification('Draft topology state successfully synchronized with Master Node.');
    setTimeout(() => {
      setNotification(null);
    }, 3000);
  };

  return (
    <div className="flex flex-1 overflow-hidden h-full">
      {/* Side Navigation Drawer */}
      <aside className="bg-surface-container-low border-r border-outline-variant flex flex-col p-4 w-64 shrink-0 justify-between">
        <div className="flex flex-col gap-6">
          <div className="px-2">
            <h2 className="text-primary font-bold text-lg select-none">Phase Control</h2>
            <p className="text-on-surface-variant text-[10px] uppercase font-mono tracking-wider opacity-60">Operational Workflow</p>
          </div>

          <nav className="flex flex-col gap-1">
            {/* Initialization Step */}
            <button 
              type="button" 
              onClick={() => onNavigate('configuration')}
              className="flex items-center gap-3 p-3 transition-all text-on-surface-variant hover:bg-surface-container-high rounded-lg cursor-pointer w-full text-left"
            >
              <Sliders className="w-4 h-4 text-on-surface-variant" />
              <span className="label-caps text-[11px]">Initialization</span>
            </button>

            {/* Layout Step (Active) */}
            <div className="flex items-center gap-3 p-3 bg-secondary-container text-on-secondary-container rounded-lg border-l-2 border-primary select-none w-full">
              <LayoutGrid className="w-4 h-4 text-primary" />
              <span className="label-caps text-[11px] text-primary">Layout</span>
            </div>

            {/* Simulation Step */}
            <button 
              type="button"
              onClick={() => onNavigate('simulation')}
              className="flex items-center gap-3 p-3 transition-all text-on-surface-variant hover:bg-surface-container-high rounded-lg cursor-pointer w-full text-left"
            >
              <Play className="w-4 h-4 text-on-surface-variant" />
              <span className="label-caps text-[11px]">Simulation</span>
            </button>
          </nav>
        </div>

        {/* Sidebar Footer Integrity */}
        <div className="pt-4 border-t border-outline-variant/30 px-2">
          <span className="font-mono text-[9px] uppercase tracking-wider text-on-surface-variant opacity-50 block mb-1">System Integrity</span>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs text-on-surface select-none font-medium">Master Node Active</span>
          </div>
        </div>
      </aside>

      {/* Main Layout Area */}
      <main className="flex-1 flex flex-col overflow-hidden bg-surface-dim relative">
        
        {/* Toast Save Notification */}
        {notification && (
          <div className="absolute top-4 right-6 bg-surface-container border border-green-500/40 text-[#dae2fd] text-xs px-4 py-3 rounded shadow-2xl z-50 flex items-center gap-2 animate-fade-in-down">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span>{notification}</span>
          </div>
        )}

        {/* Main Header */}
        <div className="px-6 py-6 shrink-0 border-b border-outline-variant/20 bg-surface-container-low/40">
          <h1 className="text-2xl font-semibold text-on-surface select-none">Layout Configuration</h1>
          <p className="text-on-surface-variant text-sm mt-1">Define physical span parameters and routing pathways for localized production shops.</p>
        </div>

        {/* Scrollable Shop Cards Row */}
        <div className="flex-1 overflow-x-auto custom-scrollbar px-6 py-8">
          <div className="flex flex-nowrap gap-6 min-w-max pb-4 h-full items-start">
            {shops.map(shop => {
              const successorOptions = getSuccessorOptions(shop.id);
              const hasSuccessorSection = successorOptions.length > 0;

              return (
                <section 
                  key={shop.id}
                  id={`shop-card-${shop.id}`}
                  className="bg-surface-container-low border border-outline-variant rounded-lg flex flex-col w-80 shrink-0 transition-all duration-200 hover:border-primary/40 shadow-lg"
                >
                  {/* Shop Header */}
                  <header className="p-3 border-b border-outline-variant flex justify-between items-center bg-surface-container h-12">
                    <div className="flex items-center gap-2 flex-1 mr-2">
                      <div className={`w-2 h-2 rounded-full ${shop.id === 1 ? 'bg-primary' : 'bg-outline-variant animate-pulse'}`} />
                      <input 
                        type="text" 
                        value={shop.name} 
                        onChange={(e) => onUpdateShop(shop.id, { name: e.target.value })}
                        className="bg-transparent border-none text-on-surface font-mono text-xs font-bold leading-normal uppercase p-1 rounded hover:bg-surface-container-highest transition-colors w-full focus:outline-none focus:ring-1 focus:ring-primary focus:bg-surface-container-highest"
                      />
                      <Edit className="w-3.5 h-3.5 text-on-surface-variant opacity-60 shrink-0" />
                    </div>
                  </header>

                  {/* Shop Contents */}
                  <div className="p-4 flex flex-col gap-4 overflow-y-auto no-scrollbar">
                    
                    {/* Schematic Grid proportional scaler */}
                    <div className="aspect-square w-full schematic-grid border border-[#44474f] rounded flex items-center justify-center relative overflow-hidden bg-surface-container-lowest select-none">
                      
                      {/* Proportionally Scaling visual area */}
                      <div 
                        id={`visual-preview-${shop.id}`}
                        className="border border-[#adc6ff]/30 bg-[#adc6ff]/5 transition-all duration-300 relative flex items-center justify-center"
                        style={{
                          width: `${shop.width}%`,
                          height: `${shop.height}%`
                        }}
                      >
                        {/* Background identifier watermark */}
                        <div className="absolute inset-0 opacity-10 flex items-center justify-center pointer-events-none">
                          <span className="font-mono text-[36px] font-bold">S{shop.id}</span>
                        </div>

                        {/* Stations Grid Miniature dots representing processors */}
                        <div className="grid grid-cols-4 gap-1 p-2 w-full h-full content-center justify-items-center">
                          {Array.from({ length: Math.min(16, shop.stations) }).map((_, stIndex) => (
                            <div 
                              key={stIndex} 
                              className="w-3 h-3 border border-primary/40 bg-primary/20 flex items-center justify-center rounded-[1px] animate-pulse"
                              style={{ animationDelay: `${stIndex * 150}ms` }}
                            >
                              <div className="w-1 h-1 bg-primary rounded-full" />
                            </div>
                          ))}
                          {shop.stations > 16 && (
                            <div className="col-span-4 text-[9px] font-mono font-bold text-primary/80 animate-pulse text-center mt-1">
                              +{shop.stations - 16} STATIONS
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Steppers & Form Inputs */}
                    <div className="space-y-3 mt-1">
                      
                      {/* Width Metres */}
                      <div className="flex flex-col gap-1">
                        <label className="font-mono text-[9px] uppercase font-bold text-on-surface-variant tracking-wider">Shop Width (m)</label>
                        <div className="flex items-center border border-outline-variant bg-[#131b2e] focus-within:border-primary rounded">
                          <button 
                            type="button" 
                            onClick={() => handleNumericChange(shop.id, 'width', -1)}
                            className="p-2 hover:bg-surface-container-highest text-primary transition-colors cursor-pointer select-none"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <input 
                            type="number" 
                            value={shop.width}
                            onChange={(e) => handleNumericChange(shop.id, 'width', 0, e.target.value)}
                            className="flex-1 bg-transparent border-none text-center font-mono text-base font-medium py-1 text-on-surface focus:outline-none focus:ring-0 w-full"
                          />
                          <button 
                            type="button"
                            onClick={() => handleNumericChange(shop.id, 'width', 1)}
                            className="p-2 hover:bg-surface-container-highest text-primary transition-colors cursor-pointer select-none"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Height Metres */}
                      <div className="flex flex-col gap-1">
                        <label className="font-mono text-[9px] uppercase font-bold text-on-surface-variant tracking-wider">Shop Height (m)</label>
                        <div className="flex items-center border border-outline-variant bg-[#131b2e] focus-within:border-primary rounded">
                          <button 
                            type="button"
                            onClick={() => handleNumericChange(shop.id, 'height', -1)}
                            className="p-2 hover:bg-surface-container-highest text-primary transition-colors cursor-pointer select-none"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <input 
                            type="number" 
                            value={shop.height}
                            onChange={(e) => handleNumericChange(shop.id, 'height', 0, e.target.value)}
                            className="flex-1 bg-transparent border-none text-center font-mono text-base font-medium py-1 text-on-surface focus:outline-none focus:ring-0 w-full"
                          />
                          <button 
                            type="button"
                            onClick={() => handleNumericChange(shop.id, 'height', 1)}
                            className="p-2 hover:bg-surface-container-highest text-primary transition-colors cursor-pointer select-none"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Station Counts */}
                      <div className="flex flex-col gap-1">
                        <label className="font-mono text-[9px] uppercase font-bold text-on-surface-variant tracking-wider">Stations in shop</label>
                        <div className="flex items-center border border-outline-variant bg-[#131b2e] focus-within:border-primary rounded">
                          <button 
                            type="button"
                            onClick={() => handleNumericChange(shop.id, 'stations', -1)}
                            className="p-2 hover:bg-surface-container-highest text-primary transition-colors cursor-pointer select-none"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <input 
                            type="number" 
                            value={shop.stations}
                            onChange={(e) => handleNumericChange(shop.id, 'stations', 0, e.target.value)}
                            className="flex-1 bg-transparent border-none text-center font-mono text-base font-medium py-1 text-on-surface focus:outline-none focus:ring-0 w-full"
                          />
                          <button 
                            type="button"
                            onClick={() => handleNumericChange(shop.id, 'stations', 1)}
                            className="p-2 hover:bg-surface-container-highest text-primary transition-colors cursor-pointer select-none"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Countdown Cycle Time (Hours, Mins, Secs) */}
                      <div className="flex flex-col gap-1">
                        <label className="font-mono text-[9px] uppercase font-bold text-on-surface-variant tracking-wider">Cycle Time (H : M : S)</label>
                        <div className="grid grid-cols-3 gap-1.5">
                          {/* Hours */}
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[8px] font-mono uppercase text-on-surface-variant/70 text-center">Hours</span>
                            <div className="flex items-center border border-outline-variant bg-[#131b2e] focus-within:border-primary rounded">
                              <button 
                                type="button"
                                onClick={() => {
                                  const { h, m, s } = getHMS(shop.cycleTime);
                                  const newH = Math.max(0, h - 1);
                                  const total = newH * 3600 + m * 60 + s;
                                  onUpdateShop(shop.id, { cycleTime: Math.max(1, Math.min(86400, total)) });
                                }}
                                className="p-1 hover:bg-surface-container-highest text-primary transition-colors cursor-pointer select-none"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <input 
                                type="number" 
                                value={getHMS(shop.cycleTime).h}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 0;
                                  const { m, s } = getHMS(shop.cycleTime);
                                  const total = Math.max(0, val) * 3600 + m * 60 + s;
                                  onUpdateShop(shop.id, { cycleTime: Math.max(1, Math.min(86400, total)) });
                                }}
                                className="w-full bg-transparent border-none text-center font-mono text-xs font-semibold py-1 text-on-surface focus:outline-none focus:ring-0"
                              />
                              <button 
                                type="button"
                                onClick={() => {
                                  const { h, m, s } = getHMS(shop.cycleTime);
                                  const newH = h + 1;
                                  const total = newH * 3600 + m * 60 + s;
                                  onUpdateShop(shop.id, { cycleTime: Math.max(1, Math.min(86400, total)) });
                                }}
                                className="p-1 hover:bg-surface-container-highest text-primary transition-colors cursor-pointer select-none"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          {/* Minutes */}
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[8px] font-mono uppercase text-on-surface-variant/70 text-center">Mins</span>
                            <div className="flex items-center border border-outline-variant bg-[#131b2e] focus-within:border-primary rounded">
                              <button 
                                type="button"
                                onClick={() => {
                                  const { h, m, s } = getHMS(shop.cycleTime);
                                  const newM = Math.max(0, m - 1);
                                  const total = h * 3600 + newM * 60 + s;
                                  onUpdateShop(shop.id, { cycleTime: Math.max(1, Math.min(86400, total)) });
                                }}
                                className="p-1 hover:bg-surface-container-highest text-primary transition-colors cursor-pointer select-none"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <input 
                                type="number" 
                                value={getHMS(shop.cycleTime).m}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 0;
                                  const { h, s } = getHMS(shop.cycleTime);
                                  const total = h * 3600 + Math.max(0, Math.min(59, val)) * 60 + s;
                                  onUpdateShop(shop.id, { cycleTime: Math.max(1, Math.min(86400, total)) });
                                }}
                                className="w-full bg-transparent border-none text-center font-mono text-xs font-semibold py-1 text-on-surface focus:outline-none focus:ring-0"
                              />
                              <button 
                                type="button"
                                onClick={() => {
                                  const { h, m, s } = getHMS(shop.cycleTime);
                                  const newM = m + 1;
                                  const total = h * 3600 + newM * 60 + s;
                                  onUpdateShop(shop.id, { cycleTime: Math.max(1, Math.min(86400, total)) });
                                }}
                                className="p-1 hover:bg-surface-container-highest text-primary transition-colors cursor-pointer select-none"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          {/* Seconds */}
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[8px] font-mono uppercase text-on-surface-variant/70 text-center">Secs</span>
                            <div className="flex items-center border border-outline-variant bg-[#131b2e] focus-within:border-primary rounded">
                              <button 
                                type="button"
                                onClick={() => {
                                  const { h, m, s } = getHMS(shop.cycleTime);
                                  const newS = Math.max(0, s - 1);
                                  const total = h * 3600 + m * 60 + newS;
                                  onUpdateShop(shop.id, { cycleTime: Math.max(1, Math.min(86400, total)) });
                                }}
                                className="p-1 hover:bg-surface-container-highest text-primary transition-colors cursor-pointer select-none"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <input 
                                type="number" 
                                value={getHMS(shop.cycleTime).s}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 0;
                                  const { h, m } = getHMS(shop.cycleTime);
                                  const total = h * 3600 + m * 60 + Math.max(0, Math.min(59, val));
                                  onUpdateShop(shop.id, { cycleTime: Math.max(1, Math.min(86400, total)) });
                                }}
                                className="w-full bg-transparent border-none text-center font-mono text-xs font-semibold py-1 text-on-surface focus:outline-none focus:ring-0"
                              />
                              <button 
                                type="button"
                                onClick={() => {
                                  const { h, m, s } = getHMS(shop.cycleTime);
                                  const newS = s + 1;
                                  const total = h * 3600 + m * 60 + newS;
                                  onUpdateShop(shop.id, { cycleTime: Math.max(1, Math.min(86400, total)) });
                                }}
                                className="p-1 hover:bg-surface-container-highest text-primary transition-colors cursor-pointer select-none"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Buffer Size */}
                      <div className="flex flex-col gap-1">
                        <label className="font-mono text-[9px] uppercase font-bold text-on-surface-variant tracking-wider">Buffer Size (Max Machines)</label>
                        <div className="flex items-center border border-outline-variant bg-[#131b2e] focus-within:border-primary rounded">
                          <button 
                            type="button"
                            onClick={() => handleNumericChange(shop.id, 'bufferSize', -1)}
                            className="p-2 hover:bg-surface-container-highest text-primary transition-colors cursor-pointer select-none"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <input 
                            type="number" 
                            value={shop.bufferSize}
                            onChange={(e) => handleNumericChange(shop.id, 'bufferSize', 0, e.target.value)}
                            className="flex-1 bg-transparent border-none text-center font-mono text-base font-medium py-1 text-on-surface focus:outline-none focus:ring-0 w-full"
                          />
                          <button 
                            type="button"
                            onClick={() => handleNumericChange(shop.id, 'bufferSize', 1)}
                            className="p-2 hover:bg-surface-container-highest text-primary transition-colors cursor-pointer select-none"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Successor Routing Route Dropdown */}
                      {hasSuccessorSection ? (
                        <div className="flex flex-col gap-1">
                          <label className="font-mono text-[9px] uppercase font-bold text-on-surface-variant tracking-wider">Successor</label>
                          <select 
                            value={shop.successor}
                            onChange={(e) => onUpdateShop(shop.id, { successor: e.target.value })}
                            className="w-full bg-[#131b2e] border border-outline-variant text-[#dae2fd] text-xs font-mono py-2 px-3 rounded cursor-pointer transition-colors hover:bg-surface-container-high focus:outline-none focus:ring-2 focus:ring-primary/50"
                          >
                            {successorOptions.map(opt => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1 opacity-45">
                          <label className="font-mono text-[9px] uppercase font-bold text-on-surface-variant tracking-wider">Successor</label>
                          <div className="bg-[#131b2e] border border-outline-variant text-on-surface-variant font-mono text-[11px] py-2 px-3 rounded flex items-center justify-between">
                            <span>Final Production Node</span>
                            <Lock className="w-3.5 h-3.5 text-on-surface-variant" />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Reset Actions Link */}
                  <footer className="p-2 px-4 bg-surface-container/50 border-t border-outline-variant flex justify-end shrink-0">
                    <button 
                      type="button"
                      onClick={() => onResetShop(shop.id)}
                      className="text-[#4b8eff] font-mono text-[10px] py-1 px-2 hover:underline tracking-tight flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                      <span>Reset to Default</span>
                    </button>
                  </footer>
                </section>
              );
            })}
          </div>
        </div>

        {/* Action Bottom Telemetry HUD & Footer */}
        <div className="bg-surface-container-lowest border-t border-outline-variant px-6 py-4 flex justify-between items-center w-full shadow-2xl shrink-0 z-10">
          <div className="flex flex-col">
            <span className="font-mono text-[10px] tracking-wider text-on-surface-variant opacity-80 font-bold uppercase">TOTAL SYSTEM SPAN</span>
            <span className="font-mono text-[20px] font-bold text-primary" id="system-span">
              {scaledWidth}m x {scaledHeight}m
            </span>
          </div>

          <div className="flex gap-4">
            <button 
              type="button"
              onClick={triggerSaveNotification}
              className="px-6 py-2 border border-outline-variant text-on-surface hover:bg-[#2d3449] rounded transition-colors font-mono text-[11px] tracking-wider uppercase font-bold cursor-pointer inline-flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Draft</span>
            </button>
            <button 
              type="button"
              onClick={() => onNavigate('simulation')}
              className="px-8 py-2 bg-industrial-blue text-white hover:opacity-95 rounded transition-all font-mono text-[11px] tracking-wider uppercase font-bold flex items-center gap-2 cursor-pointer"
            >
              <span>Apply & Proceed to Simulation</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
