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
                <div className="flex-1 text-center font-mono text-lg font-medium text-primary select-none">{shopCount}</div>
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

            {/* Input Group: Dimensions */}
            <div className="space-y-3">
              <label className="block text-on-surface-variant text-sm font-medium">Initial shop dimensions (meters)</label>
              <div className="grid grid-cols-2 gap-4">
                <div className="relative group">
                  <div className="absolute left-3 top-2 label-caps text-[8px] opacity-60 font-bold">Width</div>
                  <div className="h-14 border border-outline-variant rounded bg-[#131b2e] flex items-center justify-between px-4 pt-3 focus-within:border-primary transition-all">
                    <input 
                      type="number" 
                      value={width}
                      onChange={(e) => setWidth(Math.max(5, Math.min(100, parseInt(e.target.value) || 5)))}
                      className="bg-transparent border-none focus:outline-none focus:ring-0 text-primary font-mono text-lg font-medium p-0 w-full"
                    />
                    <span className="font-mono text-xs opacity-40 ml-2 select-none">M</span>
                  </div>
                </div>
                <div className="relative group">
                  <div className="absolute left-3 top-2 label-caps text-[8px] opacity-60 font-bold">Length</div>
                  <div className="h-14 border border-outline-variant rounded bg-[#131b2e] flex items-center justify-between px-4 pt-3 focus-within:border-primary transition-all">
                    <input 
                      type="number" 
                      value={height}
                      onChange={(e) => setHeight(Math.max(5, Math.min(100, parseInt(e.target.value) || 5)))}
                      className="bg-transparent border-none focus:outline-none focus:ring-0 text-primary font-mono text-lg font-medium p-0 w-full"
                    />
                    <span className="font-mono text-xs opacity-40 ml-2 select-none">M</span>
                  </div>
                </div>
              </div>
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
                <div className="flex-1 text-center font-mono text-lg font-medium text-primary select-none">{stationCount}</div>
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
            
            {/* Dimensions feedback gauge */}
            <div className="absolute top-4 left-4 flex flex-col gap-2 bg-[#131b2e]/95 border border-outline-variant/40 rounded p-3 font-mono text-[10px] text-on-surface-variant min-w-[150px] z-10 shadow-lg backdrop-blur-xs">
              <div className="flex flex-col gap-1">
                <div className="flex justify-between font-bold">
                  <span>WIDTH:</span>
                  <span className="text-primary font-extrabold">{width}m / 100m</span>
                </div>
                <div className="w-full bg-black/40 h-1.5 rounded overflow-hidden border border-outline-variant/20">
                  <div className="bg-primary h-full transition-all duration-300" style={{ width: `${width}%` }}></div>
                </div>
              </div>
              <div className="flex flex-col gap-1 mt-1">
                <div className="flex justify-between font-bold">
                  <span>LENGTH:</span>
                  <span className="text-primary font-extrabold">{height}m / 100m</span>
                </div>
                <div className="w-full bg-black/40 h-1.5 rounded overflow-hidden border border-outline-variant/20">
                  <div className="bg-primary h-full transition-all duration-300" style={{ width: `${height}%` }}></div>
                </div>
              </div>
            </div>

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
                {/* Station Nodes Dynamic Layout */}
                <div 
                  className="grid gap-4 p-6 w-full h-full content-center justify-items-center"
                  style={{
                    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`
                  }}
                >
                  {Array.from({ length: stationCount }).map((_, index) => (
                    <div 
                      key={index} 
                      className="w-12 h-12 border border-[#adc6ff]/40 bg-[#adc6ff]/10 flex items-center justify-center shadow-inner rounded-sm"
                    >
                      <div className="w-3.5 h-3.5 border border-primary/60 bg-primary/20 rotate-45 rounded-[1px]" />
                    </div>
                  ))}
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
