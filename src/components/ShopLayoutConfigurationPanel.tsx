/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Sliders, LayoutGrid, Play, Settings, Plus, Minus, ArrowRight, CheckCircle, Info, Trash2, AlertTriangle } from 'lucide-react';
import { ShopTopology, StationTopology, OrGateTopology } from '../types';

const renderBlueprintShape = (
  shape: string,
  color: string,
  strokeWidth: number,
  widthMm: number,
  heightMm: number
) => {
  const maxMm = 100;
  const maxPx = 140;
  const wPx = Math.round((widthMm / maxMm) * maxPx);
  const hPx = Math.round((heightMm / maxMm) * maxPx);

  const boxWidth = 200;
  const boxHeight = 200;
  const cx = boxWidth / 2;
  const cy = boxHeight / 2;

  const scale = 1.1;
  const w = (wPx / maxPx) * 120 * scale;
  const h = (hPx / maxPx) * 120 * scale;
  const x = cx - w / 2;
  const y = cy - h / 2;

  let pathData = "";
  switch (shape) {
    case 'rectangle':
      pathData = `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`;
      break;
    case 'triangle':
      pathData = `M ${cx} ${y} L ${cx + w / 2} ${y + h} L ${cx - w / 2} ${y + h} Z`;
      break;
    case 'diamond':
      pathData = `M ${cx} ${y} L ${cx + w / 2} ${cy} L ${cx} ${y + h} L ${cx - w / 2} ${cy} Z`;
      break;
    case 'pentagon': {
      const r = Math.min(w, h) / 2;
      const pts = Array.from({ length: 5 }).map((_, i) => {
        const angle = (i * 2 * Math.PI) / 5 - Math.PI / 2;
        return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
      });
      pathData = `M ${pts.join(' L ')} Z`;
      break;
    }
    case 'heart': {
      const scaleX = w / 100;
      const scaleY = h / 100;
      pathData = `M ${cx} ${cy + 35 * scaleY} 
                  C ${cx - 50 * scaleX} ${cy - 10 * scaleY}, ${cx - 40 * scaleX} ${cy - 50 * scaleY}, ${cx} ${cy - 25 * scaleY} 
                  C ${cx} ${cy - 25 * scaleY}, ${cx + 40 * scaleX} ${cy - 50 * scaleY}, ${cx + 50 * scaleX} ${cy - 10 * scaleY} Z`;
      break;
    }
    case 'oval':
      return (
        <ellipse
          cx={cx}
          cy={cy}
          rx={w / 2}
          ry={h / 2}
          fill={color}
          stroke="#ffffff"
          strokeWidth={strokeWidth}
          className="transition-all duration-200"
        />
      );
    case 'circle':
      return (
        <circle
          cx={cx}
          cy={cy}
          r={Math.min(w, h) / 2}
          fill={color}
          stroke="#ffffff"
          strokeWidth={strokeWidth}
          className="transition-all duration-200"
        />
      );
    case 'square':
    default: {
      const side = Math.min(w, h);
      const sx = cx - side / 2;
      const sy = cy - side / 2;
      return (
        <rect
          x={sx}
          y={sy}
          width={side}
          height={side}
          rx={12}
          ry={12}
          fill={color}
          stroke="#ffffff"
          strokeWidth={strokeWidth}
          className="transition-all duration-200"
        />
      );
    }
  }

  return (
    <path
      d={pathData}
      fill={color}
      stroke="#ffffff"
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
      className="transition-all duration-200"
    />
  );
};

interface ShopLayoutConfigurationPanelProps {
  shops: ShopTopology[];
  onUpdateShop: (id: number, updatedFields: Partial<ShopTopology>) => void;
  onNavigate: (step: string) => void;
  savedProjects?: any[];
  onSaveProject?: (name: string, step?: string) => any;
  onLoadProject?: (id: string) => void;
  onDeleteProject?: (id: string) => void;
}

