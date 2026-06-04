/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Sliders, LayoutGrid, Play, Pause, Plus, Minus, Maximize2, 
  HelpCircle, Trash2, ArrowRight, Settings, Info, X, 
  ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCcw, AlertTriangle, MonitorPlay,
  GripVertical
} from 'lucide-react';
import { ShopTopology, PartFlowItem } from '../types';

interface SimulationPanelProps {
  shops: ShopTopology[];
  onNavigate: (step: 'configuration' | 'layout' | 'simulation') => void;
  onUpdateShop: (id: number, updatedFields: Partial<ShopTopology>) => void;
}

interface SimulatedShopState {
  id: number;
  currentCountdown: number;
  parts: PartFlowItem[];
  connections: number[];
}

interface FlyingPart {
  id: string;
  shape: 'pentagon' | 'heart' | 'square' | 'triangle' | 'diamond' | 'oval';
  color: string;
  fromId: number;
  toId: number | 'conveyor';
  progress: number; // 0 to 100
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export default function SimulationPanel({
  shops,
  onNavigate,
  onUpdateShop
}: SimulationPanelProps) {
  // Find the single final shop of the line (highest ID or successor 'None')
  const finalShopId = React.useMemo(() => {
    if (shops.length === 0) return 4;
    const noneSuccessor = shops.find(s => s.successor === 'None');
    if (noneSuccessor) return noneSuccessor.id;
    return Math.max(...shops.map(s => s.id));
  }, [shops]);

  // Dynamic pixel dimensions helper based on real-time layout width/height
  const getShopWidthPx = (s: ShopTopology) => Math.max(160, s.width * 6.5);
  const getShopHeightPx = (s: ShopTopology) => Math.max(120, s.height * 6.5);

  // --- Animation and Drag-Pan State ---
  const [isSimRunning, setIsSimRunning] = useState<boolean>(true);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [panX, setPanX] = useState<number>(0);
  const [panY, setPanY] = useState<number>(0);

  // Timer and simulation clock speed controls
  const [simSpeed, setSimSpeed] = useState<number>(1.0);
  const [simulatedElapsed, setSimulatedElapsed] = useState<number>(0);
  const [showTimerPopup, setShowTimerPopup] = useState<boolean>(true);
  const [speedPage, setSpeedPage] = useState<number>(1);

  // Automatic Simulation target completion clock speeds
  const [targetEndMode, setTargetEndMode] = useState<string>('manual');
  const [customTargetSeconds, setCustomTargetSeconds] = useState<number>(300);
  const [targetRealRemaining, setTargetRealRemaining] = useState<number | null>(null);

  // Draggable position coordinates for the floating Timer & Speed popup
  const [popupPos, setPopupPos] = useState({ x: 100, y: 50 }); // initial top / left coordinates
  const [isDraggingPopup, setIsDraggingPopup] = useState(false);
  const dragPopupStart = useRef({ x: 0, y: 0 });
  const popupOffsetStart = useRef({ x: 100, y: 50 });

  useEffect(() => {
    if (!isDraggingPopup) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragPopupStart.current.x;
      const dy = e.clientY - dragPopupStart.current.y;
      
      const newX = popupOffsetStart.current.x + dx;
      const newY = popupOffsetStart.current.y + dy;
      
      // Keep it reasonably inside the window borders
      const boundedX = Math.max(10, Math.min(window.innerWidth - 360, newX));
      const boundedY = Math.max(10, Math.min(window.innerHeight - 340, newY));
      
      setPopupPos({ x: boundedX, y: boundedY });
    };

    const handleMouseUp = () => {
      setIsDraggingPopup(false);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingPopup]);

  const handlePopupMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    setIsDraggingPopup(true);
    dragPopupStart.current = { x: e.clientX, y: e.clientY };
    popupOffsetStart.current = { ...popupPos };
    e.preventDefault();
  };

