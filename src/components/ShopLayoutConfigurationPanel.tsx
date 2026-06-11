/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Sliders, LayoutGrid, Play, Settings, Plus, Minus, ArrowRight, CheckCircle, Info } from 'lucide-react';
import { ShopTopology, StationTopology } from '../types';

interface ShopLayoutConfigurationPanelProps {
  shops: ShopTopology[];
  onUpdateShop: (id: number, updatedFields: Partial<ShopTopology>) => void;
  onNavigate: (step: string) => void;
}

export default function ShopLayoutConfigurationPanel({
  shops,
  onUpdateShop,
  onNavigate
}: ShopLayoutConfigurationPanelProps) {
  const [selectedShopId, setSelectedShopId] = useState<number>(shops[0]?.id || 1);
  const [notification, setNotification] = useState<string | null>(null);
  const [clickedShops, setClickedShops] = useState<number[]>([shops[0]?.id || 1]);
  const [confirmedShops, setConfirmedShops] = useState<number[]>([]);

  const selectedShop = shops.find(s => s.id === selectedShopId) || shops[0];

  const getHMS = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return { h, m, s };
  };

  const handleUpdateStation = (stationId: string, updatedFields: Partial<StationTopology>) => {
    if (!selectedShop || !selectedShop.stationsData) return;

    let nextStations = selectedShop.stationsData.map(st => {
      if (st.id === stationId) {
        const merged = { ...st, ...updatedFields };
        // Clean bounds check
        merged.partsCount = Math.max(0, Math.min(merged.bufferSize, merged.partsCount));
        merged.bufferSize = Math.max(1, Math.min(100, merged.bufferSize));
        merged.cycleTime = Math.max(1, Math.min(86400, merged.cycleTime));
        return merged;
      }
      return st;
    });

    if (updatedFields.successor !== undefined) {
      const newSuccessor = updatedFields.successor;
      let attempts = 0;
      while (attempts < 20) {
        attempts++;
        let changed = false;

        // 1. Resolve self-pointing: No station can point to itself
        for (let i = 0; i < nextStations.length; i++) {
          if (nextStations[i].successor === nextStations[i].id) {
            const possiblePool = ['exit', ...nextStations.map(s => s.id)].filter(tid => tid !== nextStations[i].id);
            const unclaimed = possiblePool.find(tid => !nextStations.some(s => s.successor === tid));
            nextStations[i].successor = unclaimed || possiblePool[0];
            changed = true;
          }
        }

        // 2. Resolve duplicate successor: Collect frequency of each successor
        const counts: { [key: string]: number } = {};
        nextStations.forEach(st => {
          const succ = st.successor || 'exit';
          counts[succ] = (counts[succ] || 0) + 1;
        });

        const duplicateTarget = Object.keys(counts).find(k => counts[k] > 1);
        if (duplicateTarget) {
          // Find the station (that is NOT the one just updated) pointing to the duplicate target
          const indexToChange = nextStations.findIndex(st => st.id !== stationId && st.successor === duplicateTarget);
          if (indexToChange !== -1) {
            const allPool = ['exit', ...nextStations.map(s => s.id)];
            const unusedTarget = allPool.find(tid => tid !== nextStations[indexToChange].id && !nextStations.some(s => s.successor === tid));
            if (unusedTarget) {
              nextStations[indexToChange].successor = unusedTarget;
              changed = true;
            }
          }
        }

        if (!changed) break;
      }
    }

    onUpdateShop(selectedShop.id, { stationsData: nextStations });
  };

  const handleStationHMSChange = (
    station: StationTopology,
    unit: 'h' | 'm' | 's',
    value: number
  ) => {
    const { h, m, s } = getHMS(station.cycleTime);
    let nextH = h;
    let nextM = m;
    let nextS = s;

    if (unit === 'h') nextH = Math.max(0, value);
    if (unit === 'm') nextM = Math.max(0, Math.min(59, value));
    if (unit === 's') nextS = Math.max(0, Math.min(59, value));

    const totalSeconds = nextH * 3600 + nextM * 60 + nextS;
    handleUpdateStation(station.id, { cycleTime: totalSeconds || 1 });
  };

  const triggerSaveNotification = () => {
    setNotification('Shop station configurations successfully synchronized.');
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
              onClick={() => onNavigate('configuration')}
              className="flex items-center gap-3 p-3 transition-all text-on-surface-variant hover:bg-surface-container-high rounded-lg cursor-pointer w-full text-left"
            >
              <Sliders className="w-4 h-4 text-on-surface-variant" />
              <span className="label-caps text-[11px]">Configuration</span>
            </button>

            {/* Layout Step */}
            <button 
              type="button" 
              onClick={() => onNavigate('layout')}
              className="flex items-center gap-3 p-3 transition-all text-on-surface-variant hover:bg-surface-container-high rounded-lg cursor-pointer w-full text-left"
            >
              <LayoutGrid className="w-4 h-4 text-on-surface-variant" />
              <span className="label-caps text-[11px]">Layout</span>
            </button>

            {/* Shop Layout Step (Active) */}
            <div className="flex items-center gap-3 p-3 bg-secondary-container text-on-secondary-container rounded-lg border-l-2 border-primary select-none w-full">
              <Settings className="w-4 h-4 text-primary" />
              <span className="label-caps text-[11px] text-primary">Shop Layout</span>
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
      <main className="flex-1 flex flex-col overflow-hidden bg-surface-dim relative text-left">
        {/* Toast Save Notification */}
        {notification && (
          <div className="absolute top-4 right-6 bg-surface-container border border-green-500/40 text-[#dae2fd] text-xs px-4 py-3 rounded shadow-2xl z-50 flex items-center gap-2 animate-fade-in-down">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span>{notification}</span>
          </div>
        )}

        {/* Main Header */}
        <div className="px-6 py-6 shrink-0 border-b border-outline-variant/20 bg-surface-container-low/40 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-on-surface select-none">Shop Layout Settings</h1>
            <p className="text-on-surface-variant text-sm mt-1">Configure individual station queues, processing periods, and custom layouts for each shop.</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
          {/* Shop Switcher Tabs */}
          <section className="bg-surface-container rounded-xl p-2 border border-outline-variant/30">
            <h2 className="text-xs font-mono uppercase tracking-wider text-on-surface-variant opacity-85 px-3 pt-2 pb-3 font-bold">Select Shop to Configure</h2>
            <div className="flex flex-wrap gap-1.5">
              {shops.map(shop => {
                const isActive = shop.id === selectedShopId;
                const isConfirmed = confirmedShops.includes(shop.id);
                return (
                  <button
                    key={shop.id}
                    type="button"
                    onClick={() => {
                      setSelectedShopId(shop.id);
                      if (!clickedShops.includes(shop.id)) {
                        setClickedShops(prev => [...prev, shop.id]);
                      }
                    }}
                    className={`px-4 py-2 text-xs font-mono font-bold rounded-lg transition-all cursor-pointer select-none flex items-center gap-2.5 ${
                      isActive
                        ? 'bg-[#1e2a4a] text-primary border border-primary/40'
                        : 'bg-surface-container-lowest text-on-surface-variant/80 border border-outline-variant/20 hover:border-outline-variant/50'
                    }`}
                  >
                    <span>{shop.name}</span>
                    {isConfirmed && <span className="text-emerald-400 font-bold">&#10003;</span>}
                    {shop.isInputShop && <span className="bg-emerald-500/10 text-emerald-400 font-sans text-[9px] px-1.5 py-0.5 rounded uppercase border border-emerald-500/25">IN</span>}
                    {shop.isOutputShop && <span className="bg-sky-500/10 text-sky-400 font-sans text-[9px] px-1.5 py-0.5 rounded uppercase border border-sky-500/25">OUT</span>}
                    <span className="text-[10px] opacity-50 bg-black/30 px-1.5 py-0.5 rounded">{shop.stations} Stations</span>
                  </button>
                );
              })}
            </div>
          </section>

          {selectedShop && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              {/* Left Column: Stations Counter & Shop Info */}
              <div className="lg:col-span-1 bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-5 flex flex-col gap-6">
                <div>
                  <h3 className="font-mono text-[9px] uppercase tracking-wider text-primary font-bold mb-3">{selectedShop.name} Core Parameters</h3>
                  <div className="space-y-4">
                    {/* Stations Incremental Modifier */}
                    <div>
                      <label className="block text-[9.5px] text-on-surface-variant font-medium mb-1.5 select-none uppercase tracking-wide">
                        Station Capacity (Stations Count)
                      </label>
                      <div className="flex items-center bg-surface-container rounded-lg border border-outline-variant/40 overflow-hidden w-full max-w-[200px]">
                        <button
                          type="button"
                          onClick={() => onUpdateShop(selectedShop.id, { stations: Math.max(1, selectedShop.stations - 1) })}
                          className="px-3 py-1.5 hover:bg-surface-container-highest border-r border-[#2d3a58] text-primary cursor-pointer transition-colors"
                          title="Reduce Stations"
                        >
                          <Minus className="w-3.5 h-3.5 text-primary" />
                        </button>
                        <input
                          type="number"
                          value={isNaN(selectedShop.stations) || selectedShop.stations === 0 ? "" : selectedShop.stations}
                          onChange={(e) => {
                            const val = e.target.value === "" ? NaN : parseInt(e.target.value);
                            onUpdateShop(selectedShop.id, { stations: val });
                          }}
                          onBlur={() => {
                            if (isNaN(selectedShop.stations) || selectedShop.stations < 1) {
                              onUpdateShop(selectedShop.id, { stations: 1 });
                            } else {
                              onUpdateShop(selectedShop.id, { stations: Math.min(20, selectedShop.stations) });
                            }
                          }}
                          className="w-full text-center font-mono font-bold text-xs text-on-surface bg-transparent border-none focus:outline-none focus:ring-0 p-0"
                        />
                        <button
                          type="button"
                          onClick={() => onUpdateShop(selectedShop.id, { stations: Math.min(20, selectedShop.stations + 1) })}
                          className="px-3 py-1.5 hover:bg-surface-container-highest border-l border-[#2d3a58] text-primary cursor-pointer transition-colors"
                          title="Increase Stations"
                        >
                          <Plus className="w-3.5 h-3.5 text-primary" />
                        </button>
                      </div>
                    </div>

                    {/* Intake parts capacity modifier (only for input shop) */}
                    {selectedShop.isInputShop && (
                      <div className="pt-2 border-t border-outline-variant/15 md:col-span-1">
                        <label className="block text-[9.5px] text-on-surface-variant font-medium mb-1.5 select-none uppercase tracking-wide">
                          Intake Pipe Parts Count
                        </label>
                        <div className="flex items-center bg-surface-container rounded-lg border border-outline-variant/40 overflow-hidden w-full max-w-[200px]">
                          <button
                            type="button"
                            onClick={() => onUpdateShop(selectedShop.id, { intakePartsCount: Math.max(1, (selectedShop.intakePartsCount || 15) - 1) })}
                            className="px-3 py-1.5 hover:bg-surface-container-highest border-r border-[#2d3a58] text-[#52d3a3] cursor-pointer transition-colors"
                            title="Reduce Intake Count"
                          >
                            <Minus className="w-3.5 h-3.5 text-[#52d3a3]" />
                          </button>
                          <input
                            type="number"
                            value={isNaN(selectedShop.intakePartsCount) || selectedShop.intakePartsCount === undefined ? "" : (selectedShop.intakePartsCount === 0 ? "" : selectedShop.intakePartsCount)}
                            onChange={(e) => {
                                const val = e.target.value === "" ? NaN : parseInt(e.target.value);
                                onUpdateShop(selectedShop.id, { intakePartsCount: val });
                            }}
                            onBlur={() => {
                              if (isNaN(selectedShop.intakePartsCount) || selectedShop.intakePartsCount < 1) {
                                onUpdateShop(selectedShop.id, { intakePartsCount: 1 });
                              } else {
                                onUpdateShop(selectedShop.id, { intakePartsCount: Math.min(10000, selectedShop.intakePartsCount) });
                              }
                            }}
                            className="w-full text-center font-mono font-bold text-xs text-[#52d3a3] bg-transparent border-none focus:outline-none focus:ring-0 p-0"
                          />
                          <button
                            type="button"
                            onClick={() => onUpdateShop(selectedShop.id, { intakePartsCount: Math.min(10000, (selectedShop.intakePartsCount || 15) + 1) })}
                            className="px-3 py-1.5 hover:bg-surface-container-highest border-l border-[#2d3a58] text-[#52d3a3] cursor-pointer transition-colors"
                            title="Increase Intake Count"
                          >
                            <Plus className="w-3.5 h-3.5 text-[#52d3a3]" />
                          </button>
                        </div>
                        <p className="text-[9px] text-emerald-400/90 font-mono mt-1 leading-snug">
                          Specifies how many parts will come from the intake conduit. (Max 10,000)
                        </p>
                      </div>
                    )}

                    <div className="p-2.5 bg-[#131b2e] border border-[#2d3a58]/35 rounded-lg flex flex-col gap-1.5">
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="text-on-surface-variant">Entrance Path:</span>
                        <span className="font-mono text-emerald-400 font-bold">
                          {selectedShop.isInputShop ? 'Primary Intake Line' : 'Previous Shop Successor'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="text-on-surface-variant">Exit Destination:</span>
                        <span className="font-mono text-sky-400 font-bold">
                          {selectedShop.isOutputShop ? 'Final Output Conveyor' : `Next Shop (${selectedShop.successor})`}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="text-[10px] text-on-surface-variant/80 flex items-start gap-2 bg-secondary-container/10 border border-secondary-container/15 rounded-lg p-3">
                  <Info className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    Station workflows can be sequentially linked or custom routed. Parts start at <strong>first station</strong>, complete their cycle time, and then transit to their configured successor station or exit toward the succeeding shop/conveyor line.
                  </p>
                </div>

                {/* Confirm Layout for This Shop button */}
                <button
                  type="button"
                  onClick={() => {
                    if (!confirmedShops.includes(selectedShop.id)) {
                      setConfirmedShops(prev => [...prev, selectedShop.id]);
                      setNotification(`${selectedShop.name} layout configuration confirmed!`);
                    } else {
                      setNotification(`${selectedShop.name} layout configuration already verified.`);
                    }
                  }}
                  className={`w-full h-11 rounded-lg font-bold text-xs select-none flex items-center justify-center gap-2 border transition-all ${
                    confirmedShops.includes(selectedShop.id)
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 font-semibold'
                      : 'bg-primary hover:bg-[#385283] text-[#001a41] hover:text-white border-transparent cursor-pointer shadow-lg'
                  }`}
                >
                  <CheckCircle className={`w-3.5 h-3.5 ${confirmedShops.includes(selectedShop.id) ? 'text-emerald-400' : 'text-[#001a41]'}`} />
                  <span>{confirmedShops.includes(selectedShop.id) ? 'Layout Confirmed ✓' : `Confirm ${selectedShop.name} Layout`}</span>
                </button>
              </div>

              {/* Right Column: Station-by-Station Configuration Panel */}
              <div className="lg:col-span-2 flex flex-col gap-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-mono text-xs uppercase tracking-wider text-[#8e909a] font-bold select-none">
                    Station Sequence Pipeline
                  </h3>
                  <span className="text-xs bg-[#10192e] text-[#b4c3f1] font-mono font-bold py-1 px-2.5 rounded-lg border border-outline-variant/20">
                    Total Stations: {selectedShop.stations}
                  </span>
                </div>

                <div className="space-y-3">
                  {selectedShop.stationsData?.map((station, index) => {
                    const isLast = index === selectedShop.stations - 1;
                    const { h, m, s } = getHMS(station.cycleTime);

                    const targetSucc = station.successor || 'exit';
                    const targetSuccName = targetSucc === 'exit'
                      ? (selectedShop.isOutputShop ? "Exit: Export Outbound Conveyor" : `Exit: Next Shop (${selectedShop.successor})`)
                      : (selectedShop.stationsData?.find(s => s.id === targetSucc)?.name || 'Next');

                    return (
                      <React.Fragment key={station.id}>
                        <div 
                          className="bg-surface-container-low border border-outline-variant/30 rounded-lg p-2.5 hover:border-[#2d3a58] transition-all flex flex-col gap-2 relative shadow-sm"
                        >
                        {/* Title Row with Successor link */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-b border-outline-variant/20 pb-2">
                          <div className="flex items-center gap-1.5">
                            <div className="w-5 h-5 rounded-full bg-[#1e2a4a] text-primary font-mono text-[10px] font-bold flex items-center justify-center shrink-0">
                              {index + 1}
                            </div>
                            <input
                              type="text"
                              value={station.name}
                              onChange={(e) => handleUpdateStation(station.id, { name: e.target.value })}
                              className="font-mono text-xs font-bold text-on-surface bg-transparent border-b border-dashed border-primary/30 hover:border-primary/80 focus:border-primary focus:bg-[#09101d] px-1 py-0.5 rounded focus:outline-none transition-all w-32 sm:w-40 focus:ring-0"
                              placeholder="STATION NAME"
                              maxLength={24}
                            />
                          </div>

                          {/* Link Flow Arrow */}
                          <div className="flex items-center gap-1.5 text-[11px] font-mono text-on-surface-variant">
                            <span className="opacity-95 font-bold shrink-0">Successor:</span>
                            <select
                              value={station.successor || 'exit'}
                              onChange={(e) => handleUpdateStation(station.id, { successor: e.target.value })}
                              className="bg-[#10192e] border border-outline-variant/40 font-mono py-0.5 px-2 rounded text-xs text-primary font-bold focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary cursor-pointer max-w-[180px]"
                            >
                              {/* Option to route downstream only and not already claimed */}
                              {selectedShop.stationsData?.slice(index + 1)
                                .filter(s => {
                                  // Can select if it is the current successor OR not claimed by any other station
                                  return s.id === station.successor || !selectedShop.stationsData?.some(other => other.id !== station.id && other.successor === s.id);
                                })
                                .map(s => (
                                  <option key={s.id} value={s.id} className="bg-[#0c1324] text-on-surface text-xs">
                                    {s.name}
                                  </option>
                                ))
                              }
                              {/* Option to exit shop */}
                              <option value="exit" className="bg-[#0c1324] text-emerald-400 font-bold text-xs">
                                {selectedShop.isOutputShop ? "Exit: Export Conveyor" : `Exit: Next Shop (${selectedShop.successor})`}
                              </option>
                            </select>
                          </div>
                        </div>

                        {/* Config inputs flex - brought closer together horizontally */}
                        <div className="flex flex-row flex-wrap items-end gap-x-5 gap-y-3">
                          {/* 1. Buffer Capacity */}
                          <div className="flex flex-col gap-1">
                            <label className="text-[9px] uppercase font-mono tracking-wider font-bold text-on-surface-variant/80">
                              Buffer Capacity Limit
                            </label>
                            <div className="flex items-center bg-surface-container-lowest border border-outline-variant/30 rounded-lg overflow-hidden w-full max-w-[120px]">
                              <button
                                type="button"
                                onClick={() => handleUpdateStation(station.id, { bufferSize: Math.max(1, station.bufferSize - 1) })}
                                className="px-2 py-1 hover:bg-surface-container text-primary transition-colors cursor-pointer shrink-0"
                              >
                                <Minus className="w-3 h-3 text-primary" />
                              </button>
                              <input
                                type="number"
                                value={isNaN(station.bufferSize) || station.bufferSize === 0 ? "" : station.bufferSize}
                                onChange={(e) => {
                                  const val = e.target.value === "" ? NaN : parseInt(e.target.value);
                                  handleUpdateStation(station.id, { bufferSize: val });
                                }}
                                onBlur={() => {
                                  if (isNaN(station.bufferSize) || station.bufferSize < 1) {
                                    handleUpdateStation(station.id, { bufferSize: 1 });
                                  } else {
                                    handleUpdateStation(station.id, { bufferSize: Math.min(10000, station.bufferSize) });
                                  }
                                }}
                                className="w-full text-[#dae2fd] text-center font-mono font-bold text-xs bg-transparent border-none focus:outline-none focus:ring-0 p-0"
                              />
                              <button
                                type="button"
                                onClick={() => handleUpdateStation(station.id, { bufferSize: Math.min(10000, station.bufferSize + 1) })}
                                className="px-2 py-1 hover:bg-surface-container text-primary transition-colors cursor-pointer shrink-0"
                              >
                                <Plus className="w-3 h-3 text-primary" />
                              </button>
                            </div>
                          </div>

                          {/* 3. Cycle Time in HMS - placed right alongside the buffer limit */}
                          <div className="flex flex-col gap-1">
                            <label className="text-[9px] uppercase font-mono tracking-wider font-bold text-on-surface-variant/80">
                              Cycle Time (Hrs:Mins:Secs)
                            </label>
                            <div className="flex items-center gap-1 bg-[#10192e]/40 px-1.5 py-0.5 rounded-lg border border-outline-variant/20">
                              {/* Hours */}
                              <div className="flex flex-col items-center">
                                <span className="text-[8px] font-mono text-on-surface-variant opacity-60 scale-90">HH</span>
                                <input
                                  type="number"
                                  min="0"
                                  max="24"
                                  value={h || ""}
                                  placeholder="0"
                                  onChange={(e) => {
                                    const val = e.target.value === "" ? 0 : parseInt(e.target.value);
                                    handleStationHMSChange(station, 'h', isNaN(val) ? 0 : val);
                                  }}
                                  className="w-9 bg-[#10192e] border border-outline-variant/25 text-center font-mono py-0.5 rounded text-xs text-primary focus:outline-none focus:ring-1 focus:ring-primary/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                              </div>
                              <span className="text-on-surface-variant/50 font-bold mt-2.5">:</span>

                              {/* Minutes */}
                              <div className="flex flex-col items-center">
                                <span className="text-[8px] font-mono text-on-surface-variant opacity-60 scale-90">MM</span>
                                <input
                                  type="number"
                                  min="0"
                                  max="59"
                                  value={m || ""}
                                  placeholder="0"
                                  onChange={(e) => {
                                    const val = e.target.value === "" ? 0 : parseInt(e.target.value);
                                    handleStationHMSChange(station, 'm', isNaN(val) ? 0 : val);
                                  }}
                                  className="w-9 bg-[#10192e] border border-outline-variant/25 text-center font-mono py-0.5 rounded text-xs text-primary focus:outline-none focus:ring-1 focus:ring-primary/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                              </div>
                              <span className="text-on-surface-variant/50 font-bold mt-2.5">:</span>

                              {/* Seconds */}
                              <div className="flex flex-col items-center">
                                <span className="text-[8px] font-mono text-on-surface-variant opacity-60 scale-90">SS</span>
                                <input
                                  type="number"
                                  min="0"
                                  max="59"
                                  value={s || ""}
                                  placeholder="0"
                                  onChange={(e) => {
                                    const val = e.target.value === "" ? 0 : parseInt(e.target.value);
                                    handleStationHMSChange(station, 's', isNaN(val) ? 0 : val);
                                  }}
                                  className="w-9 bg-[#10192e] border border-outline-variant/25 text-center font-mono py-0.5 rounded text-xs text-primary focus:outline-none focus:ring-1 focus:ring-primary/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Conveyor Link Destination Beside Cycle Time inside the Station Box */}
                          <div className="flex flex-col gap-1 min-w-[210px] flex-1">
                            <label className="text-[9px] uppercase font-mono tracking-wider font-bold text-on-surface-variant/80">
                              Transit Conveyor Link
                            </label>
                            <div className="flex items-center gap-2 bg-[#0e1626]/60 border border-dashed border-[#1e2a4a]/85 rounded px-2 md:px-2.5 h-[28px] justify-between text-[10px]">
                              <span className="font-mono text-[9px] text-blue-400 font-bold flex items-center gap-1 leading-none select-none">
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse shrink-0"></span>
                                {station.name} &rarr; {targetSuccName}
                              </span>
                              <span className="text-[7.5px] font-mono text-on-surface-variant/40 shrink-0 uppercase select-none font-bold">
                                Code: {targetSucc}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sticky Proceed Footer */}
        <div className="shrink-0 border-t border-outline-variant/20 bg-surface-container-low/60 px-6 py-4 flex items-center justify-between">
          <div className="text-xs text-on-surface-variant font-mono">
            {clickedShops.length < shops.length ? (
              <span className="text-amber-400 font-bold">
                Verification Required: Please click and review every shop button above (Reviewed {clickedShops.length} of {shops.length})
              </span>
            ) : confirmedShops.length < shops.length ? (
              <span className="text-amber-400 font-bold">
                Verification Required: Confirm layout for each shop ({confirmedShops.length} of {shops.length} confirmed)
              </span>
            ) : (
              <span className="text-emerald-400 font-bold flex items-center gap-1 animate-pulse">
                <CheckCircle className="w-3.5 h-3.5" /> All shop layouts verified and confirmed! Ready to simulate.
              </span>
            )}
          </div>
          <button
            type="button"
            disabled={clickedShops.length < shops.length || confirmedShops.length < shops.length}
            onClick={() => onNavigate('simulation')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all focus:ring-2 focus:ring-primary/40 select-none ${
              clickedShops.length === shops.length && confirmedShops.length === shops.length
                ? 'bg-primary hover:bg-[#385283] text-[#0b1326] hover:text-white cursor-pointer shadow-lg hover:shadow-primary/10'
                : 'bg-muted/10 border border-outline-variant opacity-40 text-on-surface-variant cursor-not-allowed'
            }`}
          >
            <span>Next: Proceed to simulation</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </main>
    </div>
  );
}