export default function ShopLayoutConfigurationPanel({
  shops,
  onUpdateShop,
  onNavigate,
  savedProjects,
  onSaveProject,
  onLoadProject,
  onDeleteProject
}: ShopLayoutConfigurationPanelProps) {
  const [selectedShopId, setSelectedShopId] = useState<number>(shops[0]?.id || 1);
  const [notification, setNotification] = useState<string | null>(null);
  const [orGateError, setOrGateError] = useState<string | null>(null);
  const [clickedShops, setClickedShops] = useState<number[]>([shops[0]?.id || 1]);
  const [confirmedShops, setConfirmedShops] = useState<number[]>([]);

  const selectedShop = shops.find(s => s.id === selectedShopId) || shops[0];

  // Auto-resolve any OR Gate that doesn't have a station pointing to it
  useEffect(() => {
    if (!selectedShop || !selectedShop.stationsData || !selectedShop.orGates || selectedShop.orGates.length === 0) return;
    let needsUpdate = false;
    const nextStations = [...selectedShop.stationsData];
    let nextGates = [...selectedShop.orGates];
    const firstStation = nextStations[0];
    const lastStation = nextStations[nextStations.length - 1];

    nextGates = nextGates.map(gate => {
      const predStation = nextStations.find(s => s.successor === gate.id);
      const isLastThingAfterLastStation = lastStation && predStation?.id === lastStation.id;

      if (isLastThingAfterLastStation) {
        let updated = false;
        let nextGate = { ...gate };
        if (nextGate.targetStationA !== 'exit') {
          nextGate.targetStationA = 'exit';
          updated = true;
        }
        if (nextGate.targetStationB === 'exit' && firstStation) {
          nextGate.targetStationB = firstStation.id;
          updated = true;
        }
        if (updated) {
          needsUpdate = true;
          return nextGate;
        }
      }
      return gate;
    });

    nextGates.forEach(gate => {
      // If the gate is before the first station, it's valid to have no station pointing to it
      const isBeforeA1 = firstStation && (gate.targetStationA === firstStation.id || gate.targetStationB === firstStation.id);
      if (isBeforeA1) return;

      // Find if any station has this gate as its successor
      const hasPred = nextStations.some(s => s.successor === gate.id);
      if (!hasPred && nextStations.length > 0) {
        // Auto-assign the first station as successor pointing to this gate
        nextStations[0] = { ...nextStations[0], successor: gate.id };
        needsUpdate = true;
      }
    });

    if (needsUpdate) {
      onUpdateShop(selectedShop.id, { stationsData: nextStations, orGates: nextGates });
    }
  }, [selectedShopId, selectedShop?.orGates?.length, selectedShop?.stationsData?.length, selectedShop?.orGates]);

  const getLayoutValidationErrors = (shop: ShopTopology): string[] => {
    const errors: string[] = [];
    const stations = shop.stationsData || [];
    if (stations.length === 0) return [];

    // 1. Build adjacency list of connections
    const adj: { [key: string]: string[] } = {};
    stations.forEach(st => {
      adj[st.id] = [];
      const targetSucc = st.successor || 'exit';
      if (targetSucc && targetSucc !== 'none') {
        adj[st.id].push(targetSucc);
      }
    });

    const orGates = shop.orGates || [];
    orGates.forEach(og => {
      adj[og.id] = [];
      if (og.targetStationA && og.targetStationA !== 'none') {
        adj[og.id].push(og.targetStationA);
      }
      if (og.targetStationB && og.targetStationB !== 'none') {
        adj[og.id].push(og.targetStationB);
      }
    });

    // 2. Reachability Check: Every active node must be able to reach 'exit'
    const canReachExit = (startNode: string): boolean => {
      const visitedReach = new Set<string>();
      const queue = [startNode];
      visitedReach.add(startNode);

      while (queue.length > 0) {
        const curr = queue.shift()!;
        const succs = adj[curr] || [];
        for (const succ of succs) {
          if (succ === 'exit') {
            return true;
          }
          if (!visitedReach.has(succ)) {
            visitedReach.add(succ);
            queue.push(succ);
          }
        }
      }
      return false;
    };

    let hasUnreachableNode = false;
    stations.forEach(st => {
      if (!canReachExit(st.id)) {
        hasUnreachableNode = true;
      }
    });
    orGates.forEach(og => {
      if (!canReachExit(og.id)) {
        hasUnreachableNode = true;
      }
    });

    if (hasUnreachableNode) {
      errors.push("Layout Cannot Function Properly: There is a dead-end infinite loop or entrapment with no path to Exit.");
    }

    return errors;
  };

  const layoutErrors = selectedShop ? getLayoutValidationErrors(selectedShop) : [];
  const isLayoutValid = layoutErrors.length === 0;

  const getHMS = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return { h, m, s };
  };

  const handleAutoFixSelectedShopLayout = () => {
    if (!selectedShop || !selectedShop.stationsData) return;

    // Chain the stations sequentially:
    // station[0] -> station[1] -> ... -> station[n-1] -> 'exit'
    const updatedStations = selectedShop.stationsData.map((st, idx) => {
      if (idx < selectedShop.stationsData.length - 1) {
        return { ...st, successor: selectedShop.stationsData[idx + 1].id };
      } else {
        return { ...st, successor: 'exit' };
      }
    });

    // Reset any OR Gates to safely point to 'exit' and first station to avoid any loop formation, while ensuring they are different
    const firstStation = selectedShop.stationsData?.[0];
    const updatedGates = selectedShop.orGates?.map(og => ({
      ...og,
      targetStationA: 'exit',
      targetStationB: firstStation ? firstStation.id : 'exit'
    })) || [];

    onUpdateShop(selectedShop.id, { 
      stationsData: updatedStations,
      orGates: updatedGates
    });

    setNotification(`Auto-Fix applied: Successfully resolved loops by chaining stations sequentially to the exit!`);
    setTimeout(() => setNotification(null), 4000);
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

    // Enforce no self-pointing
    nextStations = nextStations.map(st => {
      if (st.successor === st.id) {
        const otherSt = nextStations.find(o => o.id !== st.id);
        st.successor = otherSt ? otherSt.id : 'exit';
      }
      return st;
    });

    onUpdateShop(selectedShop.id, { stationsData: nextStations });
    setConfirmedShops(prev => prev.filter(id => id !== selectedShop.id));
  };

  const handleSetGatePredecessor = (gateId: string, predStationId: string) => {
    if (!selectedShop || !selectedShop.stationsData) return;
    const firstStation = selectedShop.stationsData[0];
    const lastStation = selectedShop.stationsData[selectedShop.stationsData.length - 1];

    let nextStations = [...selectedShop.stationsData];
    let nextGates = selectedShop.orGates ? [...selectedShop.orGates] : [];

    if (predStationId === 'import_converter') {
      // 1. Set successors of this gate to point to A1 (first station)
      nextGates = nextGates.map(g => {
        if (g.id === gateId) {
          return {
            ...g,
            targetStationA: firstStation ? firstStation.id : 'exit',
            targetStationB: 'exit'
          };
        }
        return g;
      });

      // 2. Remove any station pointing to this gate as successor
      nextStations = nextStations.map(st => {
        if (st.successor === gateId) {
          return { ...st, successor: 'exit' };
        }
        return st;
      });
    } else {
      // 1. Point chosen station to this gate, and reset any other station currently pointing to this gate
      nextStations = nextStations.map(st => {
        if (st.successor === gateId) {
          return { ...st, successor: 'exit' };
        }
        if (st.id === predStationId) {
          return { ...st, successor: gateId };
        }
        return st;
      });

      // 2. If it is the last station, set YES successor of the gate to 'exit' and NO successor to loop back to the first station
      const isLast = lastStation && predStationId === lastStation.id;
      if (isLast) {
        nextGates = nextGates.map(g => {
          if (g.id === gateId) {
            return {
              ...g,
              targetStationA: 'exit',
              targetStationB: firstStation ? firstStation.id : 'exit'
            };
          }
          return g;
        });
      }
    }

    onUpdateShop(selectedShop.id, { stationsData: nextStations, orGates: nextGates });
    setConfirmedShops(prev => prev.filter(id => id !== selectedShop.id));
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
        {/* Error Alert Dialog Pop-up */}
        {orGateError && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
            <div className="bg-[#0f172a] border border-red-500/50 rounded-xl p-6 max-w-md w-full shadow-2xl flex flex-col gap-4 animate-scale-up text-left">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-red-500/10 text-red-500 rounded-lg">
                  <AlertTriangle className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white select-none">Routing Validation Error</h3>
                  <p className="text-slate-400 text-sm mt-1 leading-relaxed">
                    {orGateError}
                  </p>
                </div>
              </div>
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setOrGateError(null)}
                  className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 hover:text-white rounded-lg text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

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
            <>
              {/* PART BLUEPRINT */}
              <section className="bg-surface-container rounded-xl border border-outline-variant/30 p-6 grid grid-cols-1 md:grid-cols-12 gap-6 relative overflow-hidden text-left shadow-md mb-6">
                <div className="md:col-span-8 space-y-6">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                      <h2 className="text-sm font-mono uppercase tracking-wider text-primary font-bold">PART BLUEPRINT</h2>
                    </div>
                    <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                      Set the part details below. The simulator will load these on the main intake conveyor.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                    {/* PHYSICAL SHAPE */}
                    <div>
                      <label className="block text-[10px] font-mono text-on-surface-variant font-bold uppercase tracking-wider mb-1.5">
                        PHYSICAL SHAPE
                      </label>
                      <select
                        value={selectedShop.partShape || 'square'}
                        onChange={(e) => {
                          onUpdateShop(selectedShop.id, { partShape: e.target.value as any });
                        }}
                        className="w-full bg-[#10192e] border border-outline-variant/40 py-2.5 px-3 rounded-lg text-xs font-bold text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/40 cursor-pointer"
                      >
                        <option value="square">Square</option>
                        <option value="rectangle">Rectangle</option>
                        <option value="triangle">Triangle</option>
                        <option value="pentagon">Pentagon</option>
                        <option value="heart">Heart</option>
                        <option value="diamond">Diamond</option>
                        <option value="oval">Oval</option>
                      </select>
                    </div>

                    {/* PART WIDTH */}
                    <div>
                      <div className="flex justify-between items-center mb-1.5">
                        <label className="text-[10px] font-mono text-on-surface-variant font-bold uppercase tracking-wider">
                          PART WIDTH
                        </label>
                        <span className="text-xs font-mono font-bold text-primary">{selectedShop.partWidth || 50} MM</span>
                      </div>
                      <input
                        type="range"
                        min="20"
                        max="100"
                        value={selectedShop.partWidth || 50}
                        onChange={(e) => onUpdateShop(selectedShop.id, { partWidth: parseInt(e.target.value) })}
                        className="w-full accent-primary bg-surface-container-high h-1.5 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>

                    {/* PART LENGTH */}
                    <div>
                      <div className="flex justify-between items-center mb-1.5">
                        <label className="text-[10px] font-mono text-on-surface-variant font-bold uppercase tracking-wider">
                          PART LENGTH
                        </label>
                        <span className="text-xs font-mono font-bold text-primary">{selectedShop.partHeight || 50} MM</span>
                      </div>
                      <input
                        type="range"
                        min="20"
                        max="100"
                        value={selectedShop.partHeight || 50}
                        onChange={(e) => onUpdateShop(selectedShop.id, { partHeight: parseInt(e.target.value) })}
                        className="w-full accent-primary bg-surface-container-high h-1.5 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>

                    {/* PAINT STROKE WIDTH */}
                    <div>
                      <div className="flex justify-between items-center mb-1.5">
                        <label className="text-[10px] font-mono text-on-surface-variant font-bold uppercase tracking-wider">
                          PAINT STROKE WIDTH
                        </label>
                        <span className="text-xs font-mono font-bold text-amber-500">{selectedShop.paintStrokeWidth || 3} PX</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="10"
                        value={selectedShop.paintStrokeWidth || 3}
                        onChange={(e) => onUpdateShop(selectedShop.id, { paintStrokeWidth: parseInt(e.target.value) })}
                        className="w-full accent-amber-500 bg-surface-container-high h-1.5 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>

                    {/* PAINT FILL COLOR */}
                    <div>
                      <label className="block text-[10px] font-mono text-on-surface-variant font-bold uppercase tracking-wider mb-1.5">
                        PAINT FILL COLOR
                      </label>
                      <div className="flex gap-2 items-center">
                        <div className="relative flex-1">
                          <input
                            type="text"
                            value={selectedShop.paintFillColor || '#FF5733'}
                            onChange={(e) => onUpdateShop(selectedShop.id, { paintFillColor: e.target.value })}
                            className="w-full bg-[#10192e] border border-outline-variant/40 py-2.5 px-3 rounded-lg text-xs font-bold text-on-surface focus:outline-none focus:border-primary focus:ring-0 pl-10 uppercase font-mono"
                          />
                          <div 
                            className="absolute left-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 rounded-md border border-white/20"
                            style={{ backgroundColor: selectedShop.paintFillColor || '#FF5733' }}
                          />
                        </div>
                        <input
                          type="color"
                          value={selectedShop.paintFillColor || '#FF5733'}
                          onChange={(e) => onUpdateShop(selectedShop.id, { paintFillColor: e.target.value })}
                          className="w-10 h-9 p-0 bg-transparent border-0 cursor-pointer rounded overflow-hidden"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right side: PART SCHEMATIC */}
                <div className="md:col-span-4 bg-[#090e17] rounded-xl border border-[#141b2c] p-4 flex flex-col items-center justify-center relative shadow-inner overflow-hidden select-none min-h-[220px]">
                  <div 
                    className="absolute inset-0 pointer-events-none opacity-40"
                    style={{
                      backgroundImage: 'radial-gradient(circle, rgba(74, 144, 226, 0.15) 1px, transparent 1px)',
                      backgroundSize: '12px 12px',
                      backgroundPosition: 'center',
                    }}
                  />
                  <div className="absolute top-2.5 font-mono text-[9px] uppercase tracking-wider text-[#8e909a] font-bold">
                    PART SCHEMATIC
                  </div>

                  <div className="w-32 h-32 flex items-center justify-center z-10">
                    <svg viewBox="0 0 200 200" className="w-full h-full drop-shadow-[0_0_15px_rgba(255,87,51,0.15)]">
                      {renderBlueprintShape(
                        selectedShop.partShape || 'square',
                        selectedShop.paintFillColor || '#FF5733',
                        selectedShop.paintStrokeWidth || 3,
                        selectedShop.partWidth || 50,
                        selectedShop.partHeight || 50
                      )}
                    </svg>
                  </div>

                  <div className="mt-2 bg-[#121c32]/90 border border-primary/20 rounded-full px-3 py-1 font-mono text-[9px] text-[#adc6ff] font-bold z-10 shadow flex gap-1.5 items-center select-none uppercase">
                    <span>{selectedShop.partShape || 'SQUARE'}</span>
                    <span className="opacity-30">•</span>
                    <span>{selectedShop.partWidth || 50}x{selectedShop.partHeight || 50}mm</span>
                    <span className="opacity-30">•</span>
                    <span>{selectedShop.paintStrokeWidth || 3}px stroke</span>
                    <span className="opacity-30">•</span>
                    <span className="text-[#52d3a3]">{selectedShop.paintFillColor || '#FF5733'}</span>
                  </div>
                </div>
              </section>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              {/* Left Column: Stations Counter & Shop Info */}
              <div className="lg:col-span-1 bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-5 flex flex-col gap-6">
                <div>
                  <h3 className="font-mono text-[9px] uppercase tracking-wider text-primary font-bold mb-3">{selectedShop.name} Core Parameters</h3>
                  <div className="space-y-4">
                    {/* Stations Incremental Modifier */}
                    <div>
                      <label className="block text-[8.5px] text-on-surface-variant font-medium mb-1 select-none uppercase tracking-wide">
                        Stations Count
                      </label>
                      <div className="flex items-center bg-surface-container rounded-lg border border-outline-variant/40 overflow-hidden w-full max-w-[200px]">
                        <button
                          type="button"
                          onClick={() => onUpdateShop(selectedShop.id, { stations: Math.max(1, selectedShop.stations - 1) })}
                          className="px-2.5 py-1 hover:bg-surface-container-highest border-r border-[#2d3a58] text-primary cursor-pointer transition-colors"
                          title="Reduce Stations"
                        >
                          <Minus className="w-3 h-3 text-primary" />
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
                          className="w-full text-center font-mono font-bold text-[10px] text-on-surface bg-transparent border-none focus:outline-none focus:ring-0 p-0"
                        />
                        <button
                          type="button"
                          onClick={() => onUpdateShop(selectedShop.id, { stations: Math.min(20, selectedShop.stations + 1) })}
                          className="px-2.5 py-1 hover:bg-surface-container-highest border-l border-[#2d3a58] text-primary cursor-pointer transition-colors"
                          title="Increase Stations"
                        >
                          <Plus className="w-3 h-3 text-primary" />
                        </button>
                      </div>
                    </div>

                    {/* Intake parts capacity modifier (only for input shop) */}
                    {selectedShop.isInputShop && (
                      <div className="pt-1.5 border-t border-outline-variant/15 md:col-span-1">
                        <label className="block text-[8.5px] text-on-surface-variant font-medium mb-1 select-none uppercase tracking-wide">
                          Initial Parts Conveyor
                        </label>
                        <div className="flex items-center bg-surface-container rounded-lg border border-outline-variant/40 overflow-hidden w-full max-w-[200px]">
                          <button
                            type="button"
                            onClick={() => onUpdateShop(selectedShop.id, { intakePartsCount: Math.max(1, (selectedShop.intakePartsCount || 15) - 1) })}
                            className="px-2.5 py-1 hover:bg-surface-container-highest border-r border-[#2d3a58] text-[#52d3a3] cursor-pointer transition-colors"
                            title="Reduce Intake Count"
                          >
                            <Minus className="w-3 h-3 text-[#52d3a3]" />
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
                            className="w-full text-center font-mono font-bold text-[10px] text-[#52d3a3] bg-transparent border-none focus:outline-none focus:ring-0 p-0"
                          />
                          <button
                            type="button"
                            onClick={() => onUpdateShop(selectedShop.id, { intakePartsCount: Math.min(10000, (selectedShop.intakePartsCount || 15) + 1) })}
                            className="px-2.5 py-1 hover:bg-surface-container-highest border-l border-[#2d3a58] text-[#52d3a3] cursor-pointer transition-colors"
                            title="Increase Intake Count"
                          >
                            <Plus className="w-3 h-3 text-[#52d3a3]" />
                          </button>
                        </div>
                        <p className="text-[8px] text-emerald-400/90 font-mono mt-0.5 leading-snug">
                          Specifies how many parts will come from the intake conduit. (Max 10,000)
                        </p>
                      </div>
                    )}

                    {/* Add Or Gate button */}
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          const currentGates = selectedShop.orGates || [];
                          const count = currentGates.length + 1;
                          const gateId = `orgate-${selectedShop.id}-${Date.now()}`;
                          const stations = selectedShop.stationsData || [];
                          const firstStationId = stations[0]?.id || 'exit';
                          const newGate: OrGateTopology = {
                            id: gateId,
                            name: `OR GATE ${count}`,
                            posX: 80 + (count * 25) % 120,
                            posY: 130 + (count * 25) % 100,
                            criteriaCategory: 'shape',
                            criteriaValue: 'square',
                            targetStationA: firstStationId,
                            targetStationB: firstStationId !== 'exit' ? 'exit' : 'exit'
                          };

                          // Force first station (if any exist) to have this new OR gate as its successor
                          const nextStations = (selectedShop.stationsData || []).map((st, sIdx) => {
                            if (sIdx === 0) {
                              return { ...st, successor: gateId };
                            }
                            return st;
                          });

                          onUpdateShop(selectedShop.id, {
                            orGates: [...currentGates, newGate],
                            stationsData: nextStations
                          });
                          setNotification(`Added ${newGate.name} to ${selectedShop.name}. Drag to position it!`);
                          setTimeout(() => setNotification(null), 3000);
                        }}
                        className="w-full py-2 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 text-orange-400 rounded-lg text-xs font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                      >
                        <Plus className="w-3.5 h-3.5 animate-pulse" />
                        <span>Add Or Gate</span>
                      </button>
                    </div>

                    <div className="p-2 bg-[#131b2e] border border-[#2d3a58]/35 rounded-lg flex flex-col gap-1">
                      <div className="flex justify-between items-center text-[8.5px]">
                        <span className="text-on-surface-variant">Entrance Path:</span>
                        <span className="font-mono text-emerald-400 font-bold">
                          {selectedShop.isInputShop ? 'Primary Intake Line' : 'Previous Shop Successor'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-[8.5px]">
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

                {/* Validation Errors Panel */}
                {!isLayoutValid ? (
                  <div className="bg-red-500/10 border border-red-500/30 p-3 rounded-lg text-xs flex flex-col gap-1.5 text-red-400">
                    <div className="flex items-center gap-1.5 font-bold">
                      <span className="text-sm">⚠️</span> Circular Routing Loop Detected
                    </div>
                    <ul className="list-disc list-inside space-y-1 text-on-surface-variant/80 font-mono text-[10px]">
                      {layoutErrors.map((err, idx) => (
                        <li key={idx}>
                          {err.replace("You cannot proceed further because there is a loop in the routing logic.", "There is a circular loop in the routing.")}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1 text-[10px] italic opacity-80">
                      Cycles/loops cause infinite processing. Please fix station successors to point forward towards the exit.
                    </p>
                  </div>
                ) : null}

                {/* Suggested Auto-Fix Layout Trigger */}
                {!isLayoutValid && (
                  <div className="bg-amber-500/10 border border-amber-500/25 p-4 rounded-xl text-xs flex flex-col gap-2 text-amber-300">
                    <div className="flex items-center gap-1.5 font-bold text-amber-400">
                      <span>✨</span> Suggested Layout Fix
                    </div>
                    <p className="text-[10px] leading-relaxed text-on-surface-variant/80">
                      Instantly connect all stations in a seamless, sequential flow (First Station → Next Station ... → Exit). This ensures a loop-free layout that functions properly!
                    </p>
                    <button
                      type="button"
                      onClick={handleAutoFixSelectedShopLayout}
                      className="w-full py-2 px-3 bg-amber-400 hover:bg-amber-300 text-slate-900 font-extrabold rounded-lg text-[10px] cursor-pointer transition-all flex items-center justify-center gap-1.5 uppercase tracking-wider shadow-md hover:shadow-lg"
                    >
                      <span>⚡</span> Apply Suggested Fix
                    </button>
                  </div>
                )}

                {/* Confirm Layout for This Shop button */}
                <button
                  type="button"
                  disabled={!isLayoutValid}
                  onClick={() => {
                    if (!confirmedShops.includes(selectedShop.id)) {
                      setConfirmedShops(prev => [...prev, selectedShop.id]);
                      setNotification(`${selectedShop.name} layout configuration confirmed!`);
                    } else {
                      setNotification(`${selectedShop.name} layout configuration already verified.`);
                    }
                  }}
                  className={`w-full h-11 rounded-lg font-bold text-xs select-none flex items-center justify-center gap-2 border transition-all ${
                    !isLayoutValid
                      ? 'bg-muted/10 text-on-surface-variant/40 border-outline-variant/20 cursor-not-allowed opacity-50'
                      : confirmedShops.includes(selectedShop.id)
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
                    Station Sequence
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
                      : targetSucc.startsWith('orgate-')
                      ? (selectedShop.orGates?.find(g => g.id === targetSucc)?.name || 'OR Gate')
                      : (selectedShop.stationsData?.find(s => s.id === targetSucc)?.name || 'Next');

                    const predecessorNames = (() => {
                      const preds: string[] = [];
                      // 1. From other stations
                      selectedShop.stationsData?.forEach(s => {
                        if (s.successor === station.id) {
                          preds.push(s.name);
                        }
                      });
                      // 2. From OR gates
                      selectedShop.orGates?.forEach(og => {
                        if (og.targetStationA === station.id) {
                          preds.push(`${og.name} (YES)`);
                        }
                        if (og.targetStationB === station.id) {
                          preds.push(`${og.name} (NO)`);
                        }
                      });
                      return preds.length > 0 ? preds.join(', ') : "Import Conveyor";
                    })();

                    return (
                      <React.Fragment key={station.id}>
                        <div 
                          className="bg-surface-container-low border border-outline-variant/30 rounded-lg p-1.5 hover:border-[#2d3a58] transition-all flex flex-col gap-1.5 relative shadow-sm"
                        >
                        {/* Title Row with Successor link */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-outline-variant/15 pb-1">
                          <div className="flex items-center gap-1">
                            <div className="w-4 h-4 rounded-full bg-[#1e2a4a] text-primary font-mono text-[9px] font-bold flex items-center justify-center shrink-0">
                              {index + 1}
                            </div>
                            <input
                              type="text"
                              value={station.name}
                              onChange={(e) => handleUpdateStation(station.id, { name: e.target.value })}
                              className="font-mono text-[11px] font-bold text-on-surface bg-transparent border-b border-dashed border-primary/30 hover:border-primary/80 focus:border-primary focus:bg-[#09101d] px-1 py-0 rounded focus:outline-none transition-all w-28 sm:w-36 focus:ring-0"
                              placeholder="STATION NAME"
                              maxLength={24}
                            />
                          </div>

                          {(() => {
                            const pointingGate = selectedShop.orGates?.find(g => station.successor === g.id);
                            const isFixedToGate = !!pointingGate;

                            return (
                              <div className="flex items-center gap-1.5 text-[10px] font-mono text-on-surface-variant">
                                <span className="opacity-90 font-bold shrink-0">Successor:</span>
                                <select
                                  value={station.successor?.split(',')[0] || 'exit'}
                                  disabled={isFixedToGate}
                                  onChange={(e) => {
                                    handleUpdateStation(station.id, { successor: e.target.value });
                                  }}
                                  className={`bg-[#10192e] border border-outline-variant/30 font-mono py-0 px-1 rounded text-[10px] font-bold focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary max-w-[150px] ${
                                    isFixedToGate 
                                      ? 'text-orange-400 border-orange-500/20 cursor-not-allowed opacity-80' 
                                      : 'text-primary cursor-pointer'
                                  }`}
                                >
                                  {isFixedToGate ? (
                                    <option value={pointingGate.id} className="bg-[#0c1324] text-orange-400 text-[10px] font-bold">
                                      {pointingGate.name} (Fixed)
                                    </option>
                                  ) : (
                                    <>
                                      {/* Option to route to any other station in the shop */}
                                      {selectedShop.stationsData?.filter(s => s.id !== station.id)
                                        .map(s => (
                                          <option key={s.id} value={s.id} className="bg-[#0c1324] text-on-surface text-[10px]">
                                            {s.name}
                                          </option>
                                        ))
                                      }
                                      {/* Option to exit shop */}
                                      <option value="exit" className="bg-[#0c1324] text-emerald-400 font-bold text-[10px]">
                                        {selectedShop.isOutputShop ? "Exit: Export Conveyor" : `Exit: Next Shop (${selectedShop.successor})`}
                                      </option>
                                    </>
                                  )}
                                </select>
                              </div>
                            );
                          })()}
                        </div>

                        {/* Config inputs flex - brought closer together horizontally */}
                        <div className="flex flex-row flex-wrap items-end gap-x-3 gap-y-1.5">
                          {/* 1. Buffer Capacity */}
                          <div className="flex flex-col gap-0.5">
                            <label className="text-[8px] uppercase font-mono tracking-wider font-bold text-on-surface-variant/70">
                              Buffer Capacity Limit
                            </label>
                            <div className="flex items-center bg-surface-container-lowest border border-outline-variant/30 rounded overflow-hidden w-full max-w-[100px] h-[22px]">
                              <button
                                type="button"
                                onClick={() => handleUpdateStation(station.id, { bufferSize: Math.max(1, station.bufferSize - 1) })}
                                className="px-1.5 py-0.5 hover:bg-surface-container text-primary transition-colors cursor-pointer shrink-0"
                              >
                                <Minus className="w-2.5 h-2.5 text-primary" />
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
                                className="w-full text-[#dae2fd] text-center font-mono font-bold text-[10px] bg-transparent border-none focus:outline-none focus:ring-0 p-0"
                              />
                              <button
                                type="button"
                                onClick={() => handleUpdateStation(station.id, { bufferSize: Math.min(10000, station.bufferSize + 1) })}
                                className="px-1.5 py-0.5 hover:bg-surface-container text-primary transition-colors cursor-pointer shrink-0"
                              >
                                <Plus className="w-2.5 h-2.5 text-primary" />
                              </button>
                            </div>
                          </div>

                          {/* 3. Cycle Time in HMS - placed right alongside the buffer limit */}
                          <div className="flex flex-col gap-0.5">
                            <label className="text-[8px] uppercase font-mono tracking-wider font-bold text-on-surface-variant/70">
                              Cycle Time (Hrs:Mins:Secs)
                            </label>
                            <div className="flex items-center gap-1 bg-[#10192e]/40 px-1 py-0.5 rounded border border-outline-variant/15">
                              {/* Hours */}
                              <div className="flex flex-col items-center">
                                <span className="text-[7px] font-mono text-on-surface-variant opacity-60 scale-90 leading-none mb-0.5">HH</span>
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
                                  className="w-7 bg-[#10192e] border border-outline-variant/20 text-center font-mono py-0 rounded text-[10px] text-primary focus:outline-none focus:ring-1 focus:ring-primary/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                              </div>
                              <span className="text-on-surface-variant/50 font-bold text-[10px] mt-2">:</span>

                              {/* Minutes */}
                              <div className="flex flex-col items-center">
                                <span className="text-[7px] font-mono text-on-surface-variant opacity-60 scale-90 leading-none mb-0.5">MM</span>
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
                                  className="w-7 bg-[#10192e] border border-outline-variant/20 text-center font-mono py-0 rounded text-[10px] text-primary focus:outline-none focus:ring-1 focus:ring-primary/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                              </div>
                              <span className="text-on-surface-variant/50 font-bold text-[10px] mt-2">:</span>

                              {/* Seconds */}
                              <div className="flex flex-col items-center">
                                <span className="text-[7px] font-mono text-on-surface-variant opacity-60 scale-90 leading-none mb-0.5">SS</span>
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
                                  className="w-7 bg-[#10192e] border border-outline-variant/20 text-center font-mono py-0 rounded text-[10px] text-primary focus:outline-none focus:ring-1 focus:ring-primary/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Conveyor Link Destination Beside Cycle Time inside the Station Box */}
                          <div className="flex flex-col gap-0.5 min-w-[190px] flex-1">
                            <label className="text-[8px] uppercase font-mono tracking-wider font-bold text-on-surface-variant/70">
                              Transit Conveyor Link
                            </label>
                            <div className="flex items-center gap-1.5 bg-[#0e1626]/60 border border-dashed border-[#1e2a4a]/70 rounded px-2 h-[22px] justify-between text-[8.5px]">
                              <span className="font-mono text-[8.5px] text-blue-400 font-bold flex items-center gap-1 leading-none select-none">
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse shrink-0"></span>
                                {predecessorNames} &rarr; {station.name} &rarr; {targetSuccName}
                              </span>
                              <span className="text-[7px] font-mono text-on-surface-variant/40 shrink-0 uppercase select-none font-bold">
                                Code: {targetSucc}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })}

                {/* Section: OR Gate Configuration Panel */}
                {selectedShop.orGates && selectedShop.orGates.length > 0 && (
                  <div className="mt-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <h3 className="font-mono text-[10px] uppercase tracking-wider text-orange-400 font-bold select-none">
                        OR Gate Routing Logic
                      </h3>
                      <span className="text-[10px] bg-orange-950/20 text-orange-400 font-mono font-bold py-0.5 px-2 rounded border border-orange-500/20">
                        Gates: {selectedShop.orGates.length}
                      </span>
                    </div>

                    <div className="space-y-2">
                      {selectedShop.orGates.map((gate, index) => {
                        return (
                          <div 
                            key={gate.id}
                            className="bg-[#241710]/30 border border-orange-500/15 rounded-lg p-1.5 hover:border-orange-500/35 transition-all flex flex-col gap-2 relative shadow-sm text-left"
                          >
                            {/* Title & Controls Beside Trash Button */}
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-orange-500/10 pb-1.5">
                              <div className="flex items-center gap-1 shrink-0">
                                <div className="w-4 h-4 rounded bg-orange-500/10 border border-orange-500/30 text-orange-400 font-mono text-[9px] font-bold flex items-center justify-center shrink-0">
                                  ◇
                                </div>
                                <input
                                  type="text"
                                  value={gate.name}
                                  onChange={(e) => {
                                    const updatedGates = selectedShop.orGates!.map(g => g.id === gate.id ? { ...g, name: e.target.value } : g);
                                    onUpdateShop(selectedShop.id, { orGates: updatedGates });
                                  }}
                                  className="font-mono text-[11px] font-bold text-orange-300 bg-transparent border-b border-dashed border-orange-500/30 hover:border-orange-500/80 focus:border-orange-400 px-1 py-0 rounded focus:outline-none transition-all w-20 sm:w-24 focus:ring-0"
                                  placeholder="GATE NAME"
                                  maxLength={24}
                                />
                              </div>

                              {/* Controls beside trash button */}
                              <div className="flex flex-wrap items-center gap-2 ml-auto">
                                {(() => {
                                  const stations = selectedShop.stationsData || [];
                                  const firstStation = stations[0];
                                  const lastStation = stations[stations.length - 1];

                                  const predStation = stations.find(s => s.successor === gate.id);
                                  const predIdx = predStation ? stations.indexOf(predStation) : -1;

                                  const isFirstThingBeforeA1 = firstStation && (gate.targetStationA === firstStation.id || gate.targetStationB === firstStation.id);
                                  const isLastThingAfterLastStation = lastStation && predStation?.id === lastStation.id;

                                  const currentShopIdx = shops.findIndex(s => s.id === selectedShop.id);
                                  const hasNextShop = currentShopIdx !== -1 && currentShopIdx < shops.length - 1;

                                  const allowedStations = stations.filter((st, sIdx) => {
                                    if (predIdx === -1) return true;
                                    return sIdx > predIdx;
                                  });

                                  return (
                                    <>
                                      {/* Predecessor Selection */}
                                      {isFirstThingBeforeA1 ? (
                                        <div className="flex items-center gap-1 bg-orange-950/20 border border-orange-500/10 px-1.5 py-0.5 rounded" title="First element: Predecessor is Import Converter">
                                          <span className="text-[8px] uppercase font-mono font-black text-orange-400">Pred: Import</span>
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-1">
                                          <span className="text-[8px] uppercase font-mono font-bold text-orange-400/85" title="The station that sends parts to this gate">Pred:</span>
                                          <select
                                            value={predStation?.id || "import_converter"}
                                            onChange={(e) => {
                                              handleSetGatePredecessor(gate.id, e.target.value);
                                            }}
                                            className="bg-[#120a05] border border-orange-500/20 rounded px-1 py-0 text-[10px] text-orange-300 font-bold focus:outline-none cursor-pointer max-w-[85px]"
                                          >
                                            <option value="import_converter">Import Converter</option>
                                            {stations.map(s => (
                                              <option key={s.id} value={s.id}>{s.name}</option>
                                            ))}
                                          </select>
                                        </div>
                                      )}

                                      {/* YES/NO Successor Targets */}
                                      {isLastThingAfterLastStation ? (
                                        <>
                                          {/* YES Successor Target */}
                                          <div className="flex items-center gap-1">
                                            <span className="text-[8px] uppercase font-mono font-black text-emerald-400">YES:</span>
                                            <select
                                              value="exit"
                                              disabled
                                              className="bg-[#10192e] border border-outline-variant/30 font-mono py-0 px-1 rounded text-[10px] text-emerald-400 font-bold focus:outline-none cursor-not-allowed max-w-[130px] opacity-90"
                                            >
                                              <option value="exit">{hasNextShop ? "Exit to Next Shop" : "Yes, Exit"}</option>
                                            </select>
                                          </div>

                                          {/* NO Successor Target */}
                                          <div className="flex items-center gap-1">
                                            <span className="text-[8px] uppercase font-mono font-black text-rose-400">NO:</span>
                                            <select
                                              value={gate.targetStationB === 'exit' ? (firstStation?.id || 'exit') : gate.targetStationB}
                                              onChange={(e) => {
                                                const targetVal = e.target.value;
                                                if (targetVal === 'exit') {
                                                  setOrGateError("YES and NO successor values cannot be the same! Both paths must point to unique stations or exits.");
                                                  return;
                                                }
                                                const updatedGates = selectedShop.orGates!.map(g => g.id === gate.id ? { ...g, targetStationB: targetVal } : g);
                                                onUpdateShop(selectedShop.id, { orGates: updatedGates });
                                              }}
                                              className="bg-[#10192e] border border-outline-variant/30 font-mono py-0 px-1 rounded text-[10px] text-rose-400 font-bold focus:outline-none cursor-pointer max-w-[85px]"
                                            >
                                              {stations.map(s => (
                                                <option key={s.id} value={s.id}>{s.name}</option>
                                              ))}
                                            </select>
                                          </div>
                                        </>
                                      ) : (
                                        <>
                                          {/* YES Successor Target */}
                                          <div className="flex items-center gap-1">
                                            <span className="text-[8px] uppercase font-mono font-black text-emerald-400">YES:</span>
                                            <select
                                              value={gate.targetStationA}
                                              onChange={(e) => {
                                                const targetVal = e.target.value;
                                                if (targetVal === gate.targetStationB) {
                                                  setOrGateError("YES and NO successor values cannot be the same! Both paths must point to unique stations or exits.");
                                                  return;
                                                }
                                                const firstSt = selectedShop.stationsData?.[0];
                                                const isFirst = firstSt && targetVal === firstSt.id;
                                                let nextStations = selectedShop.stationsData || [];
                                                if (isFirst) {
                                                  nextStations = nextStations.map(st => {
                                                    if (st.successor === gate.id) {
                                                      return { ...st, successor: 'exit' };
                                                    }
                                                    return st;
                                                  });
                                                }
                                                const updatedGates = selectedShop.orGates!.map(g => g.id === gate.id ? { ...g, targetStationA: targetVal } : g);
                                                onUpdateShop(selectedShop.id, { orGates: updatedGates, stationsData: nextStations });
                                              }}
                                              className="bg-[#10192e] border border-outline-variant/30 font-mono py-0 px-1 rounded text-[10px] text-emerald-400 font-bold focus:outline-none cursor-pointer max-w-[85px]"
                                            >
                                              {allowedStations.map(s => (
                                                <option key={s.id} value={s.id}>{s.name}</option>
                                              ))}
                                              <option value="exit">Exit</option>
                                            </select>
                                          </div>

                                          {/* NO Successor Target */}
                                          <div className="flex items-center gap-1">
                                            <span className="text-[8px] uppercase font-mono font-black text-rose-400">NO:</span>
                                            <select
                                              value={gate.targetStationB}
                                              onChange={(e) => {
                                                const targetVal = e.target.value;
                                                if (targetVal === gate.targetStationA) {
                                                  setOrGateError("YES and NO successor values cannot be the same! Both paths must point to unique stations or exits.");
                                                  return;
                                                }
                                                const firstSt = selectedShop.stationsData?.[0];
                                                const isFirst = firstSt && targetVal === firstSt.id;
                                                let nextStations = selectedShop.stationsData || [];
                                                if (isFirst) {
                                                  nextStations = nextStations.map(st => {
                                                    if (st.successor === gate.id) {
                                                      return { ...st, successor: 'exit' };
                                                    }
                                                    return st;
                                                  });
                                                }
                                                const updatedGates = selectedShop.orGates!.map(g => g.id === gate.id ? { ...g, targetStationB: targetVal } : g);
                                                onUpdateShop(selectedShop.id, { orGates: updatedGates, stationsData: nextStations });
                                              }}
                                              className="bg-[#10192e] border border-outline-variant/30 font-mono py-0 px-1 rounded text-[10px] text-rose-400 font-bold focus:outline-none cursor-pointer max-w-[85px]"
                                            >
                                              {allowedStations.map(s => (
                                                <option key={s.id} value={s.id}>{s.name}</option>
                                              ))}
                                              <option value="exit">Exit</option>
                                            </select>
                                          </div>
                                        </>
                                      )}
                                    </>
                                  );
                                })()}

                                <button
                                  type="button"
                                  onClick={() => {
                                    const updatedGates = selectedShop.orGates!.filter(g => g.id !== gate.id);
                                    const updatedStations = (selectedShop.stationsData || []).map(st => {
                                      if (st.successor === gate.id) {
                                        return { ...st, successor: 'exit' };
                                      }
                                      return st;
                                    });
                                    onUpdateShop(selectedShop.id, { 
                                      orGates: updatedGates,
                                      stationsData: updatedStations
                                    });
                                  }}
                                  className="p-0.5 hover:bg-red-500/15 rounded text-red-400 transition-colors cursor-pointer ml-1"
                                  title="Delete OR Gate"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>

                            {/* Condition logic */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div className="flex flex-col gap-0.5">
                                <label className="text-[8px] uppercase font-mono tracking-wider font-bold text-orange-400/70">
                                  Routing Criteria
                                </label>
                                <select
                                  value={gate.criteriaCategory}
                                  onChange={(e) => {
                                    const cat = e.target.value as any;
                                    let defVal = '';
                                    if (cat === 'shape') defVal = 'square';
                                    else if (cat === 'color') defVal = '#FF5733';
                                    else if (cat === 'borderSize') defVal = '2';
                                    else if (cat === 'width') defVal = '50';
                                    else if (cat === 'height') defVal = '50';

                                    const updatedGates = selectedShop.orGates!.map(g => g.id === gate.id ? { ...g, criteriaCategory: cat, criteriaValue: defVal } : g);
                                    onUpdateShop(selectedShop.id, { orGates: updatedGates });
                                  }}
                                  className="bg-[#120a05] border border-orange-500/20 rounded px-1.5 py-0.5 text-[10px] text-orange-300 font-bold focus:outline-none cursor-pointer"
                                >
                                  <option value="shape">Shape type</option>
                                  <option value="color">Paint color</option>
                                  <option value="borderSize">Stroke width (px)</option>
                                  <option value="width">Width (mm)</option>
                                  <option value="height">Height (mm)</option>
                                </select>
                              </div>

                              <div className="flex flex-col gap-0.5">
                                <label className="text-[8px] uppercase font-mono tracking-wider font-bold text-orange-400/70">
                                  Value to Match
                                </label>
                                {gate.criteriaCategory === 'shape' ? (
                                  <select
                                    value={gate.criteriaValue}
                                    onChange={(e) => {
                                      const updatedGates = selectedShop.orGates!.map(g => g.id === gate.id ? { ...g, criteriaValue: e.target.value } : g);
                                      onUpdateShop(selectedShop.id, { orGates: updatedGates });
                                    }}
                                    className="bg-[#120a05] border border-orange-500/20 rounded px-1.5 py-0.5 text-[10px] text-orange-300 font-bold focus:outline-none cursor-pointer w-full"
                                  >
                                    <option value="square">Square</option>
                                    <option value="rectangle">Rectangle</option>
                                    <option value="triangle">Triangle</option>
                                    <option value="pentagon">Pentagon</option>
                                    <option value="heart">Heart</option>
                                    <option value="diamond">Diamond</option>
                                    <option value="oval">Oval</option>
                                  </select>
                                ) : gate.criteriaCategory === 'color' ? (
                                  <div className="flex gap-1.5 items-center">
                                    <input
                                      type="text"
                                      value={gate.criteriaValue}
                                      onChange={(e) => {
                                        const updatedGates = selectedShop.orGates!.map(g => g.id === gate.id ? { ...g, criteriaValue: e.target.value } : g);
                                        onUpdateShop(selectedShop.id, { orGates: updatedGates });
                                      }}
                                      className="bg-[#120a05] border border-orange-500/20 rounded px-1.5 py-0.5 text-[10px] text-orange-300 font-mono font-bold focus:outline-none focus:border-orange-400 flex-1 min-w-0"
                                      placeholder="#FF5733"
                                    />
                                    <input
                                      type="color"
                                      value={gate.criteriaValue.startsWith('#') && gate.criteriaValue.length === 7 ? gate.criteriaValue : '#FF5733'}
                                      onChange={(e) => {
                                        const updatedGates = selectedShop.orGates!.map(g => g.id === gate.id ? { ...g, criteriaValue: e.target.value } : g);
                                        onUpdateShop(selectedShop.id, { orGates: updatedGates });
                                      }}
                                      className="w-6 h-5 bg-transparent border-none rounded cursor-pointer shrink-0"
                                    />
                                  </div>
                                ) : gate.criteriaCategory === 'borderSize' ? (
                                  <div className="flex gap-1.5 items-center">
                                    <input
                                      type="range"
                                      min="1"
                                      max="10"
                                      value={isNaN(parseInt(gate.criteriaValue)) ? 2 : parseInt(gate.criteriaValue)}
                                      onChange={(e) => {
                                        const updatedGates = selectedShop.orGates!.map(g => g.id === gate.id ? { ...g, criteriaValue: e.target.value } : g);
                                        onUpdateShop(selectedShop.id, { orGates: updatedGates });
                                      }}
                                      className="flex-1 accent-orange-500 h-1 bg-orange-950 rounded-lg appearance-none cursor-pointer"
                                    />
                                    <span className="text-[10px] font-mono font-bold text-orange-300 shrink-0 w-6 text-right">
                                      {gate.criteriaValue}px
                                    </span>
                                  </div>
                                ) : gate.criteriaCategory === 'width' || gate.criteriaCategory === 'height' ? (
                                  <div className="flex gap-1.5 items-center">
                                    <input
                                      type="range"
                                      min="20"
                                      max="100"
                                      value={isNaN(parseInt(gate.criteriaValue)) ? 50 : parseInt(gate.criteriaValue)}
                                      onChange={(e) => {
                                        const updatedGates = selectedShop.orGates!.map(g => g.id === gate.id ? { ...g, criteriaValue: e.target.value } : g);
                                        onUpdateShop(selectedShop.id, { orGates: updatedGates });
                                      }}
                                      className="flex-1 accent-orange-500 h-1 bg-orange-950 rounded-lg appearance-none cursor-pointer"
                                    />
                                    <span className="text-[10px] font-mono font-bold text-orange-300 shrink-0. w-8 text-right">
                                      {gate.criteriaValue}mm
                                    </span>
                                  </div>
                                ) : (
                                  <input
                                    type="text"
                                    value={gate.criteriaValue}
                                    onChange={(e) => {
                                      const updatedGates = selectedShop.orGates!.map(g => g.id === gate.id ? { ...g, criteriaValue: e.target.value } : g);
                                      onUpdateShop(selectedShop.id, { orGates: updatedGates });
                                    }}
                                    className="bg-[#120a05] border border-orange-500/20 rounded px-1.5 py-0.5 text-[10px] text-[#52d3a3] font-mono font-bold focus:outline-none focus:border-orange-400"
                                    placeholder="e.g. square"
                                  />
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                </div>
              </div>
            </div>
            </>
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