  // Formats elapsed simulated clock seconds to hours, minutes, seconds and decimals
  const formatTime = (secs: number) => {
    const hours = Math.floor(secs / 3600);
    const minutes = Math.floor((secs % 3600) / 60);
    const seconds = Math.floor(secs % 60);
    const milliseconds = Math.floor((secs % 1) * 10);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds}`;
  };

  const formatSecondsToHMS = (totalSeconds: number): string => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = Math.floor(totalSeconds % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };
  
  // Localized Simulation queues and countdowns in an atomic single state
  const [simState, setSimState] = useState<{
    simShops: SimulatedShopState[];
    flyingParts: FlyingPart[];
    processedCounts: { [shopId: number]: number };
  }>({ simShops: [], flyingParts: [], processedCounts: {} });

  const { simShops, flyingParts, processedCounts } = simState;

  const [avgCycleTime, setAvgCycleTime] = useState<number>(14.3);
  
  // Interactive Connector overlays
  const [activeSourceId, setActiveSourceId] = useState<number | null>(null);
  const [activeTargetId, setActiveTargetId] = useState<number | 'conveyor'>('conveyor');
  const [showConnectorModal, setShowConnectorModal] = useState<boolean>(false);

  // Buffer Overrides (Synced from sidebar panel)
  const [localBuffers, setLocalBuffers] = useState<{ [key: number]: number }>({});

  const canvasRef = useRef<HTMLDivElement>(null);
  const isPanningRef = useRef<boolean>(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const isDraggingCardRef = useRef<number | null>(null);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const cardStartRef = useRef({ x: 0, y: 0 });
  const shopsRef = useRef(shops);
  const zoomLevelRef = useRef(zoomLevel);
  const lastStationsRef = useRef<{ [shopId: number]: number }>({});
  const partCounterRef = useRef<number>(1);

  useEffect(() => {
    shopsRef.current = shops;
  }, [shops]);

  useEffect(() => {
    zoomLevelRef.current = zoomLevel;
  }, [zoomLevel]);

  // Constants
  const shapes: Array<'pentagon' | 'heart' | 'square' | 'triangle' | 'diamond' | 'oval'> = [
    'pentagon', 'heart', 'square', 'triangle', 'diamond', 'oval'
  ];
  const colors = [
    'bg-[#4b8eff]', 'bg-[#b7c8e1]', 'bg-[#ffb595]', 'bg-[#adc6ff]', 'bg-[#eb9e34]', 'bg-[#ef6719]'
  ];
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  // Synchronize and reconcile simulated shops when layout parameters change
  useEffect(() => {
    setSimState(prev => {
      const hasExistingShops = prev.simShops.length > 0;

      const initialized = shops.map((s, idx) => {
        const existing = prev.simShops.find(ss => ss.id === s.id);

        // Establish logical pipelines defaulted to numerical sequence, or derived from selected successor
        let connections: number[] = [];
        const matchShop = shops.find(target => target.name.trim().toLowerCase() === s.successor.trim().toLowerCase());
        if (matchShop) {
          connections.push(matchShop.id);
        } else {
          const match = s.successor.match(/\d+/);
          if (match) {
            connections.push(parseInt(match[0]));
          }
        }

        const prevStationCount = lastStationsRef.current[s.id];
        const stationsChanged = prevStationCount === undefined || prevStationCount !== s.stations;

        if (existing) {
          // Adjust parts to match the stations parameter of each shop only if stations attribute has changed
          let reconciledParts = [...existing.parts];
          if (stationsChanged) {
            if (reconciledParts.length < s.stations) {
              const diff = s.stations - reconciledParts.length;
              for (let p = 0; p < diff; p++) {
                reconciledParts.push(generatePart());
              }
            } else if (reconciledParts.length > s.stations) {
              reconciledParts = reconciledParts.slice(0, s.stations);
            }
          }

          return {
            ...existing,
            parts: reconciledParts,
            connections
          };
        } else {
          // Initialize exactly s.stations parts
          const initialParts: PartFlowItem[] = [];
          for (let p = 0; p < s.stations; p++) {
            initialParts.push(generatePart());
          }

          return {
            id: s.id,
            currentCountdown: s.cycleTime,
            parts: initialParts,
            connections
          };
        }
      });

      // Filter out deleted shops
      const validShopIds = new Set(shops.map(s => s.id));
      const filteredSimShops = initialized.filter(ss => validShopIds.has(ss.id));

      // Update the last known stations ref
      shops.forEach(s => {
        lastStationsRef.current[s.id] = s.stations;
      });

      return {
        ...prev,
        simShops: filteredSimShops
      };
    });

    // Populate buffers if they haven't been initialized yet
    setLocalBuffers(prev => {
      const nextBuf = { ...prev };
      shops.forEach(s => {
        if (nextBuf[s.id] === undefined) {
          nextBuf[s.id] = s.bufferSize;
        }
      });
      return nextBuf;
    });
  }, [shops]);

  // Generate random piece identifier
  const generatePart = (): PartFlowItem => {
    const shape = shapes[Math.floor(Math.random() * shapes.length)];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const idVal = partCounterRef.current++;
    return { id: `Part #${idVal}`, shape, color };
  };

  // Render miniature geometric structures based on clip-paths
  const renderClipShape = (shape: string, color: string) => {
    const commonClasses = "w-5 h-5 flex items-center justify-center shrink-0 shadow-md";
    switch (shape) {
      case 'pentagon':
        return (
          <div 
            className={`${commonClasses} ${color}`}
            style={{ clipPath: 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)' }}
          />
        );
      case 'heart':
        return (
          <div 
            className={`${commonClasses} ${color}`}
            style={{ clipPath: 'polygon(50% 15%, 80% 0%, 100% 30%, 50% 90%, 0% 30%, 20% 0%)' }}
            // Fallback for extreme hearts
          />
        );
      case 'triangle':
        return (
          <div 
            className={`${commonClasses} ${color}`}
            style={{ clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)' }}
          />
        );
      case 'diamond':
        return (
          <div 
            className={`${commonClasses} ${color}`}
            style={{ clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }}
          />
        );
      case 'oval':
        return (
          <div className={`${commonClasses} ${color} rounded-full`} />
        );
      default: // square
        return (
          <div className={`${commonClasses} ${color} rounded-sm`} />
        );
    }
  };

  // --- Zoom Controllers ---
  const handleZoomIn = () => setZoomLevel(prev => Math.min(2.0, prev + 0.1));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(0.5, prev - 0.1));
  const handleZoomReset = () => {
    setZoomLevel(1);
    setPanX(0);
    setPanY(0);
  };

  // --- Pan Logic ---
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (isDraggingCardRef.current !== null) return;
    
    // Check if target is background or canvas
    const target = e.target as HTMLElement;
    if (target.id === 'main-canvas' || target.id === 'viewport-grid' || target.id === 'svg-canvas') {
      isPanningRef.current = true;
      panStartRef.current = { x: e.clientX - panX, y: e.clientY - panY };
    }
  };

  const handleGlobalMouseMove = (e: MouseEvent) => {
    if (isPanningRef.current) {
      setPanX(e.clientX - panStartRef.current.x);
      setPanY(Math.min(0, e.clientY - panStartRef.current.y));
    } else if (isDraggingCardRef.current !== null) {
      const activeCardId = isDraggingCardRef.current;
      // Calculate coordinate changes relative to active zoom level from initial click down
      const dx = (e.clientX - dragStartRef.current.x) / zoomLevelRef.current;
      const dy = (e.clientY - dragStartRef.current.y) / zoomLevelRef.current;
      
      onUpdateShop(activeCardId, {
        posX: Math.max(0, cardStartRef.current.x + dx),
        posY: Math.max(80, cardStartRef.current.y + dy)
      });
    }
  };

  const handleGlobalMouseUp = () => {
    isPanningRef.current = false;
    isDraggingCardRef.current = null;
  };

  useEffect(() => {
    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, []);

  // --- Draggable Card Trigger ---
  const handleCardHeaderMouseDown = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    isDraggingCardRef.current = id;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    
    const shop = shopsRef.current.find(s => s.id === id);
    if (shop) {
      cardStartRef.current = { x: shop.posX, y: shop.posY };
    }
  };

  const getSuccessorPathTime = (shopId: number): number => {
    let totalTime = 0;
    let currentId = shopId;
    const visited = new Set<number>();
    
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const currentShop = shops.find(s => s.id === currentId);
      if (!currentShop) break;
      
      // Look for next shop in routing
      const matchShop = shops.find(target => target.name.trim().toLowerCase() === currentShop.successor.trim().toLowerCase());
      if (matchShop) {
        currentId = matchShop.id;
        // Each transition takes virtual transit flight time (approx 1.67 seconds) + cycle time
        totalTime += matchShop.cycleTime + 1.67;
      } else {
        const match = currentShop.successor.match(/\d+/);
        if (match) {
          const nextTargetId = parseInt(match[0]);
          const nextShop = shops.find(target => target.id === nextTargetId);
          if (nextShop) {
            currentId = nextTargetId;
            totalTime += nextShop.cycleTime + 1.67;
          } else {
            break;
          }
        } else {
          break;
        }
      }
    }
    return totalTime;
  };

  const calculateRemainingVirtualTime = (simShopsList: SimulatedShopState[], flyingPartsList: FlyingPart[]): number => {
    let maxTime = 0;
    
    // Check shop states workload
    simShopsList.forEach(ss => {
      const original = shops.find(o => o.id === ss.id);
      if (!original) return;
      
      const nParts = ss.parts.length;
      if (nParts === 0) return;
      
      const downstreamTime = getSuccessorPathTime(ss.id);
      // Formula: the active countdown + (N-1) * cycleTime + downstream time and flight times to completely exit
      const shopTime = ss.currentCountdown + Math.max(0, nParts - 1) * original.cycleTime + downstreamTime;
      if (shopTime > maxTime) {
        maxTime = shopTime;
      }
    });
    
    // Check active flying parts workload
    flyingPartsList.forEach(fp => {
      let downstreamTime = 0;
      if (fp.toId !== 'conveyor') {
        const targetShop = shops.find(s => s.id === fp.toId);
        if (targetShop) {
          downstreamTime = targetShop.cycleTime + getSuccessorPathTime(targetShop.id);
        }
      }
      
      const remainingProgressFrac = Math.max(0, 100 - fp.progress) / 100;
      const travelTime = remainingProgressFrac * 1.67; // 100 progress takes exactly 1.67 seconds in virtual time
      const partTime = travelTime + downstreamTime;
      if (partTime > maxTime) {
        maxTime = partTime;
      }
    });
    
    return maxTime;
  };

  // Automatic Simulation Target Timer synchronizer (keeps the target countdown but does not alter speed)
  useEffect(() => {
    if (targetEndMode === 'manual') {
      setTargetRealRemaining(null);
    } else {
      let limitSecs = 30;
      if (targetEndMode === '30s') limitSecs = 30;
      else if (targetEndMode === '1m') limitSecs = 60;
      else if (targetEndMode === '2m') limitSecs = 120;
      else if (targetEndMode === '5m') limitSecs = 300;
      else if (targetEndMode === '10m') limitSecs = 600;
      else if (targetEndMode === '1h') limitSecs = 3600;
      else if (targetEndMode === 'custom') limitSecs = customTargetSeconds;

      setTargetRealRemaining(limitSecs);
    }
  }, [targetEndMode, customTargetSeconds]);

  // --- Simulated Cycle Updates (100ms interval) ---
  useEffect(() => {
    if (!isSimRunning) return;

    const interval = setInterval(() => {
      let currentSpeed = simSpeed;

      // Update remaining real-time target countdown timer
      if (targetEndMode !== 'manual') {
        setTargetRealRemaining(prevRem => {
          if (prevRem === null || prevRem <= 0) return 0;
          const nextRem = prevRem - 0.1;
          if (nextRem <= 0) {
            // Stop simulation when target time is reached
            setIsSimRunning(false);
            return 0;
          }
          return nextRem;
        });
      }

      setSimState(prev => {
        // Deep clone to prevent direct state mutation issues and duplicate parts multiplication
        let nextSimShops: SimulatedShopState[] = prev.simShops.map(ss => ({
          ...ss,
          parts: ss.parts.map(p => ({ ...p })),
          connections: [...ss.connections]
        }));

        // Apply updated countdown ticks with currentSpeed
        nextSimShops = nextSimShops.map(ss => {
          const original = shops.find(o => o.id === ss.id);
          if (!original) return ss;

          const hasJobsReady = ss.parts.length > 0;

          if (hasJobsReady) {
            const nextCountdown = ss.currentCountdown - 0.1 * currentSpeed;
            if (nextCountdown <= 0) {
              return {
                ...ss,
                currentCountdown: original.cycleTime,
                _cycleCompleted: true
              };
            }
            return {
              ...ss,
              currentCountdown: nextCountdown
            };
          } else {
            // Cycle time doesn't run down if nothing is present in the shop
            return {
              ...ss,
              currentCountdown: original.cycleTime
            };
          }
        });

        // Collect new flying parts from completed cycles inside the SAME transition
        const newFlyingParts: FlyingPart[] = [];
        const nextProcessedCounts = { ...prev.processedCounts };
        nextSimShops = nextSimShops.map(ss => {
          if ((ss as any)._cycleCompleted) {
            delete (ss as any)._cycleCompleted;

            // Increment processed count for this shop
            nextProcessedCounts[ss.id] = (nextProcessedCounts[ss.id] || 0) + 1;

            const original = shops.find(o => o.id === ss.id);
            if (!original) return ss;

            // Atomically shift part from the shop's queue (pure operation)
            const updatedParts = [...ss.parts];
            const partToTransit = updatedParts.shift() || null;
            ss.parts = updatedParts;

            if (partToTransit) {
              const startX = original.posX + getShopWidthPx(original) / 2;
              const startY = original.posY + getShopHeightPx(original) / 2;

              if (ss.connections.length > 0) {
                const targetId = ss.connections[0];
                const targetShop = shops.find(t => t.id === targetId);
                if (targetShop) {
                  const endX = targetShop.posX + getShopWidthPx(targetShop) / 2;
                  const endY = targetShop.posY + getShopHeightPx(targetShop) / 2;

                  newFlyingParts.push({
                    ...partToTransit,
                    fromId: ss.id,
                    toId: targetId,
                    progress: 0,
                    startX,
                    startY,
                    endX,
                    endY
                  });
                }
              } else if (ss.id === finalShopId) {
                newFlyingParts.push({
                  ...partToTransit,
                  fromId: ss.id,
                  toId: 'conveyor',
                  progress: 0,
                  startX,
                  startY,
                  endX: startX, // aligned with the shop center
                  endY: 68 // directly below the final production line
                });
              }
            }
          }
          return ss;
        });

        // 2. Increment active flying parts transit pathways and deliver atomically with currentSpeed
        const remainingFlyingParts: FlyingPart[] = [];
        prev.flyingParts.forEach(fp => {
          const nextProgress = fp.progress + 6 * currentSpeed;
          if (nextProgress >= 100) {
            if (fp.toId !== 'conveyor') {
              const targetShop = nextSimShops.find(cs => cs.id === fp.toId);
              if (targetShop) {
                const limit = localBuffers[fp.toId as number] !== undefined ? localBuffers[fp.toId as number] : (shops.find(s => s.id === fp.toId)?.bufferSize || 20);
                if (Math.max(0, targetShop.parts.length - 1) < limit) {
                  targetShop.parts.push({ id: fp.id, shape: fp.shape, color: fp.color });
                }
              }
            }
          } else {
            remainingFlyingParts.push({
              ...fp,
              progress: nextProgress
            });
          }
        });

        return {
          simShops: nextSimShops,
          flyingParts: [...remainingFlyingParts, ...newFlyingParts],
          processedCounts: nextProcessedCounts
        };
      });

      // Increment elapsed simulation time according to speed rate
      setSimulatedElapsed(prev => prev + 0.1 * currentSpeed);

      // Update telemetry cycle metrics
      const averageTime = shops.reduce((acc, curr) => acc + curr.cycleTime, 0) / shops.length;
      setAvgCycleTime(parseFloat(averageTime.toFixed(1)));

    }, 100);

    return () => clearInterval(interval);
  }, [isSimRunning, shops, localBuffers, simSpeed, targetEndMode, targetRealRemaining]);

  // Auto-stop simulation when all stations/parts are fully processed
  useEffect(() => {
    if (!isSimRunning) return;
    const hasShops = simShops.length > 0;
    const allCompleted = hasShops && simShops.every(ss => ss.parts.length === 0) && flyingParts.length === 0;
    if (allCompleted) {
      setIsSimRunning(false);
    }
  }, [simShops, flyingParts, isSimRunning]);

  // --- Inline Flow Connection creator ---
  const handleAddPathwayClick = (e: React.MouseEvent, sourceId: number) => {
    e.stopPropagation();
    setActiveSourceId(sourceId);
    
    // Choose sensible destination candidates that are after the source shop
    const options = shops.filter(s => s.id > sourceId);
    if (options.length > 0) {
      setActiveTargetId(options[0].id);
    } else {
      setActiveTargetId('conveyor');
    }
    
    setShowConnectorModal(true);
  };

  const handleConfirmPathway = () => {
    if (activeSourceId === null) return;
    
    setSimState(prev => {
      const nextSimShops = prev.simShops.map(cs => {
        if (cs.id === activeSourceId) {
          // Clear connection if targeting conveyor, otherwise set successor
          const freshCons = activeTargetId === 'conveyor' ? [] : [activeTargetId as number];
          return {
            ...cs,
            connections: freshCons // Single target pipeline model
          };
        }
        return cs;
      });
      return { ...prev, simShops: nextSimShops };
    });

    setShowConnectorModal(false);
  };

  const handleDisconnectLine = (fromId: number, toId: number) => {
    setSimState(prev => {
      const nextSimShops = prev.simShops.map(cs => {
        if (cs.id === fromId) {
          return {
            ...cs,
            connections: cs.connections.filter(c => c !== toId)
          };
        }
        return cs;
      });
      return { ...prev, simShops: nextSimShops };
    });
  };

  // Helper to manually inject parts into any shop
  const handleAddPartToShop = (shopId: number) => {
    setSimState(prev => {
      const nextSimShops = prev.simShops.map(cs => {
        if (cs.id === shopId) {
          const limit = localBuffers[cs.id] !== undefined ? localBuffers[cs.id] : (shops.find(s => s.id === cs.id)?.bufferSize || 20);
          if (Math.max(0, cs.parts.length - 1) < limit) {
            return {
              ...cs,
              parts: [...cs.parts, generatePart()]
            };
          }
        }
        return cs;
      });
      return { ...prev, simShops: nextSimShops };
    });
  };

  // --- Sidebar live buffer modifier ---
  const handleModifyBuffer = (shopId: number, amount: number) => {
    setLocalBuffers(prev => {
      const current = prev[shopId] !== undefined ? prev[shopId] : 20;
      return {
        ...prev,
        [shopId]: Math.max(1, Math.min(99, current + amount))
      };
    });
  };

  return (
    <div className="flex flex-1 overflow-hidden h-full">
      {/* Sidebar navigation and buffer modifier */}
      <aside className="w-64 border-r border-outline-variant flex flex-col bg-surface-container-low p-4 gap-6 shrink-0 justify-between select-none z-10">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-widest text-on-surface-variant opacity-70 mb-3">System Controls</p>
          <ul className="space-y-1">
            <li>
              <button 
                type="button"
                onClick={() => onNavigate('configuration')}
                className="w-full flex items-center gap-3 px-4 py-3 rounded text-on-surface-variant hover:bg-surface-container-high transition-all cursor-pointer text-left font-mono text-[11px] uppercase tracking-widest"
              >
                <Sliders className="w-4 h-4 text-on-surface-variant" />
                <span>Configuration</span>
              </button>
            </li>
            <li>
              <button 
                type="button"
                onClick={() => onNavigate('layout')}
                className="w-full flex items-center gap-3 px-4 py-3 rounded text-on-surface-variant hover:bg-surface-container-high transition-all cursor-pointer text-left font-mono text-[11px] uppercase tracking-widest"
              >
                <LayoutGrid className="w-4 h-4 text-on-surface-variant" />
                <span>Layout</span>
              </button>
            </li>
            <li>
              <div className="w-full flex items-center gap-3 px-4 py-3 bg-surface-container-highest text-primary border-l-2 border-primary rounded font-mono text-[11px] uppercase tracking-widest font-bold">
                <Play className="w-4 h-4 text-primary" />
                <span>Simulation</span>
              </div>
            </li>
          </ul>

          {/* Buffer Capacity Syncer */}
          <div className="mt-8 border-t border-outline-variant/30 pt-6">
            <p className="font-mono text-[9px] uppercase tracking-widest text-[#8e909a] mb-4 font-bold">Buffer Configuration</p>
            <div className="space-y-4">
              {shops.map(shop => {
                const currentBuf = localBuffers[shop.id] !== undefined ? localBuffers[shop.id] : shop.bufferSize;
                return (
                  <div key={shop.id} className="flex items-center justify-between px-2">
                    <label className="text-[11px] font-mono uppercase font-bold text-on-surface-variant opacity-80">{shop.name}</label>
                    <div className="flex items-center bg-surface-container-highest rounded border border-outline-variant overflow-hidden">
                      <button 
                        type="button"
                        onClick={() => handleModifyBuffer(shop.id, -1)}
                        className="px-2.5 py-1 hover:bg-[#adc6ff]/20 text-[#adc6ff] border-r border-outline-variant cursor-pointer"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <input 
                        type="text" 
                        value={currentBuf} 
                        readOnly
                        className="w-10 bg-transparent border-none text-center font-mono text-[11px] text-primary focus:ring-0 p-0" 
                      />
                      <button 
                        type="button"
                        onClick={() => handleModifyBuffer(shop.id, 1)}
                        className="px-2.5 py-1 hover:bg-[#adc6ff]/20 text-[#adc6ff] border-l border-outline-variant cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sidebar Footer Indicators */}
        <div className="pt-4 border-t border-outline-variant/30 px-2">
          <span className="font-mono text-[9px] uppercase tracking-wider text-on-surface-variant opacity-50 block mb-1">System Pipeline</span>
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${isSimRunning ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            <span className="text-xs text-on-surface font-mono uppercase tracking-tight">{isSimRunning ? 'Clock Synchronized' : 'Clock Suspended'}</span>
          </div>
        </div>
      </aside>

      {/* Vertical workspace framework anchoring footer to the screen bottom */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Main Draggable Map Canvas Grid */}
        <main 
          ref={canvasRef}
        id="main-canvas"
        className={`flex-1 relative overflow-hidden bg-[#0b1326] bg-grid-dots transition-all ${isPanningRef.current ? 'cursor-grabbing' : 'cursor-grab'}`}
        onMouseDown={handleCanvasMouseDown}
      >
        {/* Holographic Canvas HUD overlays */}
        <div 
          id="viewport-grid"
          className="absolute origin-top-left"
          style={{
            width: '5000px',
            height: '4000px',
            transform: `translate(${panX}px, ${panY}px) scale(${zoomLevel})`,
            pointerEvents: 'auto'
          }}
        >
          {/* SVG Vector Connections Cable Overlay */}
          <svg 
            id="svg-canvas"
            className="absolute top-0 left-0 w-full h-full pointer-events-none"
            style={{ zIndex: 1 }}
          >
            <defs>
              <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="5" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8 Z" fill="#adc6ff" />
              </marker>
              <marker id="arrowhead-outbound" markerWidth="8" markerHeight="8" refX="5" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8 Z" fill="#ffb595" />
              </marker>
            </defs>

            {/* Render dynamically computing cables */}
            {simShops.map(ss => {
              const currentShop = shops.find(s => s.id === ss.id);
              if (!currentShop) return null;

              return ss.connections.map(targetId => {
                const targetShop = shops.find(t => t.id === targetId);
                if (!targetShop) return null;

                // Center point coordinates calculation
                const x1 = currentShop.posX + getShopWidthPx(currentShop) / 2;
                const y1 = currentShop.posY + getShopHeightPx(currentShop) / 2;
                const x2 = targetShop.posX + getShopWidthPx(targetShop) / 2;
                const y2 = targetShop.posY + getShopHeightPx(targetShop) / 2;

                // Create nice curved control points
                const cx1 = x1;
                const cy1 = y1 + (y2 - y1) / 2;
                const cx2 = x2;
                const cy2 = y1 + (y2 - y1) / 2;

                return (
                  <g key={`${ss.id}-${targetId}`}>
                    {/* Background interactive hover trigger */}
                    <path
                      d={`M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`}
                      className="fill-none stroke-current text-transparent stroke-[12] cursor-pointer pointer-events-auto"
                      title="Click connection to delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        // Delete line
                        handleDisconnectLine(ss.id, targetId);
                      }}
                    />
                    {/* Decorative active dash pathway line */}
                    <path
                      d={`M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`}
                      className="fill-none stroke-[#adc6ff] stroke-[2] animate-flow-dash stroke-[dasharray:10_5] opacity-80"
                      markerEnd="url(#arrowhead)"
                    />
                  </g>
                );
              });
            })}

            {/* Outbound static arrow vector of final node (Only from the final shop to return belt) */}
            {shops.map(s => {
              if (s.id === finalShopId) {
                const xStart = s.posX + getShopWidthPx(s) / 2;
                const yStart = s.posY;
                return (
                  <path
                    key={`outbound-line-${s.id}`}
                    d={`M ${xStart} ${yStart} L ${xStart} 68`}
                    className="fill-none stroke-[#ffb595] stroke-[2] animate-flow-dash stroke-[dasharray:8_4] opacity-80"
                    markerEnd="url(#arrowhead-outbound)"
                  />
                );
              }
              return null;
            })}
          </svg>

          {/* Outbound Top Decorative Conveyor Belt */}
          <div 
            id="outbound-target-belt"
            className="absolute top-10 left-16 w-[1240px] h-7 bg-primary/5 border-y border-primary/25 overflow-hidden z-0 rounded-sm"
          >
            {/* Moving marquee indicators */}
            <div className="h-full w-full bg-[repeating-linear-gradient(90deg,transparent,transparent_30px,rgba(173,198,255,0.06)_30px,rgba(173,198,255,0.06)_60px)] animate-marquee-belt" />
            <div className="absolute inset-0 flex items-center justify-end px-6 pointer-events-none select-none">
              <span className="font-mono text-[9px] uppercase tracking-widest text-[#ffb595]/50 font-bold">OUTBOUND EXPORT TERMINAL &gt;&gt;</span>
            </div>
          </div>

          {/* Active shop modular panels */}
          {shops.map((shop, shopIdx) => {
            const ssState = simShops.find(ss => ss.id === shop.id);
            const currentParts = ssState ? ssState.parts : [];
            const isFull = Math.max(0, currentParts.length - 1) >= (localBuffers[shop.id] || shop.bufferSize);

            // Fetch running timer details
            const secsRemaining = ssState ? Math.max(0, Math.ceil(ssState.currentCountdown)) : shop.cycleTime;
            const progressRatio = ssState ? (ssState.currentCountdown / shop.cycleTime) * 100 : 100;

            return (
              <article
                key={shop.id}
                id={`panel-${shop.id}`}
                className={`shop-panel absolute bg-[#171f33] border border-outline-variant rounded shadow-2xl flex flex-col overflow-hidden select-none z-20 hover:border-primary/50 transition-colors`}
                style={{
                  top: `${shop.posY}px`,
                  left: `${shop.posX}px`,
                  width: `${getShopWidthPx(shop)}px`,
                  height: `${getShopHeightPx(shop)}px`,
                  boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
                }}
              >
                {/* Grab Handle Header */}
                <header 
                  className="px-4 py-2 bg-[#222a3d] border-b border-outline-variant flex justify-between items-center cursor-grab active:cursor-grabbing select-none"
                  onMouseDown={(e) => handleCardHeaderMouseDown(e, shop.id)}
                >
                  <h3 className="font-mono uppercase font-bold text-[10px] tracking-wider select-none text-on-surface-variant">
                    {shop.name}
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-on-surface-variant opacity-75 mr-1">
                      [{Math.max(0, currentParts.length - 1)}/{localBuffers[shop.id] || shop.bufferSize}]
                    </span>
                    
                    {/* Add Part Button */}
                    <button 
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddPartToShop(shop.id);
                      }}
                      className="w-5.5 h-5.5 flex items-center justify-center rounded bg-emerald-500/10 hover:bg-emerald-500/25 text-emerald-400 transition-all cursor-pointer"
                      title="Add Part / Job"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>


                    
                    <div className="w-1.5 h-1.5 rounded-full bg-outline-variant/40" />
                  </div>
                </header>

                {/* Telemetry quick stats bar for processed items and stations left */}
                <div className="px-4 py-2 bg-black/40 border-b border-outline-variant/30 flex flex-col gap-1 text-[9px] font-mono text-on-surface-variant uppercase select-none tracking-wider font-bold">
                  <div className="flex items-center justify-between">
                    <span className="opacity-70">Processed Count</span>
                    <span className="text-emerald-400 font-extrabold">{processedCounts[shop.id] || 0} items</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-outline-variant/15 pt-1">
                    <span className="opacity-70">Stations Left</span>
                    <span className="text-sky-400 font-extrabold">{currentParts.length}</span>
                  </div>
                </div>

                {/* Queue box body with titles: Processing and Buffer Queue */}
                <div className="flex-1 p-3 flex flex-col gap-3 overflow-y-auto relative bg-surface-container-low/30 scrollbar-thin scrollbar-thumb-outline-variant text-left">
                  
                  {/* Processing Section */}
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <span className="font-mono text-[8px] uppercase tracking-wider text-[#adc6ff] font-bold opacity-80 select-none">
                      Processing
                    </span>
                    <div className="flex flex-col gap-1.5">
                      {(() => {
                        const part = currentParts[0];
                        const isBusy = !!part;
                        
                        // Deterministic station name A1 to A100 then B1
                        const group = Math.floor(shopIdx / 100);
                        const letter = String.fromCharCode(65 + Math.min(25, group));
                        const num = (shopIdx % 100) + 1;
                        const stationName = `${letter}${num}`;

                        // Display the active piece shape/color when busy, or standard square when idle
                        const shapeToRender = isBusy ? part.shape : 'square';
                        const colorToRender = isBusy ? part.color : 'bg-slate-700/30 text-slate-500/50';

                        const colorsList = [
                          'text-red-400', 'text-amber-400', 'text-emerald-400', 'text-cyan-400',
                          'text-sky-400', 'text-indigo-400', 'text-purple-400', 'text-rose-400',
                          'text-teal-400', 'text-orange-400', 'text-fuchsia-400', 'text-lime-400'
                        ];
                        const chosenTextColor = colorsList[shopIdx % colorsList.length];

                        return (
                          <div 
                            key={stationName}
                            className={`p-1.5 border rounded flex items-center justify-between gap-1.5 transition-all text-[9.5px] font-mono ${
                              isBusy 
                                ? 'bg-primary/10 border-primary/45 shadow-sm' 
                                : 'bg-black/10 border-outline-variant/15 text-on-surface-variant/30'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 truncate w-full">
                              {/* Station geometric shape indicator */}
                              <div className="scale-75 shrink-0">
                                {renderClipShape(shapeToRender, colorToRender)}
                              </div>
                              <span className={`font-bold shrink-0 ${isBusy ? chosenTextColor : 'opacity-35'}`}>
                                {stationName}
                              </span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Divider line style */}
                  <div className="w-full border-t border-outline-variant/20 my-0.5 shrink-0" />

                   {/* Buffer Queue Section */}
                  <div className="flex-1 flex flex-col gap-1.5 min-h-[55px]">
                    <span className="font-mono text-[8px] uppercase tracking-wider text-on-surface-variant font-bold opacity-60 select-none">
                      Buffer Queue ({Math.max(0, currentParts.length - 1)} waiting)
                    </span>
                    {currentParts.length <= 1 ? (
                      <div className="flex-1 flex items-center justify-center text-center text-on-surface-variant text-[9px] font-mono opacity-40 select-none uppercase tracking-tight py-3 border border-dashed border-outline-variant/25 rounded bg-black/5">
                        [EMPTY]
                      </div>
                    ) : (
                      <div className="grid grid-cols-4 gap-1.5 w-full font-mono">
                        {currentParts.slice(1).map((part, pidx) => (
                          <div 
                            key={`${part.id}-${pidx}`}
                            className="bg-surface-container-lowest border border-outline-variant/60 rounded p-1 flex flex-col items-center justify-center gap-1 transition-all duration-300 transform scale-95"
                          >
                            {renderClipShape(part.shape, part.color)}
                            <span className="font-mono text-[8px] uppercase font-bold text-primary">{part.id}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Warning: Queue Overflowing */}
                  {isFull && (
                    <div className="absolute top-1 right-1 bg-red-500/15 border border-red-500/30 text-amber-500 rounded p-1" title="Buffer Limit Reached">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 animate-bounce" />
                    </div>
                  )}
                </div>

                 {/* Timeline / Cycle Ticker Footer */}
                <footer className="px-4 py-2.5 bg-[#222a3d] border-t border-outline-variant/60 flex items-center justify-between gap-2.5">
                  <div className="flex items-center gap-1.5 shrink-0 select-none">
                    <div className={`w-2 h-2 rounded-full ${isSimRunning && currentParts.length > 0 ? 'bg-primary animate-pulse' : 'bg-outline-variant opacity-50'}`} />
                    <span className="text-primary font-mono font-bold text-[10.5px]" title="Time left for the current part">
                      {formatSecondsToHMS(secsRemaining)}
                    </span>
                  </div>

                  <div className="flex-1 h-1 bg-surface-container rounded-full overflow-hidden min-w-[30px]">
                    <div 
                      className="h-full bg-primary transition-all duration-100 ease-linear"
                      style={{ width: `${progressRatio}%` }}
                    />
                  </div>

                  <span className="font-mono text-[9px] text-[#8e909a] font-bold select-none shrink-0" title="Total processed cycle time">
                    {formatSecondsToHMS(shop.cycleTime)}
                  </span>
                </footer>
              </article>
            );
          })}

          {/* Active flying components on coordinates */}
          {flyingParts.map(fp => {
            let currentX = fp.startX;
            let currentY = fp.startY;

            if (fp.toId === 'conveyor') {
              // Straight line logic for final outbound conveyor
              currentX = fp.startX + (fp.endX - fp.startX) * (fp.progress / 100);
              currentY = fp.startY + (fp.endY - fp.startY) * (fp.progress / 100);
            } else {
              // Cubic Bezier curve formula so parts follow the conveyor belt paths exactly
              const t = fp.progress / 100;
              const mt = 1 - t;
              
              const mt3 = mt * mt * mt;
              const mt2t = 3 * mt * mt * t;
              const mtt2 = 3 * mt * t * t;
              const t3 = t * t * t;

              // Cubic Bezier control points match the SVG drawn path perfectly
              const cx1 = fp.startX;
              const cy1 = fp.startY + (fp.endY - fp.startY) / 2;
              const cx2 = fp.endX;
              const cy2 = fp.startY + (fp.endY - fp.startY) / 2;

              currentX = mt3 * fp.startX + mt2t * cx1 + mtt2 * cx2 + t3 * fp.endX;
              currentY = mt3 * fp.startY + mt2t * cy1 + mtt2 * cy2 + t3 * fp.endY;
            }

            return (
              <div 
                key={fp.id}
                className="absolute z-50 flex items-center justify-center"
                style={{
                  left: `${currentX}px`,
                  top: `${currentY}px`,
                  transform: 'translate(-50%, -50%)',
                  pointerEvents: 'none'
                }}
              >
                <div className="relative animate-pulse">
                  {renderClipShape(fp.shape, fp.color)}
                  <span className="absolute inset-0 flex items-center justify-center font-mono text-[8px] font-bold text-[#0b1326] drop-shadow">
                    {fp.id}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Floating Controls HUD: Zoom Percentage Selector */}
        <div className="absolute bottom-6 right-6 flex items-center gap-4 px-4 py-2 bg-surface-container-high/85 backdrop-blur-md border border-outline-variant rounded-xl shadow-2xl z-30 select-none">
          <button 
            type="button"
            onClick={handleZoomReset}
            className="text-on-surface-variant hover:text-primary transition-colors flex items-center justify-center cursor-pointer" 
            title="Fit to Screen"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          
          <div className="w-px h-5 bg-outline-variant/40" />
          
          <div className="flex items-center gap-5">
            <button 
              type="button"
              onClick={handleZoomOut}
              disabled={zoomLevel <= 0.5}
              className="text-[#dae2fd] hover:text-primary transition-colors flex items-center justify-center cursor-pointer disabled:opacity-40"
            >
              <ZoomOut className="w-4.5 h-4.5" />
            </button>
            <span className="font-mono font-bold text-primary text-[11px] min-w-[36px] text-center">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button 
              type="button"
              onClick={handleZoomIn}
              disabled={zoomLevel >= 2.0}
              className="text-[#dae2fd] hover:text-primary transition-colors flex items-center justify-center cursor-pointer disabled:opacity-40"
            >
              <ZoomIn className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>


        {/* Floating Simulation Timer & Speed Controller Popup */}
        {showTimerPopup && (
          <div 
            style={{ 
              position: 'absolute', 
              left: `${popupPos.x}px`, 
              top: `${popupPos.y}px`, 
              transform: 'none' 
            }}
            className="w-[285px] bg-[#121c33]/92 backdrop-blur-md border border-primary/30 rounded-xl p-3 shadow-2xl z-30 select-none animate-in fade-in duration-300"
          >
            <div 
              onMouseDown={handlePopupMouseDown}
              className="flex justify-between items-center border-b border-outline-variant/30 pb-1.5 mb-2 cursor-grab active:cursor-grabbing hover:bg-white/5 p-1 -m-1 rounded-t-lg transition-colors"
              title="Drag clock control display"
            >
              <div className="flex items-center gap-1.5">
                <GripVertical className="w-3 h-3 text-on-surface-variant opacity-60 pointer-events-none" />
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-mono text-[8px] uppercase tracking-wider text-[#dae2fd]/75 font-semibold pointer-events-none">Simulator Clock HUD</span>
              </div>
              <button 
                type="button" 
                onClick={() => setShowTimerPopup(false)}
                className="text-on-surface-variant hover:text-red-400 p-0.5 rounded transition-colors cursor-pointer"
                title="Hide clock controls"
              >
                <X className="w-3" />
              </button>
            </div>

            {/* Timer Output Display */}
            <div className="flex flex-col items-center justify-center bg-black/45 rounded-lg py-1.5 px-3 border border-outline-variant/15 mb-2.5 font-mono select-none">
              <span className="text-[8px] text-on-surface-variant/50 uppercase tracking-widest mb-0.5 font-bold">Simulated Time Elapsed</span>
              <span className="text-[19px] font-bold text-primary tracking-wider tabular-nums leading-none">
                {formatTime(simulatedElapsed)}
              </span>
              <div className="flex items-center gap-1 mt-1">
                <span className="text-[8px] text-on-surface-variant/40 uppercase">Clock Rate: </span>
                <span className="text-[8px] text-[#adc6ff]/80 font-bold">{simSpeed}x Realtime</span>
              </div>
            </div>

            {/* Speed Option Buttons */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center select-none">
                <label className="font-mono text-[8px] uppercase tracking-wider text-on-surface-variant opacity-85 font-bold">
                  Simulation Clock Speed
                </label>
                <span className="font-mono text-[8px] text-primary/80 font-semibold bg-primary/10 px-1 py-0.2 rounded border border-primary/20">
                  Page {speedPage} of 1000
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1">
                {Array.from({ length: 10 }, (_, i) => (speedPage - 1) * 10 + 1 + i).map(speed => (
                  <button 
                    key={speed}
                    type="button"
                    onClick={() => {
                      setSimSpeed(speed);
                    }}
                    className={`font-mono text-[9px] py-0.5 px-0.5 rounded border transition-all cursor-pointer flex flex-col items-center justify-center ${
                      simSpeed === speed 
                        ? 'bg-primary/25 text-primary border-primary shadow-inner font-extrabold' 
                        : 'bg-[#1b2640]/50 border-outline-variant/30 text-on-surface-variant hover:bg-[#1b2640] hover:text-[#dae2fd]'
                    }`}
                  >
                    <span>{speed}x</span>
                  </button>
                ))}
              </div>
            </div>
            
            {/* Page navigation controls */}
            <div className="mt-2 flex justify-between items-center bg-[#1b2640]/30 p-1 rounded-lg border border-outline-variant/20 select-none">
              <span className="font-mono text-[8.5px] uppercase tracking-wider text-on-surface-variant/75 pl-1.5 font-bold">
                Nav Rates Map
              </span>
              <div className="flex items-center gap-1.5">
                <button 
                   type="button"
                  disabled={speedPage <= 1}
                  onClick={() => setSpeedPage(prev => Math.max(1, prev - 1))}
                  className={`p-0.5 rounded border transition-all flex items-center justify-center ${
                    speedPage <= 1 
                      ? 'bg-transparent border-outline-variant/10 text-on-surface-variant/20 cursor-not-allowed opacity-30' 
                      : 'bg-primary/15 border-primary/30 text-primary hover:bg-primary/25 cursor-pointer'
                  }`}
                  title="Previous Speed Page"
                >
                  <ChevronLeft className="w-3 h-3" />
                </button>
                <button 
                  type="button"
                  disabled={speedPage >= 1000}
                  onClick={() => setSpeedPage(prev => Math.min(1000, prev + 1))}
                  className={`p-0.5 rounded border transition-all flex items-center justify-center ${
                    speedPage >= 1000 
                      ? 'bg-transparent border-outline-variant/10 text-on-surface-variant/20 cursor-not-allowed opacity-30' 
                      : 'bg-primary/15 border-primary/30 text-[#4c8df6] hover:bg-primary/25 cursor-pointer'
                  }`}
                  title="Next Speed Page"
                >
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Speed Range Slider up to 10000x */}
            <div className="flex flex-col gap-1 mt-2 bg-black/25 p-1 px-1.5 rounded border border-outline-variant/10 select-none font-mono">
              <div className="flex justify-between items-center text-[8.5px] font-bold">
                <span className="text-on-surface-variant">SLIDE SPEED TO 10000X</span>
                <span className="text-primary font-extrabold">{simSpeed}x</span>
              </div>
              <input
                type="range"
                min="1"
                max="10000"
                step="1"
                value={simSpeed}
                onChange={(e) => {
                  setSimSpeed(parseInt(e.target.value) || 1);
                }}
                className="w-full accent-primary bg-[#131b2e] border border-outline-variant/20 h-1 rounded-lg cursor-pointer text-[8px]"
              />
            </div>

            {/* Simulation Ending Duration Target Section */}
            <div className="mt-3 border-t border-outline-variant/30 pt-2.5 select-none animate-in fade-in duration-200">
              <label className="font-mono text-[8.5px] uppercase tracking-wider text-on-surface-variant opacity-85 font-bold block mb-1.5">
                Simulation Runtime Target
              </label>
              
              <div className="grid grid-cols-2 gap-1 mb-2">
                {[
                  { id: 'manual', label: 'Continuous Run' },
                  { id: '30s', label: 'End in 30s' },
                  { id: '1m', label: 'End in 1m' },
                  { id: '2m', label: 'End in 2m' },
                  { id: '5m', label: 'End in 5m' },
                  { id: '10m', label: 'End in 10m' },
                  { id: '1h', label: 'End in 1hr' },
                  { id: 'custom', label: 'Custom Timer' }
                ].map(op => (
                  <button
                    key={op.id}
                    type="button"
                    onClick={() => {
                      setTargetEndMode(op.id);
                    }}
                    className={`font-mono text-[8px] py-0.5 px-1 rounded border transition-all cursor-pointer text-center ${
                      targetEndMode === op.id
                        ? 'bg-primary/25 text-primary border-primary font-bold'
                        : 'bg-[#1b2640]/30 border-outline-variant/25 text-on-surface-variant hover:bg-[#1b2640]'
                    }`}
                  >
                    {op.label}
                  </button>
                ))}
              </div>

              {/* Custom Target Speed Inputs */}
              {targetEndMode === 'custom' && (() => {
                const hours = Math.floor(customTargetSeconds / 3600);
                const minutes = Math.floor((customTargetSeconds % 3600) / 60);
                const seconds = customTargetSeconds % 60;
                
                const updateTime = (h: number, m: number, s: number) => {
                  const total = (h * 3600) + (m * 60) + s;
                  setCustomTargetSeconds(Math.max(1, Math.min(356400, total)));
                };

                return (
                  <div className="flex flex-col gap-1 bg-[#1b2640]/50 p-1.5 rounded border border-outline-variant/30 mb-2 font-mono">
                    <span className="text-[8px] text-on-surface-variant font-bold uppercase select-none">Custom Target Duration:</span>
                    <div className="flex items-center justify-between gap-1 text-[9px]">
                      {/* Hours */}
                      <div className="flex flex-col items-center flex-1">
                        <span className="text-[7.5px] text-on-surface-variant/75 mb-0.5 font-bold uppercase">Hrs</span>
                        <input
                          type="number"
                          min="0"
                          max="99"
                          value={hours}
                          onChange={(e) => {
                            const val = Math.max(0, parseInt(e.target.value) || 0);
                            updateTime(val, minutes, seconds);
                          }}
                          className="w-full bg-black/45 border border-outline-variant/50 rounded text-center font-semibold text-primary py-0.5 text-[9px] focus:outline-none focus:border-primary"
                        />
                      </div>
                      
                      <span className="text-on-surface-variant/60 pt-2 opacity-50 font-bold">:</span>

                      {/* Minutes */}
                      <div className="flex flex-col items-center flex-1">
                        <span className="text-[7.5px] text-on-surface-variant/75 mb-0.5 font-bold uppercase">Min</span>
                        <input
                          type="number"
                          min="0"
                          max="59"
                          value={minutes}
                          onChange={(e) => {
                            const val = Math.max(0, Math.min(59, parseInt(e.target.value) || 0));
                            updateTime(hours, val, seconds);
                          }}
                          className="w-full bg-black/45 border border-outline-variant/50 rounded text-center font-semibold text-primary py-0.5 text-[9px] focus:outline-none focus:border-primary"
                        />
                      </div>

                      <span className="text-on-surface-variant/60 pt-2 opacity-50 font-bold">:</span>

                      {/* Seconds */}
                      <div className="flex flex-col items-center flex-1">
                        <span className="text-[7.5px] text-on-surface-variant/75 mb-0.5 font-bold uppercase">Sec</span>
                        <input
                          type="number"
                          min="0"
                          max="59"
                          value={seconds}
                          onChange={(e) => {
                            const val = Math.max(0, Math.min(59, parseInt(e.target.value) || 0));
                            updateTime(hours, minutes, val);
                          }}
                          className="w-full bg-black/45 border border-outline-variant/50 rounded text-center font-semibold text-primary py-0.5 text-[9px] focus:outline-none focus:border-primary"
                        />
                      </div>
                    </div>
                    {/* Display feedback of total seconds in small font inside */}
                    <div className="text-[8px] text-on-surface-variant/60 text-right font-semibold mt-0.5">
                      TOTAL: {customTargetSeconds}s
                    </div>
                  </div>
                );
              })()}

              {/* Real-time Dynamic Feedback indicator */}
              {targetEndMode !== 'manual' && targetRealRemaining !== null && (
                <div className="bg-[#1c2438] p-1.5 rounded-lg border border-primary/20 space-y-1 font-mono">
                  <div className="flex justify-between items-center text-[8.5px] font-semibold text-[#adc6ff]">
                    <span>REAL-TIME REMAINING:</span>
                    <span className="font-bold text-primary animate-pulse">{targetRealRemaining.toFixed(1)}s</span>
                  </div>
                  <div className="flex justify-between items-center text-[7.5px] text-on-surface-variant/70">
                    <span>CALCULATED VELOCITY:</span>
                    <span className="font-bold text-on-surface">{simSpeed}x</span>
                  </div>
                  {/* Progress bar representing real timer progress remaining */}
                  <div className="w-full bg-black/30 h-1 rounded-full overflow-hidden">
                    <div 
                      className="bg-primary h-full transition-all duration-300"
                      style={{ 
                        width: `${Math.min(100, (targetRealRemaining / (
                          targetEndMode === '30s' ? 30 :
                          targetEndMode === '1m' ? 60 :
                          targetEndMode === '2m' ? 120 :
                          targetEndMode === '5m' ? 300 :
                          targetEndMode === '10m' ? 600 :
                          targetEndMode === '1h' ? 3600 :
                          customTargetSeconds
                        )) * 100)}%`
                      }} 
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}


      </main>

      {/* Synchronized status indicators bottom banner */}
      <footer className="h-12 border-t border-outline-variant bg-[#131b2e] flex items-center justify-between px-4 shrink-0 z-10 font-mono text-xs select-none">
        <div className="flex items-center gap-6 divide-x divide-outline-variant/30">
          <div className="flex items-center gap-2">
            <div className={`w-4.5 h-4.5 rounded-full flex items-center justify-center transition-colors ${isSimRunning ? 'bg-primary-container text-[#00285c]' : 'bg-outline text-[#dae2fd]'}`}>
              {isSimRunning ? <Play className="w-2.5 h-2.5 fill-current" /> : <Pause className="w-2.5 h-2.5 fill-current" />}
            </div>
            <span className={`text-[10px] font-bold uppercase tracking-wider ${isSimRunning ? 'text-[#adc6ff]' : 'text-on-surface-variant'}`}>
              {isSimRunning ? 'SIM_RUNNING' : 'SIM_PAUSED'}
            </span>
          </div>

          <div className="flex items-center gap-2 pl-6">
            <ClockIcon />
            <span className="text-[10px] tracking-tight">{avgCycleTime}s AVG CYCLE COUNT</span>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 px-3 py-1 bg-surface-container rounded-full border border-outline-variant hover:border-[#adc6ff]/35 transition-colors">
            <div className={`w-2 h-2 rounded-full ${isSimRunning ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`} />
            <span className="text-[9px] font-bold uppercase tracking-widest text-[#dae2fd]">
              System Status: {isSimRunning ? 'Active' : 'Suspended'}
            </span>
          </div>

          <button 
            type="button" 
            onClick={() => setIsSimRunning(!isSimRunning)}
            className="bg-primary/10 hover:bg-[#adc6ff]/20 border border-[#adc6ff]/35 text-primary rounded px-4 py-1.5 text-[9px] uppercase tracking-wider font-bold inline-flex items-center gap-2 transition-all cursor-pointer"
          >
            {isSimRunning ? (
              <>
                <Pause className="w-3 h-3 fill-current" />
                <span>STOP SIM</span>
              </>
            ) : (
              <>
                <Play className="w-3 h-3 fill-current" />
                <span>START SIM</span>
              </>
            )}
          </button>

          <button 
            type="button" 
            onClick={() => setShowTimerPopup(!showTimerPopup)}
            className="bg-[#c2e7ff]/10 hover:bg-[#c2e7ff]/20 border border-[#c2e7ff]/30 text-primary-container rounded px-4 py-1.5 text-[9px] uppercase tracking-wider font-bold inline-flex items-center gap-2 transition-all cursor-pointer"
          >
            {showTimerPopup ? (
              <>
                <X className="w-3 h-3 text-red-400" />
                <span>HIDE TIMER</span>
              </>
            ) : (
              <>
                <MonitorPlay className="w-3 h-3 text-[#adc6ff]" />
                <span>SHOW TIMER</span>
              </>
            )}
          </button>
        </div>
      </footer>
      </div>
    </div>
  );
}

// Custom simple clock icon to dodge Lucide namespace clashes
function ClockIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-on-surface-variant opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
