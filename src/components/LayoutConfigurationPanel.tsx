/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Sliders, LayoutGrid, Play, Settings, Plus, Minus, Lock, RotateCcw, ArrowRight } from 'lucide-react';
import { ShopTopology } from '../types';

interface LayoutConfigurationPanelProps {
  shops: ShopTopology[];
  onUpdateShop: (id: number, updatedFields: Partial<ShopTopology>) => void;
  onResetShop: (id: number) => void;
  onNavigate: (step: string) => void;
}

export default function LayoutConfigurationPanel({
  shops,
  onUpdateShop,
  onResetShop,
  onNavigate
}: LayoutConfigurationPanelProps) {
  const [notification, setNotification] = useState<string | null>(null);

  const [routingError, setRoutingError] = useState<string | null>(null);

  const validateRouting = (): { isValid: boolean; error: string | null } => {
    const inShops = shops.filter(s => s.isInputShop);
    if (inShops.length !== 1) {
      return { isValid: false, error: `Routing topology invalid: System must have exactly one Intake [IN] shop (currently has ${inShops.length}).` };
    }

    const outShops = shops.filter(s => s.isOutputShop);
    if (outShops.length !== 1) {
      return { isValid: false, error: `Routing topology invalid: System must have exactly one Exit [OUT] shop (currently has ${outShops.length}).` };
    }

    if (shops.length > 1) {
      if (inShops[0].id === outShops[0].id) {
        return { isValid: false, error: "Routing topology invalid: Inline [IN] and Exit [OUT] designations cannot overlap on the same shop." };
      }
    }

    const startShop = inShops[0];
    const visitedIds = new Set<number>([startShop.id]);
    let current = startShop;
    let pathStr = startShop.name;

    while (current && !current.isOutputShop) {
      const nextName = current.successor;
      if (!nextName || nextName === 'None') {
        return { isValid: false, error: `Routing topology invalid: "${current.name}" is not the Exit [OUT] shop, but has no designated successor mapping.` };
      }
      const nextShop = shops.find(s => s.name === nextName);
      if (!nextShop) {
        return { isValid: false, error: `Routing topology invalid: Successor link "${nextName}" for "${current.name}" cannot be resolved.` };
      }
      if (visitedIds.has(nextShop.id)) {
        return { isValid: false, error: `Routing topology invalid: Loop detected! "${current.name}" routes back to "${nextShop.name}".` };
      }
      visitedIds.add(nextShop.id);
      current = nextShop;
      pathStr += ` ➔ ${nextShop.name}`;
    }

    if (visitedIds.size !== shops.length) {
      const unvisited = shops.filter(s => !visitedIds.has(s.id)).map(s => s.name).join(', ');
      return { isValid: false, error: `Routing topology invalid: Isolated pipeline node detected! The routing sequence (${pathStr}) skips: ${unvisited}. All shops must be part of a single continuous pipeline.` };
    }

    return { isValid: true, error: null };
  };

  const handleNavigateWithValidation = (targetStep: string) => {
    if (targetStep === 'shop-layout' || targetStep === 'simulation') {
      const { isValid, error } = validateRouting();
      if (!isValid) {
        setRoutingError(error);
        return;
      }
    }
    setRoutingError(null);
    onNavigate(targetStep);
  };

  const getSuccessorOptions = (currentId: number, currentSuccessor: string) => {
    // Find options that are selected by ANY OTHER shop
    const otherShopsClaimed = shops
      .filter(s => s.id !== currentId && !s.isOutputShop)
      .map(s => s.successor);

    // Possible options: any shop except itself (and never None)
    return shops
      .filter(s => s.id !== currentId)
      .map(s => s.name)
      .filter(name => name === currentSuccessor || !otherShopsClaimed.includes(name));
  };

  const handleNumericChange = (
    id: number,
    field: 'width' | 'height',
    delta: number,
    exactValue: string | null = null
  ) => {
    const shop = shops.find(s => s.id === id);
    if (!shop) return;

    let newValue = exactValue !== null ? parseInt(exactValue) : (shop[field] as number) + delta;
    if (isNaN(newValue)) return;

    newValue = Math.max(5, Math.min(100, newValue));
    onUpdateShop(id, { [field]: newValue });
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
      <aside className="bg-surface-container-low border-r border-outline-variant flex flex-col p-4 w-64 shrink-0 justify-between select-none">
        <div className="flex flex-col gap-6">
          <div className="px-2">
            <h2 className="text-primary font-bold text-lg select-none">Phase Control</h2>
            <p className="text-on-surface-variant text-[10px] uppercase font-mono tracking-wider opacity-60">Operational Workflow</p>
          </div>

          <nav className="flex flex-col gap-1">
            {/* Configuration Step */}
            <button 
              type="button" 
              onClick={() => handleNavigateWithValidation('configuration')}
              className="flex items-center gap-3 p-3 transition-all text-on-surface-variant hover:bg-surface-container-high rounded-lg cursor-pointer w-full text-left"
            >
              <Sliders className="w-4 h-4 text-on-surface-variant" />
              <span className="label-caps text-[11px]">Configuration</span>
            </button>

            {/* Layout Step (Active) */}
            <div className="flex items-center gap-3 p-3 bg-secondary-container text-on-secondary-container rounded-lg border-l-2 border-primary select-none w-full">
              <LayoutGrid className="w-4 h-4 text-primary" />
              <span className="label-caps text-[11px] text-primary">Layout</span>
            </div>

            {/* Shop Layout Step */}
            <button 
              type="button" 
              onClick={() => handleNavigateWithValidation('shop-layout')}
              className="flex items-center gap-3 p-3 transition-all text-on-surface-variant hover:bg-surface-container-high rounded-lg cursor-pointer w-full text-left"
            >
              <Settings className="w-4 h-4 text-on-surface-variant" />
              <span className="label-caps text-[11px]">Shop Layout</span>
            </button>

            {/* Simulation Step */}
            <button 
              type="button"
              onClick={() => handleNavigateWithValidation('simulation')}
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
      <main className="flex-1 flex flex-col overflow-hidden bg-surface-dim relative text-left">
        {/* Toast Save Notification */}
        {notification && (
          <div className="absolute top-4 right-6 bg-surface-container border border-green-500/40 text-[#dae2fd] text-xs px-4 py-3 rounded shadow-2xl z-50 flex items-center gap-2 animate-fade-in-down">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span>{notification}</span>
          </div>
        )}

        {/* Main Header */}
        <div className="px-6 py-6 shrink-0 border-b border-outline-variant/20 bg-surface-container-low/40">
          <div>
            <h1 className="text-2xl font-semibold text-on-surface select-none">Layout Configuration</h1>
            <p className="text-on-surface-variant text-sm mt-1">Define physical span parameters, production flows, and set entry/exit shops.</p>
          </div>
        </div>

        {/* Outer Workspace content wrapper */}
        <div className="flex-1 overflow-y-auto p-6 focus-within:outline-none">
          {routingError && (
            <div className="mb-6 p-4 bg-red-950/40 border border-red-500/30 rounded-xl text-red-200 text-xs font-mono flex items-center justify-between gap-4 shadow-lg animate-pulse" id="routing-error-banner">
              <div className="flex items-center gap-3">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
                <span className="leading-relaxed">{routingError}</span>
              </div>
              <button 
                type="button" 
                onClick={() => setRoutingError(null)} 
                className="text-red-400 hover:text-red-200 underline font-mono text-[10px] cursor-pointer shrink-0 uppercase tracking-wider font-bold"
              >
                Dismiss
              </button>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 items-start">
            {shops.map(shop => {
              const successorOptions = getSuccessorOptions(shop.id, shop.successor);
              const hasSuccessorSection = !shop.isOutputShop;

              return (
                <section 
                  key={shop.id}
                  className="bg-surface-container-low border border-outline-variant/30 hover:border-[#2d3a58] transition-colors rounded-xl overflow-hidden shadow-sm flex flex-col justify-between"
                >
                  <header className="p-4 border-b border-outline-variant flex justify-between items-center bg-[#131b2e] select-none gap-2">
                    <input
                      type="text"
                      value={shop.name}
                      onChange={(e) => onUpdateShop(shop.id, { name: e.target.value })}
                      className="font-mono text-xs uppercase font-extrabold text-primary shrink-0 tracking-wider bg-transparent border-b border-dashed border-primary/30 hover:border-primary/80 focus:border-primary focus:bg-[#090d16] px-1 py-0.5 rounded focus:outline-none transition-all w-32 focus:ring-0"
                      placeholder="SHOP NAME"
                      maxLength={18}
                    />
                    <div className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wide opacity-50 shrink-0">
                      <span>ID:</span>
                      <span className="font-mono font-bold text-on-surface">{shop.id}</span>
                    </div>
                  </header>

                  <div className="p-4 flex-1">
                    <div className="flex flex-col gap-4">
                      {/* Live Schematic Shop Blueprint (Above width inputs) */}
                      <div className="bg-[#090e17] h-[320px] border border-[#141b2c] rounded-xl relative select-none flex flex-col items-center justify-center overflow-hidden shadow-inner">
                        {/* Perfect Dot-Grid Matrix canvas */}
                        <div 
                          className="absolute inset-0 pointer-events-none opacity-80"
                          style={{
                            backgroundImage: 'radial-gradient(circle, rgba(74, 144, 226, 0.12) 1.2px, transparent 1.2px)',
                            backgroundSize: '14px 14px',
                            backgroundPosition: 'center',
                          }}
                        />

                        {/* Centered Scalable Box simulating Width and Length proportions */}
                        <div 
                          className="border border-[#263c6a] bg-[#0c1324]/85 rounded flex items-center justify-center p-3 relative z-10 transition-all duration-300 shadow-[0_0_25px_rgba(30,50,90,0.4)] overflow-hidden"
                          style={{
                            width: `${Math.max(40, Math.min(95, 30 + (shop.width / 100) * 65))}%`,
                            height: `${Math.max(100, Math.min(250, 60 + (shop.height / 100) * 190))}px`,
                          }}
                        >
                          {/* Sizable watermark text centered background */}
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0">
                            <span 
                              className="font-black font-mono tracking-tighter text-[#1f2e4d]/15 leading-none select-none transition-all duration-300"
                              style={{
                                fontSize: `${Math.max(60, Math.min(120, 50 + (shop.width / 100) * 70))}px`,
                              }}
                            >
                              {String(shop.id).padStart(2, '0')}
                            </span>
                          </div>

                          {/* Render stations dynamically inside the box */}
                          <div className="flex items-center justify-center gap-1.5 flex-wrap z-10 relative max-h-full w-full p-1 overflow-hidden select-none">
                            {Array.from({ length: shop.stations }).map((_, stIdx) => {
                              // Dynamically calculate station box size based on the number of stations to ensure perfect fit without scrolling
                              let sizeClass = "w-8 h-8 text-xs";
                              if (shop.stations > 14) {
                                sizeClass = "w-5 h-5 text-[9px]";
                              } else if (shop.stations > 8) {
                                sizeClass = "w-6 h-6 text-[10px]";
                              } else if (shop.stations > 4) {
                                sizeClass = "w-7 h-7 text-[11px]";
                              }
                              const customStationName = shop.stationsData?.[stIdx]?.name || `Station ${stIdx + 1}`;
                              return (
                                <div 
                                  key={`preview-st-${shop.id}-${stIdx}`}
                                  className={`${sizeClass} rounded border border-[#3e5f98] bg-[#0c1324] text-[#8ea8d6] font-mono font-bold flex items-center justify-center shadow-[0_0_8px_rgba(56,110,255,0.2)] shrink-0 select-none transition-all hover:scale-110 hover:border-[#5383d3]`}
                                  title={customStationName}
                                >
                                  {stIdx + 1}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Width Metres */}
                      <div className="flex flex-col gap-1">
                        <label className="font-mono text-[9px] uppercase font-bold text-on-surface-variant tracking-wider">SHOP WIDTH (M)</label>
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

                      {/* Length Metres (underlying height field updated) */}
                      <div className="flex flex-col gap-1">
                        <label className="font-mono text-[9px] uppercase font-bold text-on-surface-variant tracking-wider">SHOP LENGTH (M)</label>
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

                      {/* Number of Stations (user can change count directly here) */}
                      <div className="flex flex-col gap-1">
                        <label className="font-mono text-[9px] uppercase font-bold text-on-surface-variant tracking-wider">NUMBER OF STATIONS</label>
                        <div className="flex items-center border border-outline-variant bg-[#131b2e] focus-within:border-primary rounded">
                          <button 
                            type="button"
                            onClick={() => onUpdateShop(shop.id, { stations: Math.max(1, shop.stations - 1) })}
                            className="p-2 hover:bg-surface-container-highest text-primary transition-colors cursor-pointer select-none"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="flex-1 text-center font-mono text-base font-medium py-1 text-on-surface select-none">
                            {shop.stations}
                          </span>
                          <button 
                            type="button"
                            onClick={() => onUpdateShop(shop.id, { stations: Math.min(20, shop.stations + 1) })}
                            className="p-2 hover:bg-surface-container-highest text-primary transition-colors cursor-pointer select-none"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Decides entrance / exit designated status */}
                      <div className="flex flex-col gap-2 bg-black/15 p-2.5 rounded-lg border border-outline-variant/15 select-none">
                        <span className="font-mono text-[9px] uppercase font-bold text-[#b0c4de] tracking-wider">Line entrance / exit</span>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => onUpdateShop(shop.id, { isInputShop: !shop.isInputShop })}
                            className={`px-1 py-1.5 text-[9px] font-mono font-bold rounded cursor-pointer transition-all ${
                              shop.isInputShop 
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/40 shadow-sm' 
                                : 'bg-[#10192e] text-on-surface-variant border border-outline-variant/15 hover:border-outline-variant/30'
                            }`}
                          >
                            [IN] INTAKE
                          </button>
                          <button
                            type="button"
                            onClick={() => onUpdateShop(shop.id, { isOutputShop: !shop.isOutputShop })}
                            className={`px-1 py-1.5 text-[9px] font-mono font-bold rounded cursor-pointer transition-all ${
                              shop.isOutputShop 
                                ? 'bg-sky-500/15 text-sky-400 border border-sky-500/40 shadow-sm' 
                                : 'bg-[#10192e] text-on-surface-variant border border-outline-variant/15 hover:border-outline-variant/30'
                            }`}
                          >
                            [OUT] EXIT
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
                            className="w-full bg-[#131b2e] border border-outline-variant/40 text-[#dae2fd] text-xs font-mono py-2 px-3 rounded cursor-pointer transition-colors hover:bg-surface-container-high focus:outline-none focus:ring-2 focus:ring-primary/50"
                          >
                            {successorOptions.map(opt => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1 opacity-45 select-none">
                          <label className="font-mono text-[9px] uppercase font-bold text-on-surface-variant tracking-wider">Successor</label>
                          <div className="bg-[#131b2e] border border-outline-variant text-on-surface-variant font-mono text-[11px] py-2 px-3 rounded flex items-center justify-between">
                            <span>{shop.isOutputShop ? 'Final Outbound Conveyor' : 'Final Production Node'}</span>
                            <Lock className="w-3.5 h-3.5 text-on-surface-variant" />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Reset Actions Link */}
                  <footer className="p-2 px-4 bg-surface-container/50 border-t border-outline-variant flex justify-end shrink-0 select-none">
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
        <div className="bg-surface-container-lowest border-t border-outline-variant px-6 py-4 flex justify-between items-center w-full shadow-2xl shrink-0 z-10 select-none">
          <div className="flex flex-col">
            <span className="font-mono text-[10px] tracking-wider text-on-surface-variant opacity-80 font-bold uppercase">TOTAL SYSTEM SPAN (WIDTH × LENGTH)</span>
            <span className="font-mono text-[20px] font-bold text-primary" id="system-span">
              {scaledWidth}m x {scaledHeight}m
            </span>
          </div>

          <div className="flex gap-4">
            <button 
              type="button"
              onClick={triggerSaveNotification}
              className="px-6 py-2 border border-[#2d3a58]/40 text-on-surface hover:bg-[#2d3449] rounded transition-colors font-mono text-[11px] tracking-wider uppercase font-bold cursor-pointer inline-flex items-center gap-1.5"
            >
              Save Draft Setup
            </button>
            <button 
              type="button"
              onClick={() => handleNavigateWithValidation('shop-layout')}
              className="px-6 py-2 bg-primary hover:bg-primary-hover text-[#0b1326] font-semibold rounded font-mono text-[11px] tracking-wider uppercase cursor-pointer"
              id="btn-configure-shop-layouts"
            >
              Configure Shop Layouts &rarr;
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
