/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Sliders, LayoutGrid, Play, Settings, Plus, Minus, Info, Maximize2 } from 'lucide-react';

interface ConfigurationPanelProps {
  onProceed: (config: { shopCount: number; width: number; height: number; stationCount: number }) => void;
}

export default function ConfigurationPanel({ onProceed }: ConfigurationPanelProps) {
  const [shopCount, setShopCount] = useState<number>(1);
  const [width, setWidth] = useState<number>(30);
  const [height, setHeight] = useState<number>(30);
  const [stationCount, setStationCount] = useState<number>(4);

  const increment = (value: number, setter: React.Dispatch<React.SetStateAction<number>>, max = 12) => {
    setter(prev => Math.min(max, prev + 1));
  };

  const decrement = (value: number, setter: React.Dispatch<React.SetStateAction<number>>, min = 1) => {
    setter(prev => Math.max(min, prev - 1));
  };

  // Helper to calculate grid column layout based on number of stations
  const cols = Math.ceil(Math.sqrt(stationCount));

  return (
    <div className="flex-1 flex flex-col p-6 max-w-7xl mx-auto w-full gap-8">
      {/* Stepper Header Navigation */}
      <nav className="flex justify-center items-center gap-6 sm:gap-20" data-purpose="stepper">
        {/* Step 1: Configuration */}
        <div className="flex flex-col items-center gap-3 group">
          <div className="w-10 h-10 rounded bg-primary flex items-center justify-center text-on-surface-variant bg-opacity-95 shadow-[0_0_15px_rgba(173,198,255,0.3)] select-none">
            <Sliders className="w-5 h-5 text-[#002e69]" />
          </div>
          <span className="label-caps text-primary text-xs">Configuration</span>
        </div>

        {/* Step 2: Layout */}
        <div className="flex flex-col items-center gap-3 group opacity-50">
          <div className="w-10 h-10 rounded bg-surface-container-highest flex items-center justify-center text-on-surface-variant select-none">
            <LayoutGrid className="w-5 h-5" />
          </div>
          <span className="label-caps text-xs">Layout</span>
        </div>

        {/* Step 3: Shop Layout */}
        <div className="flex flex-col items-center gap-3 group opacity-50">
          <div className="w-10 h-10 rounded bg-surface-container-highest flex items-center justify-center text-on-surface-variant select-none">
            <Settings className="w-5 h-5" />
          </div>
          <span className="label-caps text-xs">Shop Layout</span>
        </div>

        {/* Step 4: Simulation */}
        <div className="flex flex-col items-center gap-3 group opacity-50">
          <div className="w-10 h-10 rounded bg-surface-container-highest flex items-center justify-center text-on-surface-variant select-none">
            <Play className="w-5 h-5" />
          </div>
          <span className="label-caps text-xs">Simulation</span>
        </div>
      </nav>

      {/* Main Panel Grid */}
      <div className="grid grid-cols-12 gap-6 items-start mt-4">
        {/* Left Form Panel */}
        <section className="col-span-12 lg:col-span-6 bg-surface-container border border-outline-variant rounded-lg p-8 space-y-8" data-purpose="form-container">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
            <h2 className="label-caps text-on-surface opacity-80 text-sm tracking-wider">Phase 01: Environment Configuration</h2>
          </div>

          <div className="space-y-6">
            {/* Input Group: Shops */}
            <div className="space-y-3">
              <label className="block text-on-surface-variant text-sm font-medium">How many shops are in your plant?</label>
              <div className="flex items-center w-44 h-12 border border-outline-variant rounded bg-[#131b2e] focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all">
                <button 
                  type="button"
                  className="w-12 h-full flex items-center justify-center border-r border-[#414755] hover:bg-surface-container-highest text-primary transition-colors cursor-pointer select-none"
                  onClick={() => decrement(shopCount, setShopCount, 1)}
                  disabled={shopCount <= 1}
                >
                  <Minus className="w-4 h-4" />
                </button>
                <input 
                  type="number"
                  value={isNaN(shopCount) || shopCount === 0 ? "" : shopCount}
                  onChange={(e) => {
                    const parsed = e.target.value === "" ? NaN : parseInt(e.target.value);
                    setShopCount(parsed);
                  }}
                  onBlur={() => {
                    if (isNaN(shopCount) || shopCount < 1) {
                      setShopCount(1);
                    } else if (shopCount > 6) {
                      setShopCount(6);
                    }
                  }}
                  className="flex-1 bg-transparent border-none text-center font-mono text-lg font-medium text-primary focus:outline-none focus:ring-0 p-0 w-full"
                />
                <button 
                  type="button"
                  className="w-12 h-full flex items-center justify-center border-l border-[#414755] hover:bg-surface-container-highest text-primary transition-colors cursor-pointer select-none"
                  onClick={() => increment(shopCount, setShopCount, 6)}
                  disabled={shopCount >= 6}
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[12px] italic text-on-surface-variant opacity-60">Defines the logical partitioning of your production floor.</p>
            </div>

            {/* Input Group: Stations */}
            <div className="space-y-3">
              <label className="block text-on-surface-variant text-sm font-medium">Stations per shop</label>
              <div className="flex items-center w-44 h-12 border border-outline-variant rounded bg-[#131b2e] focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all">
                <button 
                  type="button"
                  className="w-12 h-full flex items-center justify-center border-r border-[#414755] hover:bg-surface-container-highest text-primary transition-colors cursor-pointer select-none"
                  onClick={() => decrement(stationCount, setStationCount, 1)}
                  disabled={stationCount <= 1}
                >
                  <Minus className="w-4 h-4" />
                </button>
                <input 
                  type="number"
                  value={isNaN(stationCount) || stationCount === 0 ? "" : stationCount}
                  onChange={(e) => {
                    const parsed = e.target.value === "" ? NaN : parseInt(e.target.value);
                    setStationCount(parsed);
                  }}
                  onBlur={() => {
                    if (isNaN(stationCount) || stationCount < 1) {
                      setStationCount(1);
                    } else if (stationCount > 24) {
                      setStationCount(24);
                    }
                  }}
                  className="flex-1 bg-transparent border-none text-center font-mono text-lg font-medium text-primary focus:outline-none focus:ring-0 p-0 w-full"
                />
                <button 
                  type="button"
                  className="w-12 h-full flex items-center justify-center border-l border-[#414755] hover:bg-surface-container-highest text-primary transition-colors cursor-pointer select-none"
                  onClick={() => increment(stationCount, setStationCount, 24)}
                  disabled={stationCount >= 24}
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[12px] italic text-on-surface-variant opacity-60">Workstations represent active processing nodes in the simulation.</p>
            </div>
          </div>

          {/* Proceed Button */}
          <button 
            type="button"
            className="w-full h-14 bg-primary hover:bg-[#385283] text-[#001a41] hover:text-white font-semibold rounded-md transition-all flex items-center justify-center gap-2 group cursor-pointer"
            onClick={() => onProceed({ shopCount, width, height, stationCount })}
          >
            <span>Next: Configure Layout</span>
            <svg className="w-5 h-5 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
            </svg>
          </button>
        </section>

        {/* Right Isometric Preview Panel */}
        <section className="col-span-12 lg:col-span-6 bg-surface-container border border-outline-variant rounded-lg flex flex-col" data-purpose="preview-container">
          <div className="flex items-center justify-between p-4 border-b border-outline-variant">
            <h3 className="label-caps text-on-surface text-xs font-bold tracking-wider">Spatial Preview</h3>
            <button className="hover:text-primary transition-colors cursor-pointer">
              <Maximize2 className="w-4 h-4 text-on-surface-variant hover:text-primary" />
            </button>
          </div>

          {/* Preview Canvas Container */}
          <div className="flex-1 min-h-[420px] relative preview-grid flex flex-col items-center justify-center p-8 overflow-hidden">
            
            {/* Isometric Visual Canvas */}
            <div className="relative w-full h-80 flex items-center justify-center" data-purpose="isometric-canvas">
              <div 
                className="relative border-2 border-primary/30 bg-primary/5 shadow-[0_20px_50px_rgba(173,198,255,0.08)] flex items-center justify-center overflow-hidden transition-all duration-300"
                style={{
                  width: `${Math.min(250, Math.max(140, 100 + width * 4.5))}px`,
                  height: `${Math.min(250, Math.max(140, 100 + height * 4.5))}px`,
                  transform: 'rotate(35deg) skewX(-30deg) skewY(10deg) scale(0.95)'
                }}
              >
                {/* Shop Diamonds Layout */}
                <div 
                  className="grid gap-4 p-6 w-full h-full content-center justify-items-center"
                  style={{
                    gridTemplateColumns: `repeat(${Math.ceil(Math.sqrt(shopCount))}, minmax(0, 1fr))`
                  }}
                >
                  {(() => {
                    const visualStationCount = isNaN(stationCount) || stationCount < 1 ? 1 : stationCount;
                    const getDiamondSizeClass = (count: number) => {
                      if (count <= 4) return "w-2.5 h-2.5";
                      if (count <= 9) return "w-2 h-2";
                      if (count <= 16) return "w-1.5 h-1.5";
                      return "w-1 h-1";
                    };
                    const getGapClass = (count: number) => {
                      if (count <= 4) return "gap-[6px]";
                      if (count <= 9) return "gap-[4px]";
                      if (count <= 16) return "gap-[3px]";
                      return "gap-[2px]";
                    };
                    const gapClass = getGapClass(visualStationCount);

                    return Array.from({ length: shopCount }).map((_, index) => (
                      <div 
                        key={index} 
                        className="w-14 h-14 border border-[#adc6ff]/45 bg-[#adc6ff]/10 flex items-center justify-center shadow-inner rounded p-1 transition-all duration-300 hover:bg-[#adc6ff]/20"
                      >
                        <div 
                          className={`grid ${gapClass} w-full h-full content-center justify-items-center`}
                          style={{
                            gridTemplateColumns: `repeat(${Math.ceil(Math.sqrt(visualStationCount))}, minmax(0, 1fr))`
                          }}
                        >
                          {Array.from({ length: visualStationCount }).map((_, sIdx) => (
                            <div 
                              key={sIdx} 
                              className={`${getDiamondSizeClass(visualStationCount)} border border-primary/70 bg-primary/30 rotate-45 rounded-[0.5px] transition-all shrink-0`} 
                            />
                          ))}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            </div>

            {/* Instruction Warning Box */}
            <div className="mt-auto w-full border-t border-outline-variant bg-surface-container-low/50 p-6 flex gap-4 rounded-b-lg">
              <div className="shrink-0 pt-0.5">
                <Info className="w-5 h-5 text-primary" />
              </div>
              <p className="text-sm leading-relaxed text-on-surface-variant">
                You are initializing the <span className="text-on-surface font-semibold">Base Topology</span>. This configuration determines the physical constraints of the simulation engine. Larger dimensions allow for complex material handling paths but increase computational overhead.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
