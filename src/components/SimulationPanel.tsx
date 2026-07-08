/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Sliders, LayoutGrid, Play, Pause, Plus, Minus, Maximize2, 
  Trash2, ArrowRight, Settings, Info, X, 
  ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCcw, AlertTriangle, MonitorPlay,
  GripVertical, Menu
} from 'lucide-react';
import { ShopTopology, PartFlowItem, StationTopology } from '../types';

interface SimulationPanelProps {
  shops: ShopTopology[];
  onNavigate: (step: 'configuration' | 'layout' | 'shop-layout' | 'simulation') => void;
  onUpdateShop: (id: number, updatedFields: Partial<ShopTopology>) => void;
}

interface SimulatedStationState {
  id: string; // e.g. "1-1"
  name: string; // e.g. "A1"
  parts: PartFlowItem[]; // list of physical parts inside this station currently!
  currentCountdown: number; // countdown tracker in seconds
  cycleTime: number; // cycle time in seconds
  bufferSize: number; // buffer capacity
  successor?: string;
  partsExitedCount?: number;
}

interface SimulatedShopState {
  id: number;
  name: string;
  stations: SimulatedStationState[];
  connections: number[];
}

interface FlyingPart {
  id: string;
  shape: 'pentagon' | 'heart' | 'square' | 'triangle' | 'diamond' | 'oval';
  color: string;
  fromId: number | string;
  toId: number | string;
  fromStationId?: string;
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
  // Finds the single final shop of the line (highest ID or successor 'None')
  const finalShopId = React.useMemo(() => {
    if (shops.length === 0) return 4;
    const noneSuccessor = shops.find(s => s.successor === 'None');
    if (noneSuccessor) return noneSuccessor.id;
    return Math.max(...shops.map(s => s.id));
  }, [shops]);

  // Dynamic dimension helpers
  const getShopWidthPx = (s: ShopTopology) => {
    if (s.widthPx) return s.widthPx;
    const baseWidth = s.width || 30;
    return Math.max(180, Math.min(480, Math.round((baseWidth / 30) * 288)));
  };
  const getShopHeightPx = (s: ShopTopology) => {
    if (s.heightPx) return s.heightPx;
    const count = s.stations || 3;
    const baseHeight = 115 + count * 82;
    const heightFactor = s.height ? (s.height / 30) : 1;
    return Math.max(200, Math.min(800, Math.round(baseHeight * heightFactor)));
  };

  // --- Animation and Drag-Pan State ---
  const [isSimRunning, setIsSimRunning] = useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = useState<number>(0.95);
  const [panX, setPanX] = useState<number>(40);
  const [panY, setPanY] = useState<number>(10);

  // States for simple view station positions and sidebar controls
  const [isSimpleView, setIsSimpleView] = useState<boolean>(true);
  const [stationPositions, setStationPositions] = useState<{ [stationId: string]: { x: number, y: number } }>({});
  const [taskbarFontSize, setTaskbarFontSize] = useState<number>(11);
  const [partsToAddCount, setPartsToAddCount] = useState<number>(1);

  // Refs for station dragging in simple view
  const isDraggingStationRef = useRef<string | null>(null);
  const isDraggingStationParentShopIdRef = useRef<number | null>(null);
  const stationDragStartRef = useRef({ x: 0, y: 0 });
  const stationStartCoordsRef = useRef({ x: 0, y: 0 });

  // Timer controls
  const [simSpeed, setSimSpeed] = useState<number>(1.0);
  const [simulatedElapsed, setSimulatedElapsed] = useState<number>(0);
  const [showTimerPopup, setShowTimerPopup] = useState<boolean>(true);
  const [clockHudScale, setClockHudScale] = useState<'normal' | 'small'>('normal');
  const [isSidebarHidden, setIsSidebarHidden] = useState<boolean>(false);
  const [speedPage, setSpeedPage] = useState<number>(1);

  // Targets
  const [targetEndMode, setTargetEndMode] = useState<string>('manual');
  const [customTargetSeconds, setCustomTargetSeconds] = useState<number>(60);
  const [sysNotice, setSysNotice] = useState<string | null>(null);

  // Floating Speed/Clock HUD popup state
  const [popupPos, setPopupPos] = useState({ x: 15, y: 79 });
  const [isDraggingPopup, setIsDraggingPopup] = useState(false);
  const dragPopupStart = useRef({ x: 0, y: 0 });
  const popupOffsetStart = useRef({ x: 15, y: 79 });

  useEffect(() => {
    if (!isDraggingPopup) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragPopupStart.current.x;
      const dy = e.clientY - dragPopupStart.current.y;
      
      const newX = popupOffsetStart.current.x + dx;
      const newY = popupOffsetStart.current.y + dy;
      
      const boundedX = Math.max(10, Math.min(window.innerWidth - 300, newX));
      const boundedY = Math.max(10, Math.min(window.innerHeight - 400, newY));
      
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

  // Resizing shop card states and helper
  const [resizingShopId, setResizingShopId] = useState<number | null>(null);
  const resizeStartRef = useRef({ width: 0, height: 0, x: 0, y: 0 });

  const handleResizeStart = (e: React.MouseEvent, shop: ShopTopology) => {
    e.stopPropagation();
    e.preventDefault();
    setResizingShopId(shop.id);
    resizeStartRef.current = {
      width: getShopWidthPx(shop),
      height: getShopHeightPx(shop),
      x: e.clientX,
      y: e.clientY
    };
  };

  const getMergePointForStationSimple = (stationId: string, shopId: number) => {
    const shopObj = shops.find(s => s.id === shopId);
    if (!shopObj) return null;
    const ssState = simShops.find(ss => ss.id === shopId);
    if (!ssState) return null;
    const stObj = ssState.stations.find(s => s.id === stationId);
    if (!stObj) return null;

    const sIdx = ssState.stations.findIndex(s => s.id === stationId);
    const targetSuccessor = stObj.successor || (sIdx === ssState.stations.length - 1 ? "exit" : ssState.stations[sIdx + 1]?.id || "exit");

    // Find all stations targeting this same target
    const targetSources = ssState.stations.filter(s => {
      const idx = ssState.stations.findIndex(item => item.id === s.id);
      const succ = s.successor || (idx === ssState.stations.length - 1 ? "exit" : ssState.stations[idx + 1]?.id || "exit");
      return succ === targetSuccessor;
    });

    if (targetSources.length <= 1) {
      return null; // No merge point needed
    }

    // Determine target point (endX, endY) inside the shop card coordinates
    let endX = 0;
    let endY = 0;
    if (targetSuccessor === "exit") {
      endX = getMergePointWidth(shopObj);
      const headerHeight = 53;
      endY = shopObj.isOutputShop ? -23 : getMergePointHeight(shopObj) - 20 - headerHeight;
    } else {
      const succPos = stationPositions[targetSuccessor] || getDefaultStationPos(targetSuccessor, shopId);
      endX = succPos.x + 55;
      endY = succPos.y + 37.5;
    }

    // Average starting point of all source stations
    const avgStartX = targetSources.reduce((sum, item) => {
      const pos = stationPositions[item.id] || getDefaultStationPos(item.id, shopId);
      return sum + pos.x + 55;
    }, 0) / targetSources.length;
    const avgStartY = targetSources.reduce((sum, item) => {
      const pos = stationPositions[item.id] || getDefaultStationPos(item.id, shopId);
      return sum + pos.y + 37.5;
    }, 0) / targetSources.length;

    const dx = endX - avgStartX;
    const dy = endY - avgStartY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const ux = dist > 0 ? dx / dist : 0;
    const uy = dist > 0 ? dy / dist : -1;

    // Shift merge point 45px before the target inside the shop card coordinates
    return {
      x: endX - ux * 45,
      y: endY - uy * 45
    };
  };

  const getMergePointWidth = (s: ShopTopology) => {
    return s.widthPx || 288;
  };

  const getMergePointHeight = (s: ShopTopology) => {
    return s.heightPx || (115 + (s.stations || 3) * 82);
  };

  const handlePopupMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    setIsDraggingPopup(true);
    dragPopupStart.current = { x: e.clientX, y: e.clientY };
    popupOffsetStart.current = { ...popupPos };
    e.preventDefault();
  };

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

  // Localized state containing stations and flying parts
  const [simState, setSimState] = useState<{
    simShops: SimulatedShopState[];
    flyingParts: FlyingPart[];
    processedCounts: { [shopId: number]: number };
    partsReleasedCount: number;
    intakeQueue: PartFlowItem[];
    conveyorExitCount: number;
    intakeRoundRobinIndex: number;
  }>({ simShops: [], flyingParts: [], processedCounts: {}, partsReleasedCount: 0, intakeQueue: [], conveyorExitCount: 0, intakeRoundRobinIndex: 0 });

  const { simShops, flyingParts, processedCounts, partsReleasedCount, intakeQueue, conveyorExitCount, intakeRoundRobinIndex } = simState;

  const [totalCycleTime, setTotalCycleTime] = useState<number>(0);
  const [avgPartProduced, setAvgPartProduced] = useState<string>("0.0");
  const [draggedStationIdx, setDraggedStationIdx] = useState<number | null>(null);
  const [draggedStationShopId, setDraggedStationShopId] = useState<number | null>(null);
  const [bufferSelectedShopId, setBufferSelectedShopId] = useState<number | null>(null);

  useEffect(() => {
    if (conveyorExitCount > 0) {
      setAvgPartProduced((simulatedElapsed / conveyorExitCount).toFixed(1));
    } else {
      setAvgPartProduced("0.0");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conveyorExitCount]);

  const canvasRef = useRef<HTMLDivElement>(null);
  const isPanningRef = useRef<boolean>(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const isDraggingCardRef = useRef<number | null>(null);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const cardStartRef = useRef({ x: 0, y: 0 });
  const partCounterRef = useRef<number>(1);

  // Constants
  const shapes: Array<'pentagon' | 'heart' | 'square' | 'triangle' | 'diamond' | 'oval'> = [
    'pentagon', 'heart', 'square', 'triangle', 'diamond', 'oval'
  ];
  const colors = [
    'bg-[#4b8eff]', 'bg-[#b7c8e1]', 'bg-[#ffb595]', 'bg-[#adc6ff]', 'bg-[#eb9e34]', 'bg-[#ef6719]'
  ];

  const generatePart = (): PartFlowItem => {
    const shape = shapes[Math.floor(Math.random() * shapes.length)];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const idVal = partCounterRef.current++;
    return { id: `Part #${idVal}`, shape, color };
  };

  // Reconcile or initialize stations inside the simulation state
  useEffect(() => {
    setSimState(prev => {
      const inShop = shops.find(s => s.isInputShop);
      const limit = inShop?.intakePartsCount ?? 15;
      
      let nextIntakeQueue = [...prev.intakeQueue];
      // Initialize or reset queue when simulation is at 0 elapsed time and not already initialized (prevent wipe on Stop clock reset)
      if (simulatedElapsed === 0 && prev.simShops.length === 0) {
        // If the queue lacks the core parts or user manually updated intakePartsCount
        if (prev.simShops.length === 0 || prev.intakeQueue.length === 0 || prev.partsReleasedCount !== limit) {
          nextIntakeQueue = Array.from({ length: limit }).map(() => generatePart());
        }
      }

      const initialized = shops.map(s => {
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

        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const prefix = letters[(s.id - 1) % letters.length] || 'X';

        const stationsDefList: StationTopology[] = s.stationsData && s.stationsData.length > 0 
          ? s.stationsData 
          : (Array.from({ length: s.stations || 3 }).map((_, stIdx) => ({
              id: `${s.id}-${stIdx + 1}`,
              name: `${prefix}${stIdx + 1}`,
              partsCount: 0,
              bufferSize: 5,
              cycleTime: 15
            })) as StationTopology[]);

        const nextStations = stationsDefList.map((st, sIdx) => {
          const existingShop = prev.simShops.find(ss => ss.id === s.id);
          const existingSt = existingShop?.stations.find(ex => ex.id === st.id);

          if (simulatedElapsed === 0 && prev.simShops.length === 0) {
            return {
              id: st.id,
              name: st.name,
              parts: [],
              currentCountdown: st.cycleTime,
              cycleTime: st.cycleTime,
              bufferSize: st.bufferSize,
              successor: st.successor,
              partsExitedCount: 0
            };
          }

          if (existingSt) {
            return {
              ...existingSt,
              cycleTime: st.cycleTime,
              bufferSize: st.bufferSize,
              successor: st.successor,
              partsExitedCount: existingSt.partsExitedCount ?? 0
            };
          } else {
            return {
              id: st.id,
              name: st.name,
              parts: [],
              currentCountdown: st.cycleTime,
              cycleTime: st.cycleTime,
              bufferSize: st.bufferSize,
              successor: st.successor,
              partsExitedCount: 0
            };
          }
        });

        return {
          id: s.id,
          name: s.name,
          stations: nextStations,
          connections
        };
      });

      const validIds = new Set(shops.map(s => s.id));
      const filtered = initialized.filter(ss => validIds.has(ss.id));

      return {
        ...prev,
        simShops: filtered,
        intakeQueue: nextIntakeQueue,
        partsReleasedCount: limit
      };
    });
  }, [shops, simulatedElapsed]);

  // Compute total cycle time dynamically based on selected station topologies
  useEffect(() => {
    let tot = 0;
    shops.forEach(s => {
      if (s.stationsData) {
        s.stationsData.forEach(st => {
          tot += st.cycleTime;
        });
      }
    });
    setTotalCycleTime(tot);
  }, [shops]);

  // Handle station drag and drop reordering inside a shop
  const handleStationDragStart = (e: React.DragEvent, shopId: number, index: number) => {
    e.stopPropagation();
    setDraggedStationIdx(index);
    setDraggedStationShopId(shopId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleStationDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
  };

  const handleStationDrop = (e: React.DragEvent, shopId: number, targetIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedStationIdx === null || draggedStationShopId !== shopId || draggedStationIdx === targetIndex) return;

    const shop = shops.find(s => s.id === shopId);
    if (!shop) return;

    // Build the stations array from custom stationsData or default to generating them
    const stationsList = shop.stationsData && shop.stationsData.length > 0 
      ? [...shop.stationsData]
      : (Array.from({ length: shop.stations || 3 }).map((_, stIdx) => {
          const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
          const prefix = letters[(shop.id - 1) % letters.length] || 'X';
          return {
            id: `${shop.id}-${stIdx + 1}`,
            name: `${prefix}${stIdx + 1}`,
            partsCount: 0,
            bufferSize: 5,
            cycleTime: 15
          };
        }) as StationTopology[]);

    const nextStationsData = [...stationsList];
    const [draggedItem] = nextStationsData.splice(draggedStationIdx, 1);
    nextStationsData.splice(targetIndex, 0, draggedItem);

    // Update local simShops too to preserve currently simulated parts in their correct positions relative to order!
    setSimState(prev => {
      const nextSimShops = prev.simShops.map(ss => {
        if (ss.id === shopId) {
          const ssStations = [...ss.stations];
          const [draggedSt] = ssStations.splice(draggedStationIdx, 1);
          ssStations.splice(targetIndex, 0, draggedSt);
          return {
            ...ss,
            stations: ssStations
          };
        }
        return ss;
      });
      return {
        ...prev,
        simShops: nextSimShops
      };
    });

    onUpdateShop(shopId, { stationsData: nextStationsData });
    setSysNotice(`Reordered stations in ${shop.name}.`);
    setTimeout(() => setSysNotice(null), 3000);
  };

  const handleStationDragEnd = () => {
    setDraggedStationIdx(null);
    setDraggedStationShopId(null);
  };

  // Handles starting simulation from zero with timer loops and resets
  const handleStartSimulation = () => {
    setIsSimRunning(false); // temporary freeze to reconstruct safely
    setSimulatedElapsed(0); // Reset the clock HUD continuous timer
    setSimState(prev => {
      const resetShops = prev.simShops.map(ss => ({
        ...ss,
        stations: ss.stations.map(st => ({
          ...st,
          parts: st.parts, // Keep the parts in the stations (soft reset)
          currentCountdown: st.cycleTime, // Reset countdown back to cycleTime
          partsExitedCount: 0 // Reset station level exited count
        }))
      }));

      const inShop = shops.find(s => s.isInputShop);
      const limit = inShop?.intakePartsCount ?? 15;
      const finalQueue = prev.intakeQueue.length > 0 
        ? prev.intakeQueue 
        : Array.from({ length: limit }).map(() => generatePart()); // Keep existing or create fresh if empty

      return {
        ...prev,
        simShops: resetShops,
        flyingParts: prev.flyingParts, // Keep the active flying parts so everything kind of continues
        intakeQueue: finalQueue,
        conveyorExitCount: prev.conveyorExitCount, // Outbound parts count shouldn't reset ever
        processedCounts: {} // Reset processed counts
      };
    });
    setIsSimRunning(true);
    setSysNotice('Simulation soft reset: clock restarted, active parts preserved.');
    setTimeout(() => setSysNotice(null), 3500);
  };

  // Handle addition of a part to the labeled Entrance shop (isInputShop: true)
  const handleAddPartToInShop = () => {
    const inShop = shops.find(s => s.isInputShop);
    if (!inShop) {
      setSysNotice('Error: No input shop designated. Mark a shop [IN] first.');
      setTimeout(() => setSysNotice(null), 4000);
      return;
    }

    const qtyToAdd = isNaN(partsToAddCount) || partsToAddCount < 1 ? 1 : partsToAddCount;
    const currentCount = intakeQueue.length;
    if (currentCount + qtyToAdd > 10000) {
      setSysNotice(`Error: Limit exceeded! Queue cannot exceed 10,000 waiting parts. (Currently ${currentCount}, tried to add ${qtyToAdd})`);
      setTimeout(() => setSysNotice(null), 5000);
      return;
    }

    setSimState(prev => {
      const newParts = Array.from({ length: qtyToAdd }).map(() => generatePart());
      const updatedQueue = [...prev.intakeQueue, ...newParts];
      
      return {
        ...prev,
        intakeQueue: updatedQueue
      };
    });

    setSysNotice(`Added ${qtyToAdd} parts to the intake conduit queue.`);
    setTimeout(() => setSysNotice(null), 3000);
  };

  // Clear simulated part entities and reset counts
  const handleClearAllSimData = () => {
    setSimState({
      simShops: [],
      flyingParts: [],
      processedCounts: {},
      partsReleasedCount: 0,
      intakeQueue: [],
      conveyorExitCount: 0
    });
    setSimulatedElapsed(0);
    setSysNotice(null);
  };

  // --- Processing Cycle Loop: Ticks every 100ms ---
  useEffect(() => {
    if (!isSimRunning) return;

    const interval = setInterval(() => {
      // Delta elapsed time tracking
      const deltaSec = 0.1 * simSpeed;
      
      const targetSecArr: { [key: string]: number } = {
        '30s': 30, '1m': 60, '1.5m': 90, '2m': 120, '5m': 300, '10m': 600, '1h': 3600
      };
      const limitSec = targetEndMode === 'custom' ? customTargetSeconds : targetSecArr[targetEndMode];

      setSimulatedElapsed(prevElap => {
        const nextElap = prevElap + deltaSec;
        if (limitSec !== undefined && nextElap >= limitSec) {
          setIsSimRunning(false);
          return limitSec;
        }
        return nextElap;
      });

      setSimState(prev => {
        // Deep clone the shop stations to prevent references problems
        let nextSimShops: SimulatedShopState[] = prev.simShops.map(ss => ({
          ...ss,
          stations: ss.stations.map(st => ({
            ...st,
            parts: st.parts.map(p => ({ ...p }))
          })),
          connections: [...ss.connections]
        }));

        let nextIntakeQueue = [...prev.intakeQueue];
        const newFlyingParts: FlyingPart[] = [];
        const nextProcessed = { ...prev.processedCounts };

        // Auto-feed waiting intake parts into intake stations of the input shop
        const inShopSim = nextSimShops.find(ss => {
          const orig = shops.find(o => o.id === ss.id);
          return orig?.isInputShop;
        });

        let nextRoundRobinIdx = prev.intakeRoundRobinIndex ?? 0;

        if (inShopSim && nextIntakeQueue.length > 0) {
          // Identify stations in the input shop that do not have any internal predecessor
          const intakeStations = inShopSim.stations.filter((st, sIdx) => {
            const hasPredecessor = inShopSim.stations.some((other, oIdx) => {
              const succ = other.successor || (oIdx === inShopSim.stations.length - 1 ? "exit" : inShopSim.stations[oIdx + 1]?.id || "exit");
              return succ === st.id;
            });
            return !hasPredecessor;
          });

          if (intakeStations.length > 0) {
            // Check if the current target in alternating order has space
            let canFeederContinue = true;
            while (canFeederContinue && nextIntakeQueue.length > 0) {
              const targetSt = intakeStations[nextRoundRobinIdx % intakeStations.length];
              const flyingToTarget = prev.flyingParts.filter(fp => fp.toId === targetSt.id).length + newFlyingParts.filter(fp => fp.toId === targetSt.id).length;
              if (targetSt.parts.length + flyingToTarget < targetSt.bufferSize + 1) {
                const nextPart = nextIntakeQueue.shift();
                if (nextPart) {
                  const originalInShop = shops.find(s => s.id === inShopSim.id);
                  if (originalInShop) {
                    const currentCoords = stationPositions[targetSt.id] || getDefaultStationPos(targetSt.id, inShopSim.id);
                    // Absolute start pos on conveyor belt line
                    const startX = originalInShop.posX - 38;
                    const startY = originalInShop.posY + 24;
                    // Absolute destination pos on station
                    const headerHeight = 53;
                    const endX = originalInShop.posX + currentCoords.x;
                    const endY = originalInShop.posY + headerHeight + currentCoords.y + 37.5;

                    newFlyingParts.push({
                      ...nextPart,
                      fromId: 'import_conveyor',
                      toId: targetSt.id,
                      fromStationId: 'import',
                      progress: 0,
                      startX,
                      startY,
                      endX,
                      endY
                    });
                    
                    nextRoundRobinIdx++;
                  } else {
                    canFeederContinue = false;
                  }
                }
              } else {
                // Alternating station is full, wait for it to be processed! This enforces alternating order strictly.
                canFeederContinue = false;
              }
            }
          }
        }

        // Process sequentially
        nextSimShops = nextSimShops.map(ss => {
          const original = shops.find(o => o.id === ss.id);
          if (!original) return ss;

          const lastStationIdx = ss.stations.length - 1;

          // Sequential Pipeline processing from downstream stations up to upstream (reverse index)
          for (let j = lastStationIdx; j >= 0; j--) {
            const st = ss.stations[j];
            const hasParts = st.parts.length > 0;

            if (hasParts) {
              const nextCount = st.currentCountdown - 0.1 * simSpeed;

              if (nextCount <= 0) {
                // Determine target successor string
                const targetSuccessor = st.successor || (j === lastStationIdx ? "exit" : ss.stations[j + 1]?.id || "exit");

                if (targetSuccessor !== "exit") {
                  // Move to internal succeeding station in the same shop
                  const nextSt = ss.stations.find(station => station.id === targetSuccessor);
                  if (nextSt) {
                    const flyingToTarget = prev.flyingParts.filter(fp => fp.toId === nextSt.id).length + newFlyingParts.filter(fp => fp.toId === nextSt.id).length;
                    if (nextSt.parts.length + flyingToTarget < nextSt.bufferSize + 1) {
                      const finishedPart = st.parts.shift();
                      if (finishedPart) {
                        st.partsExitedCount = (st.partsExitedCount || 0) + 1;

                        const shopId = ss.id;
                        const sourceStPos = stationPositions[st.id] || getDefaultStationPos(st.id, shopId);
                        const targetStPos = stationPositions[nextSt.id] || getDefaultStationPos(nextSt.id, shopId);

                        const headerHeight = 53;
                        const startX = original.posX + sourceStPos.x + 55;
                        const startY = original.posY + headerHeight + sourceStPos.y + 37.5;
                        const endX = original.posX + targetStPos.x + 55;
                        const endY = original.posY + headerHeight + targetStPos.y + 37.5;

                        newFlyingParts.push({
                          ...finishedPart,
                          fromId: ss.id,
                          toId: nextSt.id,
                          fromStationId: st.id,
                          progress: 0,
                          startX,
                          startY,
                          endX,
                          endY
                        });
                      }
                      st.currentCountdown = st.cycleTime;
                    } else {
                      // Blocked due to backpressure (countdown capped at 0)
                      st.currentCountdown = 0;
                    }
                  } else {
                    // Fallback if target station cannot be located: process out normally
                    const finishedPart = st.parts.shift();
                    if (finishedPart) {
                      st.partsExitedCount = (st.partsExitedCount || 0) + 1;
                    }
                    st.currentCountdown = st.cycleTime;
                  }
                } else {
                  // Exits this shop. Determine next destination.
                  if (original.isOutputShop || ss.connections.length === 0) {
                    // Exits the plant onto final Outbound production conveyor belt
                    const finishedPart = st.parts.shift();
                    if (finishedPart) {
                      nextProcessed[ss.id] = (nextProcessed[ss.id] || 0) + 1;
                      st.partsExitedCount = (st.partsExitedCount || 0) + 1;

                      const startX = original.posX + getShopWidthPx(original) / 2;
                      const startY = original.posY + 15;

                      newFlyingParts.push({
                        ...finishedPart,
                        fromId: ss.id,
                        toId: 'conveyor',
                        fromStationId: st.id,
                        progress: 0,
                        startX,
                        startY,
                        endX: startX,
                        endY: 49
                      });
                    }
                    st.currentCountdown = st.cycleTime;
                  } else {
                    // Transition to succeeding shop's first station
                    const targetId = ss.connections[0];
                    const targetShop = nextSimShops.find(cs => cs.id === targetId);
                    const targetOrig = shops.find(t => t.id === targetId);

                    if (targetShop && targetOrig) {
                      const firstStTarget = targetShop.stations[0];
                      if (firstStTarget) {
                        const flyingToTarget = prev.flyingParts.filter(fp => fp.toId === targetId).length + newFlyingParts.filter(fp => fp.toId === targetId).length;
                        if (firstStTarget.parts.length + flyingToTarget < firstStTarget.bufferSize + 1) {
                          const finishedPart = st.parts.shift();
                          if (finishedPart) {
                            nextProcessed[ss.id] = (nextProcessed[ss.id] || 0) + 1;
                            st.partsExitedCount = (st.partsExitedCount || 0) + 1;

                            const startX = original.posX + getShopWidthPx(original) / 2;
                            const startY = original.posY + getShopHeightPx(original) - 20;
                            const endX = targetOrig.posX + getShopWidthPx(targetOrig) / 2;
                            const endY = targetOrig.posY + 30;

                            newFlyingParts.push({
                              ...finishedPart,
                              fromId: ss.id,
                              toId: targetId,
                              fromStationId: st.id,
                              progress: 0,
                              startX,
                              startY,
                              endX,
                              endY
                            });
                          }
                          st.currentCountdown = st.cycleTime;
                        } else {
                          // Successor initial station queue is full! Backpressure blockade
                          st.currentCountdown = 0;
                        }
                      }
                    } else {
                      // Fallback normal complete
                      const finishedPart = st.parts.shift();
                      if (finishedPart) {
                        nextProcessed[ss.id] = (nextProcessed[ss.id] || 0) + 1;
                        st.partsExitedCount = (st.partsExitedCount || 0) + 1;
                      }
                      st.currentCountdown = st.cycleTime;
                    }
                  }
                }
              } else {
                st.currentCountdown = nextCount;
              }
            } else {
              st.currentCountdown = st.cycleTime;
            }
          }

          return ss;
        });

        // Advance progress of the flying parts
        const activeFlyingParts: FlyingPart[] = [];
        let newConveyorExits = 0;
        prev.flyingParts.forEach(fp => {
          const nextProg = fp.progress + 6 * simSpeed;
          if (nextProg >= 100) {
            // Arrived! Add to targeted first station queue if space exists
            if (fp.toId !== 'conveyor' && fp.toId !== 'outbound_belt') {
              if (typeof fp.toId === 'string' && fp.toId.includes('-')) {
                for (let ss of nextSimShops) {
                  const targetSt = ss.stations.find(s => s.id === fp.toId);
                  if (targetSt) {
                    targetSt.parts.push({ id: fp.id, shape: fp.shape, color: fp.color });
                    break;
                  }
                }
              } else if (typeof fp.toId === 'number') {
                const targetShop = nextSimShops.find(cs => cs.id === fp.toId);
                if (targetShop) {
                  const firstStTarget = targetShop.stations[0];
                  if (firstStTarget) {
                    firstStTarget.parts.push({ id: fp.id, shape: fp.shape, color: fp.color });
                  }
                }
              }
            } else if (fp.toId === 'conveyor') {
              newConveyorExits++;
              newFlyingParts.push({
                id: fp.id,
                shape: fp.shape,
                color: fp.color,
                fromId: fp.fromId,
                fromStationId: fp.fromStationId,
                toId: 'outbound_belt',
                progress: 0,
                startX: fp.endX,
                startY: 49,
                endX: fp.endX + 600,
                endY: 49
              });
            } else if (fp.toId === 'outbound_belt') {
              // Exited the plant entirely!
            }
          } else {
            activeFlyingParts.push({
              ...fp,
              progress: nextProg
            });
          }
        });

        // Check if all parts are finished
        const systemHasPartsActive = prev.intakeQueue.length > 0 || 
                                     prev.flyingParts.length > 0 || 
                                     prev.simShops.some(ss => ss.stations.some(st => st.parts.length > 0));
        const totalPartsLeft = nextIntakeQueue.length + 
                               activeFlyingParts.length + 
                               newFlyingParts.length + 
                               nextSimShops.reduce((sum, ss) => sum + ss.stations.reduce((sumSt, st) => sumSt + st.parts.length, 0), 0);

        if (systemHasPartsActive && totalPartsLeft === 0) {
          setTimeout(() => setIsSimRunning(false), 0);
        }

        return {
          ...prev,
          simShops: nextSimShops,
          flyingParts: [...activeFlyingParts, ...newFlyingParts],
          processedCounts: nextProcessed,
          intakeQueue: nextIntakeQueue,
          conveyorExitCount: prev.conveyorExitCount + newConveyorExits,
          intakeRoundRobinIndex: nextRoundRobinIdx
        };
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isSimRunning, simSpeed, targetEndMode, customTargetSeconds, shops]);

  // Sidebar specific station buffer modification updater with persistence
  const handleModifyStationBuffer = (shopId: number, stationId: string, amount: number) => {
    // 1. Update live simulation state immediately
    setSimState(prev => {
      const nextSimShops = prev.simShops.map(ss => {
        if (ss.id === shopId) {
          return {
            ...ss,
            stations: ss.stations.map(st => {
              if (st.id === stationId) {
                return {
                  ...st,
                  bufferSize: Math.max(1, Math.min(100, st.bufferSize + amount))
                };
              }
              return st;
            })
          };
        }
        return ss;
      });
      return {
        ...prev,
        simShops: nextSimShops
      };
    });

    // 2. Persist to parent config so resets/layout changes preserve edited capacities
    const curShop = shops.find(s => s.id === shopId);
    if (curShop && curShop.stationsData) {
      const nextStationsData = curShop.stationsData.map(st => {
        if (st.id === stationId) {
          return {
            ...st,
            bufferSize: Math.max(1, Math.min(100, st.bufferSize + amount))
          };
        }
        return st;
      });
      onUpdateShop(shopId, { stationsData: nextStationsData });
    }
  };

  // Canvas Drag-to-Pan Handlers (Restricted to keep top conveyor bounded)
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    // Exclude button clicks and interactive controls
    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('input') || (e.target as HTMLElement).closest('select')) return;
    
    isPanningRef.current = true;
    panStartRef.current = { x: e.clientX - panX, y: e.clientY - panY };
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (isDraggingCardRef.current !== null) {
      const id = isDraggingCardRef.current;
      const dx = (e.clientX - dragStartRef.current.x) / zoomLevel;
      const dy = (e.clientY - dragStartRef.current.y) / zoomLevel;
      
      const nextX = Math.round(cardStartRef.current.x + dx);
      const nextY = Math.max(85, Math.round(cardStartRef.current.y + dy)); // prevent sliding above top conveyor limit
      onUpdateShop(id, { posX: nextX, posY: nextY });
      return;
    }

    if (!isPanningRef.current) return;
    
    const calculatedY = e.clientY - panStartRef.current.y;
    setPanX(e.clientX - panStartRef.current.x);
    // Strict requirement: User can NEVER scroll above top production conveyor belt
    setPanY(Math.min(15, calculatedY));
  };

  const handleCanvasMouseUp = () => {
    isPanningRef.current = false;
    isDraggingCardRef.current = null;
    isDraggingStationRef.current = null;
    isDraggingStationParentShopIdRef.current = null;
    setResizingShopId(null);
  };

  const handleCardDragStart = (e: React.MouseEvent, id: number, currentX: number, currentY: number) => {
    e.stopPropagation();
    isDraggingCardRef.current = id;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    cardStartRef.current = { x: currentX, y: currentY };
  };

  const handleZoomIn = () => setZoomLevel(prev => Math.min(1.8, prev + 0.05));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(0.65, prev - 0.05));

  const renderClipShape = (shape: string, color: string) => {
    const commonClasses = "w-5 h-5 flex items-center justify-center shrink-0 shadow-sm border border-black/10 transition-transform scale-95";
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
            style={{ clipPath: 'path("M12,5 C10.2,2 6,2.4 4,5 C1.5,8.2 4.4,13 12,19.2 C19.6,13 22.5,8.2 20,5 C18,2.4 13.8,2 12,5 Z")' }}
          />
        );
      case 'square':
        return <div className={`${commonClasses} ${color} rounded-sm`} />;
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
        return <div className={`${commonClasses} ${color} rounded-full`} />;
      default:
        return <div className={`${commonClasses} bg-primary`} />;
    }
  };

  return (
    <div className="flex flex-1 overflow-hidden h-full">
      {/* Sidebar navigation and buffer modifier */}
      {!isSidebarHidden && (
        <aside className="w-64 border-r border-outline-variant flex flex-col bg-surface-container-low p-4 gap-6 shrink-0 justify-between select-none z-10">
          <div>
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsSidebarHidden(true)}
                  className="p-1 hover:bg-surface-container-high rounded text-on-surface-variant hover:text-white cursor-pointer transition-colors"
                  title="Hide Sidebar"
                >
                  <Menu className="w-4 h-4" />
                </button>
                <p className="font-mono uppercase tracking-widest text-[#8e909a] font-bold text-left text-[10px]">
                  System Controls
                </p>
              </div>
            <div className="flex items-center gap-1 bg-[#10192e] px-1.5 py-0.5 rounded border border-outline-variant/20 select-none">
              <button 
                type="button" 
                onClick={() => setTaskbarFontSize(prev => Math.max(7, prev - 1))}
                className="text-primary hover:text-white px-1 text-[8px] font-mono cursor-pointer"
                title="Decrease task bar header font size"
              >
                A-
              </button>
              <span className="text-[8px] text-primary font-bold font-mono min-w-[12px] text-center">{taskbarFontSize}</span>
              <button 
                type="button"
                onClick={() => setTaskbarFontSize(prev => Math.min(20, prev + 1))}
                className="text-primary hover:text-white px-1 text-[8px] font-mono cursor-pointer"
                title="Increase task bar header font size"
              >
                A+
              </button>
            </div>
          </div>
          <ul className="space-y-1">
            <li>
              <button 
                type="button"
                onClick={() => onNavigate('configuration')}
                className="w-full flex items-center gap-3 px-4 py-2 rounded text-on-surface-variant hover:bg-surface-container-high transition-all cursor-pointer text-left font-mono uppercase tracking-wider"
                style={{ fontSize: `${taskbarFontSize}px` }}
              >
                <Sliders className="w-4 h-4 text-on-surface-variant shrink-0" style={{ width: `${taskbarFontSize + 4}px`, height: `${taskbarFontSize + 4}px` }} />
                <span>Configuration</span>
              </button>
            </li>
            <li>
              <button 
                type="button"
                onClick={() => onNavigate('layout')}
                className="w-full flex items-center gap-3 px-4 py-2 rounded text-on-surface-variant hover:bg-surface-container-high transition-all cursor-pointer text-left font-mono uppercase tracking-wider"
                style={{ fontSize: `${taskbarFontSize}px` }}
              >
                <LayoutGrid className="w-4 h-4 text-on-surface-variant shrink-0" style={{ width: `${taskbarFontSize + 4}px`, height: `${taskbarFontSize + 4}px` }} />
                <span>Layout</span>
              </button>
            </li>
            <li>
              <button 
                type="button"
                onClick={() => onNavigate('shop-layout')}
                className="w-full flex items-center gap-3 px-4 py-2 rounded text-on-surface-variant hover:bg-surface-container-high transition-all cursor-pointer text-left font-mono uppercase tracking-wider"
                style={{ fontSize: `${taskbarFontSize}px` }}
              >
                <Settings className="w-4 h-4 text-on-surface-variant shrink-0" style={{ width: `${taskbarFontSize + 4}px`, height: `${taskbarFontSize + 4}px` }} />
                <span>Shop Layout</span>
              </button>
            </li>
            <li>
              <div 
                className="w-full flex items-center gap-3 px-4 py-2 bg-[#1b2640] text-primary border-l-2 border-primary rounded font-mono uppercase tracking-wider font-bold"
                style={{ fontSize: `${taskbarFontSize}px` }}
              >
                <Play className="w-4 h-4 text-primary animate-pulse shrink-0" style={{ width: `${taskbarFontSize + 4}px`, height: `${taskbarFontSize + 4}px` }} />
                <span>Simulation</span>
              </div>
            </li>
          </ul>

          {/* Add Part Button with choice of quantity */}
          <div className="mt-5 border-t border-outline-variant/30 pt-5">
            <div className="flex justify-between items-center mb-2 px-1 font-mono" style={{ fontSize: `${taskbarFontSize - 1}px` }}>
              <span className="text-[#8e909a] uppercase tracking-wider">Conduit Queue:</span>
              <span className="text-emerald-400 font-bold">
                {intakeQueue.length} waiting
              </span>
            </div>

            {/* Quantity Selector Option */}
            <div className="flex items-center justify-between mb-2 bg-black/20 p-1.5 rounded border border-outline-variant/10 select-none font-mono" style={{ fontSize: `${taskbarFontSize - 2}px` }}>
              <span className="text-[#8e909a] uppercase font-bold">Add batch qty:</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={isNaN(partsToAddCount) || partsToAddCount === 0 ? "" : partsToAddCount}
                  onChange={(e) => {
                    const parsed = e.target.value === "" ? NaN : parseInt(e.target.value);
                    setPartsToAddCount(parsed);
                  }}
                  onBlur={() => {
                    if (isNaN(partsToAddCount) || partsToAddCount < 1) {
                      setPartsToAddCount(1);
                    } else if (partsToAddCount > 10000) {
                      setPartsToAddCount(10000);
                    }
                  }}
                  className="w-16 bg-[#10192e] border border-outline-variant/35 text-center py-1 rounded font-bold text-primary focus:outline-none focus:border-primary font-mono"
                  style={{ fontSize: `${taskbarFontSize - 1.5}px` }}
                />
                <span className="text-on-surface-variant lowercase">pcs</span>
              </div>
            </div>

            <button 
              type="button"
              onClick={handleAddPartToInShop}
              className="w-full flex items-center justify-center gap-2 rounded font-mono font-bold uppercase bg-emerald-500 hover:bg-emerald-400 text-slate-900 transition-all shadow-md active:scale-95 cursor-pointer select-none"
              style={{
                fontSize: `${taskbarFontSize}px`,
                paddingTop: `${Math.max(4, taskbarFontSize * 0.73)}px`,
                paddingBottom: `${Math.max(4, taskbarFontSize * 0.73)}px`,
              }}
            >
              <Plus className="text-slate-900 shrink-0" style={{ width: `${taskbarFontSize + 3}px`, height: `${taskbarFontSize + 3}px` }} />
              <span>Add Part</span>
            </button>
            
            {sysNotice && (
              <p className="mt-2.5 text-[10px] font-mono text-amber-300 bg-amber-500/10 border border-amber-500/20 p-2 rounded leading-relaxed text-center animate-pulse">
                {sysNotice}
              </p>
            )}
          </div>

        </div>

        {/* System Integrity display inside sidebar footer */}
        <div className="pt-4 border-t border-outline-variant/30 text-left">
          <span className="font-mono text-[8px] uppercase tracking-wider text-on-surface-variant opacity-60 block mb-0.5">Line Integrator State</span>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs text-[#adc6ff] font-bold font-mono">FLOW ACTIVE</span>
          </div>
        </div>
      </aside>
    )}

      {/* Main Simulation Viewport and interactive canvas Area */}
      <main className="flex-1 flex flex-col bg-surface-dim relative overflow-hidden select-none">
        
        {/* Infinite Navigation & Canvas Zoom floating controller - placed elegantly above the footer taskbar */}
        <div className="absolute bottom-16 right-6 z-20 bg-[#121c33]/92 border border-[#2d3a58]/45 px-3 py-1.5 rounded-lg backdrop-blur-sm shadow-xl flex items-center gap-3 select-none">
          {/* Quick Trigger viewport alignment coordinates reset */}
          <button 
            type="button"
            onClick={() => { setPanX(40); setPanY(10); setZoomLevel(0.95); }}
            className="text-on-surface-variant hover:text-primary transition-all text-[9px] uppercase font-mono font-bold tracking-tight cursor-pointer"
            title="Reset Pan & coordinates"
          >
            Reset Camera
          </button>
          <div className="h-3.5 w-px bg-outline-variant/30" />
          <div className="flex items-center gap-2">
            {/* Zoom Out Button option */}
            <button 
              type="button"
              onClick={handleZoomOut}
              disabled={zoomLevel <= 0.65}
              className="text-[#dae2fd] hover:text-primary transition-colors cursor-pointer disabled:opacity-40"
              title="Zoom Canvas Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            {/* Live Percent level Display */}
            <span className="font-mono text-xs font-bold text-primary min-w-[34px] text-center">
              {Math.round(zoomLevel * 100)}%
            </span>
            {/* Zoom In Button option */}
            <button 
              type="button"
              onClick={handleZoomIn}
              disabled={zoomLevel >= 1.8}
              className="text-[#dae2fd] hover:text-primary transition-colors cursor-pointer disabled:opacity-40"
              title="Zoom Canvas In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Draggable & Compact Simulator clock HUD */}
        {showTimerPopup && (
          <div 
            style={{ 
              position: 'absolute', 
              left: `${popupPos.x}px`, 
              top: `${popupPos.y}px`, 
              transform: clockHudScale === 'small' ? 'scale(0.8)' : 'none',
              transformOrigin: 'top left'
            }}
            className="w-[210px] bg-[#121c33]/92 backdrop-blur-md border border-primary/45 rounded-xl p-2.5 shadow-2xl z-30 select-none animate-in fade-in duration-300"
          >
            <div 
              onMouseDown={handlePopupMouseDown}
              className="flex justify-between items-center border-b border-outline-variant/30 pb-1 mb-1.5 cursor-grab active:cursor-grabbing hover:bg-white/5 p-0.5 -m-0.5 rounded-t-lg transition-colors"
            >
              <div className="flex items-center gap-1">
                <GripVertical className="w-2.5 h-2.5 text-on-surface-variant opacity-60 pointer-events-none" />
                <span className="font-mono text-[7px] uppercase tracking-wider text-[#dae2fd]/75 font-semibold pointer-events-none">CLOCK HUD</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setClockHudScale(prev => prev === 'normal' ? 'small' : 'normal')}
                  className="text-[7.5px] font-bold font-mono px-1 py-0.5 bg-primary/10 border border-primary/25 rounded hover:bg-primary/20 hover:border-primary/45 transition-all text-primary cursor-pointer uppercase select-none"
                  title={clockHudScale === 'normal' ? "Reduce scale to 80%" : "Restore full scale"}
                >
                  {clockHudScale === 'normal' ? "Compact" : "Normal"}
                </button>
                <button 
                  type="button" 
                  onClick={() => setShowTimerPopup(false)}
                  className="text-on-surface-variant hover:text-red-400 p-0.5 rounded transition-colors cursor-pointer"
                >
                  <X className="w-2.5" />
                </button>
              </div>
            </div>

            {/* Timer Output Display */}
            <div className="flex flex-col items-center justify-center bg-black/45 rounded-lg py-1 px-2 border border-outline-variant/15 mb-2 font-mono">
              <span className="text-[7px] text-on-surface-variant/50 uppercase tracking-widest mb-0.5 font-bold">Simulated Time</span>
              <span className="text-[15px] font-bold text-primary tracking-wider tabular-nums leading-none">
                {formatTime(simulatedElapsed)}
              </span>
              <span className="text-[7px] text-[#adc6ff]/70 font-semibold mt-0.5">{simSpeed}x Realtime</span>
            </div>

            {/* Speed Range Slider up to 1000x with a manual number input */}
            <div className="flex flex-col gap-1 mx-0.5 bg-black/20 p-1.5 rounded border border-outline-variant/10 select-none font-mono">
              <div className="flex justify-between items-center text-[7.5px] font-bold mb-0.5">
                <span className="text-on-surface-variant uppercase">Speed Rate</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    value={isNaN(simSpeed) || simSpeed === 0 ? "" : simSpeed}
                    onChange={(e) => {
                      const val = e.target.value === "" ? NaN : parseInt(e.target.value);
                      setSimSpeed(val);
                    }}
                    onBlur={() => {
                      if (isNaN(simSpeed) || simSpeed < 1) {
                        setSimSpeed(1);
                      } else {
                        setSimSpeed(Math.max(1, Math.min(1000, simSpeed)));
                      }
                    }}
                    className="w-12 bg-[#10192e] border border-outline-variant/30 text-center py-0.5 rounded text-[8px] text-primary font-bold focus:outline-none focus:border-primary"
                    title="Manual speed input"
                  />
                  <span className="text-primary font-extrabold text-[8px]">x</span>
                </div>
              </div>
              <input
                type="range"
                min="1"
                max="1000"
                step="1"
                value={simSpeed}
                onChange={(e) => {
                  setSimSpeed(parseInt(e.target.value) || 1);
                }}
                className="w-full accent-primary bg-[#131b2e] border border-[#2d3a58]/35 h-0.5 rounded-lg cursor-pointer"
              />
            </div>

            {/* Run state controls containing exactly 3 buttons: Start, Resume, or Stop */}
            <div className="mt-2 text-left font-mono">
              <label className="font-mono text-[7.5px] uppercase tracking-wider text-on-surface-variant opacity-85 font-bold block mb-1">
                Continuous Clock
              </label>
              <div className="grid grid-cols-3 gap-1">
                <button
                  type="button"
                  onClick={handleStartSimulation}
                  className={`font-mono text-[8px] py-1 rounded border transition-all cursor-pointer text-center font-bold uppercase bg-emerald-500/15 text-emerald-400 border-emerald-500 hover:bg-emerald-500/25`}
                  title="Resets all shop system timers and restarts clock from 0"
                >
                  Start
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsSimRunning(true);
                    setSysNotice('Simulation resumed.');
                    setTimeout(() => setSysNotice(null), 2000);
                  }}
                  disabled={isSimRunning}
                  className={`font-mono text-[8px] py-1 rounded border transition-all cursor-pointer text-center font-bold uppercase ${
                    isSimRunning
                      ? 'bg-blue-500/10 text-blue-400/50 border-blue-500/20 cursor-not-allowed'
                      : 'bg-blue-500/15 text-blue-400 border-blue-500 hover:bg-blue-500/25'
                  }`}
                  title="Resumes the existing simulation clock where it was left off"
                >
                  Resume
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsSimRunning(false);
                  }}
                  disabled={!isSimRunning}
                  className={`font-mono text-[8px] py-1 rounded border transition-all cursor-pointer text-center font-bold uppercase ${
                    !isSimRunning
                      ? 'bg-rose-500/10 text-rose-400/50 border-rose-500/20 cursor-not-allowed'
                      : 'bg-rose-500/15 text-rose-400 border-rose-500 hover:bg-rose-500/25'
                  }`}
                  title="Pauses the simulation without resetting elapsed time counters"
                >
                  Stop
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Global Control Monitor bar at the top */}
        <header className="px-6 py-3 border-b border-outline-variant/20 bg-surface-container-low/50 flex justify-between items-center shrink-0 z-10 text-left">
          <div className="flex items-center gap-3">
            {isSidebarHidden && (
              <button
                type="button"
                onClick={() => setIsSidebarHidden(false)}
                className="p-1.5 hover:bg-surface-container-high rounded text-on-surface hover:text-primary transition-colors cursor-pointer mr-1 shrink-0"
                title="Show Sidebar"
              >
                <Menu className="w-5 h-5" />
              </button>
            )}
            <span className="p-1 px-2.5 bg-emerald-500/10 text-emerald-400 font-mono text-[9px] rounded font-bold border border-emerald-500/25">
              FLOW DIAGRAM
            </span>
            <div className="flex flex-col">
              <h1 className="text-sm font-semibold text-on-surface">Live Workshop Simulator</h1>
              <p className="text-[10px] text-on-surface-variant mt-0.5">Drag shops to reorder, zoom canvas to focus, click HUD to lock clock speed.</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Show Detailed Preview Toggle Button */}
            <button
              type="button"
              onClick={() => setIsSimpleView(!isSimpleView)}
              className="text-[10px] text-primary hover:text-[#f8fafc] flex items-center gap-1.5 shrink-0 bg-[#132247] hover:bg-[#1c336b] border border-primary/30 hover:border-primary/50 rounded-lg px-3 py-1.5 font-mono select-none transition-all cursor-pointer uppercase tracking-wider font-bold"
            >
              <div className={`w-1.5 h-1.5 rounded-full ${isSimpleView ? 'bg-primary animate-pulse' : 'bg-emerald-400'}`} />
              <span>{isSimpleView ? "Show Detailed Preview" : "Show Simple Preview"}</span>
            </button>

            {/* Show HUD Toggle */}
            <button
              type="button"
              onClick={() => setShowTimerPopup(!showTimerPopup)}
              className={`px-3 py-2 border rounded-lg font-mono text-[10px] uppercase font-bold tracking-tight transition-colors cursor-pointer ${
                showTimerPopup 
                  ? 'bg-primary/10 border-primary/30 text-primary' 
                  : 'border-outline-variant/40 text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              TIMER HUD
            </button>
          </div>
        </header>

        {/* Dynamic Drag-Pan Canvas Container Frame */}
        <div 
          ref={canvasRef}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
          className="flex-1 w-full relative overflow-hidden bg-[#0d1527] cursor-grab active:cursor-grabbing select-none"
        >
          {/* Canvas Transform Wrapper block */}
          <div 
            style={{
              transform: `translate(${panX}px, ${panY}px) scale(${zoomLevel})`,
              transformOrigin: '0 0',
              position: 'absolute',
              width: '10000px',
              height: '10000px',
              left: 0,
              top: 0
            }}
            className="transition-transform duration-75 ease-out select-none"
          >
            {/* Background alignment blueprint board lines */}
            <div className="absolute inset-0 bg-[#0d1527] pointer-events-none" 
              style={{
                backgroundImage: 'radial-gradient(ellipse at center, rgba(16,28,54,0.3) 0%, rgba(9,15,28,0.5) 100%), linear-gradient(rgba(45,58,88,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(45,58,88,0.04) 1px, transparent 1px)',
                backgroundSize: '100% 100%, 40px 40px, 40px 40px'
              }}
            />

            {/* SVG Cable connections & progress animations layer */}
            <svg 
              className="absolute inset-0 pointer-events-none z-0" 
              style={{ width: '5000px', height: '5000px' }}
            >
              <defs>
                <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 Z" fill="#adc6ff" />
                </marker>
              </defs>

              {/* OUTSHOP output target path curve when OUTPUT shop exists */}
              {shops.map(s => {
                if (s.isOutputShop) {
                  const x1 = s.posX + getShopWidthPx(s) / 2;
                  const y1 = s.posY + 30;
                  const x2 = x1;
                  const y2 = 65;

                  return (
                    <g key={`out-conveyor-${s.id}`}>
                      {/* 1. Heavy Conveyor Frame Base */}
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        className="stroke-[#1e293b] stroke-[10] stroke-linecap-round opacity-90"
                      />
                      {/* 2. Inner Conveyor Belt Beltway Bed */}
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        className="stroke-[#0b0f19] stroke-[7] stroke-linecap-round"
                      />
                      {/* 3. Static Roller Slat Lines */}
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        className="stroke-[#475569]/30 stroke-[5] stroke-dasharray-[3_8]"
                      />
                      {/* 4. Active rollers movement animation */}
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        className="stroke-[#2a3042]/70 stroke-[5] stroke-dasharray-[8_16]"
                        style={{
                          strokeDashoffset: isSimRunning ? `${simulatedElapsed * 16}px` : '0px'
                        }}
                      />
                      {/* 5. Glowing directional conveyor flow arrows */}
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        className="stroke-orange-500/80 stroke-[2.5]"
                        style={{
                          strokeDasharray: '6 14',
                          strokeDashoffset: isSimRunning ? `${simulatedElapsed * 24}px` : '0px'
                        }}
                        markerEnd="url(#arrowhead)"
                      />
                    </g>
                  );
                }
                return null;
              })}

              {/* Draw animated physical conveyor belts with guide rollers, glowing arrows & conduits connecting the shops */}
              {simShops.map(ss => {
                const currentShop = shops.find(s => s.id === ss.id);
                if (!currentShop) return null;

                return ss.connections.map(targetId => {
                  const targetShop = shops.find(t => t.id === targetId);
                  if (!targetShop) return null;

                  const x1 = currentShop.posX + getShopWidthPx(currentShop) / 2;
                  const y1 = currentShop.posY + getShopHeightPx(currentShop) - 20;
                  const x2 = targetShop.posX + getShopWidthPx(targetShop) / 2;
                  const y2 = targetShop.posY + 30;

                  // Bezier curve calculations for a smooth conveyor flow path
                  const cy1 = y1 + (y2 - y1) / 2;
                  const cy2 = y1 + (y2 - y1) / 2;

                  return (
                    <g key={`flow-${ss.id}-${targetId}`}>
                      {/* 1. Heavy Conveyor Frame Base (outer metal border highlight) */}
                      <path
                        d={`M ${x1} ${y1} C ${x1} ${cy1}, ${x2} ${cy2}, ${x2} ${y2}`}
                        className="fill-none stroke-[#1e293b] stroke-[10] stroke-linecap-round opacity-90"
                      />
                      {/* 2. Inner Conveyor Belt Beltway Bed (the track itself) */}
                      <path
                        d={`M ${x1} ${y1} C ${x1} ${cy1}, ${x2} ${cy2}, ${x2} ${y2}`}
                        className="fill-none stroke-[#0b0f19] stroke-[7] stroke-linecap-round"
                      />
                      {/* 3. Static Roller Slat Lines across the track structure */}
                      <path
                        d={`M ${x1} ${y1} C ${x1} ${cy1}, ${x2} ${cy2}, ${x2} ${y2}`}
                        className="fill-none stroke-[#475569]/30 stroke-[5] stroke-dasharray-[3_8]"
                      />
                      {/* 4. Active rollers movement animation representing traction slats rotating */}
                      <path
                        d={`M ${x1} ${y1} C ${x1} ${cy1}, ${x2} ${cy2}, ${x2} ${y2}`}
                        className="fill-none stroke-[#2a3042]/70 stroke-[5] stroke-dasharray-[8_16]"
                        style={{
                          strokeDashoffset: isSimRunning ? `${-simulatedElapsed * 16}px` : '0px'
                        }}
                      />
                      {/* 5. Glowing directional conveyor flow arrows (neon guides that indicate active stream) */}
                      <path
                        d={`M ${x1} ${y1} C ${x1} ${cy1}, ${x2} ${cy2}, ${x2} ${y2}`}
                        className="fill-none stroke-[#38bdf8]/80 stroke-[2.5]"
                        style={{
                          strokeDasharray: '6 14',
                          strokeDashoffset: isSimRunning ? `${-simulatedElapsed * 24}px` : '0px'
                        }}
                        markerEnd="url(#arrowhead)"
                      />
                      {/* 6. Dynamic micro pulses running faster to add life to the flowing conveyor link */}
                      <path
                        d={`M ${x1} ${y1} C ${x1} ${cy1}, ${x2} ${cy2}, ${x2} ${y2}`}
                        className="fill-none stroke-[#38bdf8] stroke-[1]"
                        style={{
                          strokeDasharray: '2 40',
                          strokeDashoffset: isSimRunning ? `${-simulatedElapsed * 40}px` : '0px'
                        }}
                      />
                    </g>
                  );
                });
              })}

              {/* Dynamic Inbound intake conveyor belt drawings linked directly to Entrance Shop */}
              {shops.map(s => {
                if (s.isInputShop) {
                  const x1 = s.posX - 400;
                  const y1 = s.posY + 32;
                  const x2 = s.posX;
                  const y2 = y1;

                  return (
                    <g key={`intake-svg-cables-${s.id}`}>
                      {/* 1. Heavy Conveyor Frame Base */}
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        className="stroke-[#1e293b] stroke-[10] stroke-linecap-round opacity-90"
                      />
                      {/* 2. Inner Conveyor Belt Beltway Bed */}
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        className="stroke-[#0b0f19] stroke-[7] stroke-linecap-round"
                      />
                      {/* 3. Static Roller Slat Lines */}
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        className="stroke-[#475569]/30 stroke-[5] stroke-dasharray-[3_8]"
                      />
                      {/* 4. Active rollers movement animation */}
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        className="stroke-[#2a3042]/70 stroke-[5] stroke-dasharray-[8_16]"
                        style={{
                          strokeDashoffset: isSimRunning ? `${-simulatedElapsed * 16}px` : '0px'
                        }}
                      />
                      {/* 5. Glowing directional conveyor flow arrows */}
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        className="stroke-emerald-500/80 stroke-[2.5]"
                        style={{
                          strokeDasharray: '6 14',
                          strokeDashoffset: isSimRunning ? `${-simulatedElapsed * 24}px` : '0px'
                        }}
                        markerEnd="url(#arrowhead)"
                      />
                    </g>
                  );
                }
                return null;
              })}
            </svg>

            {/* Static Visual Inbound Intake Conveyor Box */}
            {shops.map(s => {
              if (s.isInputShop) {
                const beltX = -1000;
                const beltWidth = s.posX - beltX - 10;
                const beltY = s.posY + 16;

                return (
                  <div 
                    key={`intake-visual-belt-${s.id}`}
                    className="absolute bg-[#122a22]/60 border-y border-emerald-500/25 h-9 z-10 rounded-l flex items-center px-4 overflow-hidden select-none"
                    style={{
                      left: `${beltX}px`,
                      top: `${beltY}px`,
                      width: `${beltWidth}px`
                    }}
                  >
                    <div 
                      className="absolute inset-y-0 left-0 bg-[repeating-linear-gradient(90deg,transparent,transparent_20px,rgba(52,211,153,0.04)_20px,rgba(52,211,153,0.04)_40px)] pointer-events-none"
                      style={{
                        width: '3000px',
                        transform: isSimRunning ? `translateX(${(simulatedElapsed * 15) % 40}px)` : 'none'
                      }}
                    />
                    <div className="w-full text-right font-mono text-[8.5px] uppercase tracking-widest text-[#52d3a3]/65 font-black animate-pulse pr-4 select-none">
                      MAIN PRIMARY INTAKE CONVEYOR SYSTEM &gt;&gt;
                    </div>
                  </div>
                );
              }
              return null;
            })}

            {/* Visual intake queue parts waiting inside the conveyor belt */}
            {shops.map(s => {
              if (s.isInputShop) {
                return intakeQueue.slice(0, 30).map((qp, qIdx) => {
                  const itemX = s.posX - 38 - qIdx * 28;
                  const itemY = s.posY + 24;

                  if (itemX < -900) return null;

                  return (
                    <div
                      key={`intake-waiting-qp-${qp.id}`}
                      className="absolute z-20 pointer-events-none hover:scale-115 transition-all duration-300 drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
                      style={{
                        left: `${itemX}px`,
                        top: `${itemY}px`,
                      }}
                    >
                      {renderClipShape(qp.shape, qp.color)}
                    </div>
                  );
                });
              }
              return null;
            })}

            {/* Visually permanent Final Outbound production conveyor belt at top */}
            <div 
              style={{ top: '35px', left: '150px', width: '2000px' }}
              className="absolute bg-[#271d15]/50 border-y border-orange-400/25 h-7 z-0 flex items-center justify-between select-none overflow-hidden rounded-md"
            >
              <div 
                className="absolute inset-y-0 left-0 bg-[repeating-linear-gradient(90deg,transparent,transparent_18px,rgba(249,115,22,0.05)_18px,rgba(249,115,22,0.05)_36px)] w-[4000px] pointer-events-none" 
                style={{
                  transform: isSimRunning ? `translateX(${(simulatedElapsed * 15) % 36}px)` : 'none'
                }}
              />
              <span className="w-full text-center font-mono text-[7px] uppercase tracking-widest text-[#ffbf9d]/50 font-extrabold select-none">
                &gt;&gt; PRODUCTION CONVEYOR EXIT LINE &gt;&gt;
              </span>
            </div>
          </div>

            {/* Dynamic location for Outbound parts counter where final shop conveyor meets outbound conveyor line */}
            {(() => {
              const outShop = shops.find(s => s.isOutputShop);
              if (!outShop) return null;
              const targetX = outShop.posX + getShopWidthPx(outShop) / 2;
              return (
                <div 
                  className="absolute flex items-center gap-1.5 bg-orange-950/95 border border-orange-500/50 px-2.5 py-1 rounded text-[10px] font-mono text-orange-400 font-bold z-30 select-none shadow-[0_4px_16px_rgba(249,115,22,0.55)] whitespace-nowrap"
                  style={{
                    left: `${targetX}px`,
                    top: '20px',
                    transform: 'translate(-50%, -50%)'
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                  <span>OUTBOUND PARTS COUNTER: {conveyorExitCount}</span>
                </div>
              );
            })()}

            {/* --- Conveyor Segment Overlay Labels with Directional Conveyors -- */}
            {/* 1. Labeled inter-shop conveyor overlays */}
            {simShops.map(ss => {
              const currentShop = shops.find(s => s.id === ss.id);
              if (!currentShop) return null;

              return ss.connections.map(targetId => {
                const targetShop = shops.find(t => t.id === targetId);
                if (!targetShop) return null;

                const x1 = currentShop.posX + getShopWidthPx(currentShop) / 2;
                const y1 = currentShop.posY + getShopHeightPx(currentShop) - 20;
                const x2 = targetShop.posX + getShopWidthPx(targetShop) / 2;
                const y2 = targetShop.posY + 30;

                const midX = (x1 + x2) / 2;
                const midY = (y1 + y2) / 2;

                return (
                  <div 
                    key={`conveyor-lbl-${ss.id}-${targetId}`}
                    className="absolute bg-[#090f1d]/90 border border-sky-400/40 px-2.5 py-1 rounded-full text-[9.5px] font-mono font-bold text-[#38bdf8] select-none shadow-[0_4px_12px_rgba(0,0,0,0.7)] z-25 pointer-events-none flex items-center gap-1.5 whitespace-nowrap"
                    style={{
                      left: `${midX}px`,
                      top: `${midY}px`,
                      transform: 'translate(-50%, -50%)'
                    }}
                  >
                    <span>CONVEYOR:</span>
                    <span className="text-white font-extrabold">{currentShop.name} &rarr; {targetShop.name}</span>
                  </div>
                );
              });
            })}

            {/* 2. Labeled intake conveyor overlay */}
            {shops.map(s => {
              if (s.isInputShop) {
                const midX = s.posX - 220;
                const midY = s.posY + 32;

                return (
                  <div 
                    key={`conveyor-intake-lbl-${s.id}`}
                    className="absolute bg-[#0b1c17]/90 border border-emerald-500/40 px-2.5 py-1 rounded-full text-[9.5px] font-mono font-bold text-emerald-400 select-none shadow-[0_4px_12px_rgba(0,0,0,0.7)] z-25 pointer-events-none flex items-center gap-1.5 whitespace-nowrap"
                    style={{
                      left: `${midX}px`,
                      top: `${midY}px`,
                      transform: 'translate(-50%, -50%)'
                    }}
                  >
                    <span>INTAKE:</span>
                    <span className="text-white font-extrabold">CONVEYOR &rarr; {s.name}</span>
                  </div>
                );
              }
              return null;
            })}

            {/* 3. Labeled outbound conveyor overlay */}
            {shops.map(s => {
              if (s.isOutputShop) {
                const x1 = s.posX + getShopWidthPx(s) / 2;
                const midY = (s.posY + 30 + 65) / 2;

                return (
                  <div 
                    key={`conveyor-outbound-lbl-${s.id}`}
                    className="absolute bg-[#1e130b]/90 border border-orange-500/45 px-2.5 py-1 rounded-full text-[9.5px] font-mono font-bold text-orange-400 select-none shadow-[0_4px_12px_rgba(0,0,0,0.7)] z-25 pointer-events-none flex items-center gap-1.5 whitespace-nowrap"
                    style={{
                      left: `${x1}px`,
                      top: `${midY}px`,
                      transform: 'translate(-50%, -50%)'
                    }}
                  >
                    <span>OUTBOUND:</span>
                    <span className="text-white font-extrabold">{s.name} &rarr; EXIT</span>
                  </div>
                );
              }
              return null;
            })}

            {/* Flying parts visualization loop in transit */}
            {flyingParts.map(fp => {
              const isStationTransfer = typeof fp.toId === 'string' && fp.toId.includes('-');

              // In detailed preview, station-to-station transfers move only inside the conveyor components
              if (!isSimpleView && isStationTransfer) {
                return null;
              }

              let startX = fp.startX;
              let startY = fp.startY;
              let endX = fp.endX;
              let endY = fp.endY;

              if (isSimpleView) {
                // Determine the current positions of shops and stations dynamically
                const isFromImport = fp.fromId === 'import_conveyor';
                const shop = isFromImport ? shops.find(s => s.isInputShop) : shops.find(s => s.id === fp.fromId);
                const headerHeight = 53;

                if (isFromImport) {
                  if (shop) {
                    const targetStPos = stationPositions[fp.toId] || getDefaultStationPos(fp.toId as string, shop.id);
                    startX = shop.posX - 15;
                    startY = shop.posY + 24;
                    endX = shop.posX + targetStPos.x;
                    endY = shop.posY + headerHeight + targetStPos.y + 37.5;
                  }
                } else if (isStationTransfer && fp.fromStationId) {
                  // Moving station-to-station in current shop
                  if (shop) {
                    const sourceStPos = stationPositions[fp.fromStationId] || getDefaultStationPos(fp.fromStationId, fp.fromId);
                    const targetStPos = stationPositions[fp.toId] || getDefaultStationPos(fp.toId as string, fp.fromId);

                    startX = shop.posX + sourceStPos.x + 55;
                    startY = shop.posY + headerHeight + sourceStPos.y + 37.5;
                    endX = shop.posX + targetStPos.x + 55;
                    endY = shop.posY + headerHeight + targetStPos.y + 37.5;
                  }
                } else if (fp.toId === 'conveyor') {
                  // Exit from final shop to outbound conveyor
                  if (shop) {
                    startX = shop.posX + getShopWidthPx(shop) / 2;
                    startY = shop.posY + 15;
                    endX = startX;
                    endY = 49;
                  }
                } else if (fp.toId === 'outbound_belt') {
                  // Outbound belt movement
                  if (shop) {
                    startX = shop.posX + getShopWidthPx(shop) / 2;
                  }
                  startY = 49;
                  endX = startX + 600;
                  endY = 49;
                } else if (typeof fp.toId === 'number') {
                  // Shop-to-shop transition
                  const targetShopObj = shops.find(s => s.id === fp.toId);
                  if (shop && targetShopObj) {
                    startX = shop.posX + getShopWidthPx(shop) / 2;
                    startY = shop.posY + getShopHeightPx(shop) - 20;
                    endX = targetShopObj.posX + getShopWidthPx(targetShopObj) / 2;
                    endY = targetShopObj.posY + 30;
                  }
                }
              }

              let currentX = startX;
              let currentY = startY;

              if (fp.toId === 'conveyor') {
                currentX = startX;
                currentY = startY + (endY - startY) * (fp.progress / 100);
              } else if (fp.toId === 'outbound_belt') {
                currentX = startX + (endX - startX) * (fp.progress / 100);
                currentY = startY;
              } else if (isStationTransfer) {
                if (isSimpleView && fp.fromStationId && typeof fp.fromId === 'number') {
                  const mergePt = getMergePointForStationSimple(fp.fromStationId, fp.fromId);
                  if (mergePt) {
                    const shop = shops.find(s => s.id === fp.fromId);
                    const headerHeight = 53;
                    if (shop) {
                      const mX = shop.posX + mergePt.x;
                      const mY = shop.posY + headerHeight + mergePt.y;

                      if (fp.progress < 50) {
                        const t = fp.progress / 50;
                        currentX = startX + (mX - startX) * t;
                        currentY = startY + (mY - startY) * t;
                      } else {
                        const t = (fp.progress - 50) / 50;
                        currentX = mX + (endX - mX) * t;
                        currentY = mY + (endY - mY) * t;
                      }
                    } else {
                      const t = fp.progress / 100;
                      currentX = startX + (endX - startX) * t;
                      currentY = startY + (endY - startY) * t;
                    }
                  } else {
                    const t = fp.progress / 100;
                    currentX = startX + (endX - startX) * t;
                    currentY = startY + (endY - startY) * t;
                  }
                } else {
                  const t = fp.progress / 100;
                  currentX = startX + (endX - startX) * t;
                  currentY = startY + (endY - startY) * t;
                }
              } else {
                const cy1 = startY + (endY - startY) / 2;
                const cy2 = startY + (endY - startY) / 2;

                const t = fp.progress / 100;
                currentX = (1 - t) * (1 - t) * (1 - t) * startX + 3 * (1 - t) * (1 - t) * t * startX + 3 * (1 - t) * t * t * endX + t * t * t * endX;
                currentY = (1 - t) * (1 - t) * (1 - t) * startY + 3 * (1 - t) * (1 - t) * t * cy1 + 3 * (1 - t) * t * t * cy2 + t * t * t * endY;
              }

              const isOnOutbound = fp.toId === 'conveyor' || fp.toId === 'outbound_belt';
              const scaleClass = isSimpleView ? (isOnOutbound ? 'scale-110' : 'scale-[0.5]') : 'scale-110';

              return (
                <div
                  key={`flying-${fp.id}`}
                  style={{
                    position: 'absolute',
                    left: `${currentX - 10}px`,
                    top: `${currentY - 10}px`,
                    transition: 'none',
                    zIndex: 40
                  }}
                  className={`pointer-events-none drop-shadow-lg transition-transform ${scaleClass}`}
                >
                  {renderClipShape(fp.shape, fp.color)}
                </div>
              );
            })}

            {/* Interactive Shop cards */}
            {shops.map(shop => {
              const ssState = simShops.find(ss => ss.id === shop.id);
              const totalDone = processedCounts[shop.id] || 0;

              return (
                <div
                  key={shop.id}
                  style={{
                    position: 'absolute',
                    left: `${shop.posX}px`,
                    top: `${shop.posY}px`,
                    width: `${getShopWidthPx(shop)}px`,
                    height: `${getShopHeightPx(shop)}px`,
                    zIndex: isDraggingCardRef.current === shop.id ? 50 : 20,
                  }}
                  className={`bg-[#0d162a]/92 border rounded-2xl shadow-xl flex flex-col justify-between overflow-hidden cursor-default transition-all select-none ${
                    isDraggingCardRef.current === shop.id 
                      ? 'border-primary ring-2 ring-primary/30 shadow-2xl scale-[1.02]' 
                      : 'border-[#2d3a58]/60 hover:border-[#adc6ff]/50'
                  }`}
                >
                  {/* Card Draggable Header */}
                  <header 
                    onMouseDown={(e) => handleCardDragStart(e, shop.id, shop.posX, shop.posY)}
                    className="p-3 bg-[#111c34] border-b border-outline-variant/30 flex flex-col gap-1.5 cursor-move select-none"
                    title="Drag to reposition card"
                  >
                    <div className="flex justify-between items-center w-full">
                      <div className="flex items-center gap-1.5 shrink-0">
                        <div className="flex flex-col gap-0.5 opacity-60">
                          <div className="w-1.5 h-px bg-on-surface-variant" />
                          <div className="w-1.5 h-px bg-on-surface-variant" />
                          <div className="w-1.5 h-px bg-on-surface-variant" />
                        </div>
                        <span className="font-mono text-xs font-black uppercase text-primary tracking-wide">
                          {shop.name}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 select-none">
                        {shop.isInputShop && (
                          <span className="bg-emerald-500/10 text-emerald-400 font-bold font-sans text-[8px] px-1.5 py-0.5 rounded border border-emerald-500/20">
                            IN
                          </span>
                        )}
                        {shop.isOutputShop && (
                          <span className="bg-sky-500/10 text-sky-400 font-bold font-sans text-[8px] px-1.5 py-0.5 rounded border border-sky-500/15">
                            OUT
                          </span>
                        )}
                        <span className="font-mono text-[8px] text-on-surface-variant font-bold opacity-50 tracking-wide">
                          ID: {shop.id}
                        </span>
                      </div>
                    </div>
                  </header>

                  {/* Stations list with conditional Simple / Detailed layout formats */}
                  {isSimpleView ? (
                    /* Simple View: Stations are miniature shop-formatted boxes, absolutely positioned, draggable with animated SVG conveyors */
                    <div className="p-3 flex-1 relative overflow-hidden bg-[#050a14]/90 min-h-[195px] select-none text-left">
                      {/* Conveyors SVG connector canvas */}
                      <svg className="absolute inset-0 w-full h-full pointer-events-none z-0 overflow-visible">
                        <defs>
                          <marker
                            id={`arrow-idle-${shop.id}`}
                            viewBox="0 0 10 10"
                            refX="8"
                            refY="5"
                            markerWidth="6"
                            markerHeight="6"
                            orient="auto-start-reverse"
                          >
                            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#38bdf8" />
                          </marker>
                          <marker
                            id={`arrow-flowing-${shop.id}`}
                            viewBox="0 0 10 10"
                            refX="8"
                            refY="5"
                            markerWidth="6"
                            markerHeight="6"
                            orient="auto-start-reverse"
                          >
                            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#10b981" />
                          </marker>
                        </defs>
                        <style>{`
                          @keyframes stroke-flow {
                            to {
                              stroke-dashoffset: -16;
                            }
                          }
                        `}</style>
                        {(() => {
                          if (!ssState?.stations) return null;

                          return ssState.stations.flatMap((st, sIdx) => {
                            const currentPos = stationPositions[st.id] || getDefaultStationPos(st.id, shop.id);
                            const startX = currentPos.x + 55;
                            const startY = currentPos.y + 37.5;

                            const targetSuccessor = st.successor || (sIdx === ssState.stations.length - 1 ? "exit" : ssState.stations[sIdx + 1]?.id || "exit");
                            const isFlowing = isSimRunning && st.parts.length > 0;

                            // Determine end targets
                            let endX = 0;
                            let endY = 0;
                            const isExit = targetSuccessor === "exit";

                            if (isExit) {
                              endX = getShopWidthPx(shop) / 2;
                              const headerHeight = 53;
                              endY = shop.isOutputShop ? -23 : getShopHeightPx(shop) - 20 - headerHeight;
                            } else {
                              const succStation = ssState.stations.find(station => station.id === targetSuccessor);
                              if (!succStation) return [];
                              const succPos = stationPositions[succStation.id] || getDefaultStationPos(succStation.id, shop.id);
                              endX = succPos.x + 55;
                              endY = succPos.y + 37.5;
                            }

                            // 1. Identify if this is an import station receiving from the import conveyor
                            const hasPredecessor = ssState.stations.some((other, oIdx) => {
                              const succ = other.successor || (oIdx === ssState.stations.length - 1 ? "exit" : ssState.stations[oIdx + 1]?.id || "exit");
                              return succ === st.id;
                            });
                            const isImportStation = shop.isInputShop && !hasPredecessor;

                            const elements: React.JSX.Element[] = [];

                            if (isImportStation) {
                              const importStartX = -25;
                              const importStartY = 24;
                              const importEndX = currentPos.x;
                              const importEndY = currentPos.y + 37.5;
                              const isImportActive = isSimRunning && (flyingParts.some(fp => fp.toId === st.id && fp.fromId === 'import_conveyor') || st.parts.length > 0);

                              elements.push(
                                <g key={`flow-import-${st.id}`}>
                                  {/* Heavy border */}
                                  <path
                                    d={`M ${importStartX} ${importStartY} L ${importEndX} ${importEndY}`}
                                    stroke="#3b0764"
                                    strokeWidth="8"
                                    strokeLinecap="round"
                                    fill="none"
                                    opacity="0.85"
                                  />
                                  {/* Inner channel */}
                                  <path
                                    d={`M ${importStartX} ${importStartY} L ${importEndX} ${importEndY}`}
                                    stroke="#0b0f19"
                                    strokeWidth="5.5"
                                    strokeLinecap="round"
                                    fill="none"
                                  />
                                  {/* Rotating traction slots */}
                                  <path
                                    d={`M ${importStartX} ${importStartY} L ${importEndX} ${importEndY}`}
                                    stroke="#c084fc"
                                    strokeWidth="3"
                                    strokeDasharray="4 8"
                                    fill="none"
                                    opacity="0.65"
                                    style={{
                                      strokeDashoffset: isSimRunning ? `${simulatedElapsed * 14}px` : '0px'
                                    }}
                                  />
                                  {/* Glowing flow */}
                                  <path
                                    d={`M ${importStartX} ${importStartY} L ${importEndX} ${importEndY}`}
                                    stroke={isImportActive ? "#d946ef" : "#8b5cf6"}
                                    strokeWidth="2.2"
                                    fill="none"
                                    opacity="0.95"
                                    strokeDasharray="5 5"
                                    style={{
                                      animation: isImportActive ? 'stroke-flow 0.8s linear infinite' : 'none'
                                    }}
                                  />
                                </g>
                              );
                            }

                            // Call our helper to see if this path merges
                            const mergePt = getMergePointForStationSimple(st.id, shop.id);

                            if (mergePt) {
                              // We have a merge point!
                              // 1. Draw the branch from the station to the merge point
                              const dx = mergePt.x - startX;
                              const dy = mergePt.y - startY;
                              const dist = Math.sqrt(dx * dx + dy * dy);

                              let finalStartX = startX;
                              let finalStartY = startY;

                              if (dist > 50) {
                                const ux = dx / dist;
                                const uy = dy / dist;
                                const tX = ux !== 0 ? 55 / Math.abs(ux) : Infinity;
                                const tY = uy !== 0 ? 37.5 / Math.abs(uy) : Infinity;
                                const tStart = Math.min(tX, tY);

                                finalStartX = startX + ux * (tStart + 4);
                                finalStartY = startY + uy * (tStart + 4);
                              }

                              const finalEndX = mergePt.x;
                              const finalEndY = mergePt.y;

                              // Find all sources for this target
                              const targetSources = ssState.stations.filter(s => {
                                const idx = ssState.stations.findIndex(item => item.id === s.id);
                                const succ = s.successor || (idx === ssState.stations.length - 1 ? "exit" : ssState.stations[idx + 1]?.id || "exit");
                                return succ === targetSuccessor;
                              });
                              const firstInMerge = targetSources[0].id === st.id;
                              const isAnyFlowing = targetSources.some(item => isSimRunning && item.parts.length > 0);

                              elements.push(
                                <g key={`flow-branch-${st.id}`}>
                                  {/* Branch metal border */}
                                  <path
                                    d={`M ${finalStartX} ${finalStartY} L ${finalEndX} ${finalEndY}`}
                                    stroke="#1e293b"
                                    strokeWidth="5"
                                    strokeLinecap="round"
                                    fill="none"
                                    opacity="0.9"
                                  />
                                  {/* Branch inner track */}
                                  <path
                                    d={`M ${finalStartX} ${finalStartY} L ${finalEndX} ${finalEndY}`}
                                    stroke="#0b0f19"
                                    strokeWidth="3.5"
                                    strokeLinecap="round"
                                    fill="none"
                                  />
                                  {/* Branch rolling traction */}
                                  <path
                                    d={`M ${finalStartX} ${finalStartY} L ${finalEndX} ${finalEndY}`}
                                    stroke="#2a3042"
                                    strokeWidth="2.2"
                                    strokeDasharray="4 8"
                                    fill="none"
                                    opacity="0.7"
                                    style={{
                                      strokeDashoffset: isSimRunning ? `${simulatedElapsed * 10}px` : '0px'
                                    }}
                                  />
                                  {/* Branch neon flow */}
                                  <path
                                    d={`M ${finalStartX} ${finalStartY} L ${finalEndX} ${finalEndY}`}
                                    stroke={isFlowing ? "#10b981" : "#38bdf8"}
                                    strokeWidth="1.5"
                                    fill="none"
                                    opacity="0.75"
                                    strokeDasharray="4 5"
                                    style={{
                                      animation: isFlowing ? 'stroke-flow 1.2s linear infinite' : 'none'
                                    }}
                                  />

                                  {/* 2. Draw the single merged trunk line from merge point to target (drawn only once per target group) */}
                                  {firstInMerge && (() => {
                                    let trunkEndX = endX;
                                    let trunkEndY = endY;

                                    if (!isExit) {
                                      const sdx = endX - mergePt.x;
                                      const sdy = endY - mergePt.y;
                                      const sdist = Math.sqrt(sdx * sdx + sdy * sdy);
                                      if (sdist > 10) {
                                        const sux = sdx / sdist;
                                        const suy = sdy / sdist;
                                        const tX2 = sux !== 0 ? 55 / Math.abs(-sux) : Infinity;
                                        const tY2 = suy !== 0 ? 37.5 / Math.abs(-suy) : Infinity;
                                        const tEnd = Math.min(tX2, tY2);
                                        trunkEndX = endX - sux * (tEnd + 10);
                                        trunkEndY = endY - suy * (tEnd + 10);
                                      }
                                    }

                                    if (isExit) {
                                      return (
                                        <g key={`flow-trunk-${targetSuccessor}`}>
                                          <path
                                            d={`M ${mergePt.x} ${mergePt.y} L ${trunkEndX} ${trunkEndY}`}
                                            stroke="#431407"
                                            strokeWidth="8"
                                            strokeLinecap="round"
                                            fill="none"
                                            opacity="0.8"
                                          />
                                          <path
                                            d={`M ${mergePt.x} ${mergePt.y} L ${trunkEndX} ${trunkEndY}`}
                                            stroke="#0b0f19"
                                            strokeWidth="5"
                                            strokeLinecap="round"
                                            fill="none"
                                          />
                                          <path
                                            d={`M ${mergePt.x} ${mergePt.y} L ${trunkEndX} ${trunkEndY}`}
                                            stroke="#2a1205"
                                            strokeWidth="3.5"
                                            strokeDasharray="4 8"
                                            fill="none"
                                            opacity="0.7"
                                            style={{
                                              strokeDashoffset: isSimRunning ? `${simulatedElapsed * 14}px` : '0px'
                                            }}
                                          />
                                          <path
                                            d={`M ${mergePt.x} ${mergePt.y} L ${trunkEndX} ${trunkEndY}`}
                                            stroke={isAnyFlowing ? "#f97316" : "#fb923c"}
                                            strokeWidth="2"
                                            fill="none"
                                            opacity="0.9"
                                            strokeDasharray="5 5"
                                            style={{
                                              animation: isAnyFlowing ? 'stroke-flow 0.8s linear infinite' : 'none'
                                            }}
                                          />
                                        </g>
                                      );
                                    }

                                    return (
                                      <g key={`flow-trunk-${targetSuccessor}`}>
                                        {/* Heavy metal border */}
                                        <path
                                          d={`M ${mergePt.x} ${mergePt.y} L ${trunkEndX} ${trunkEndY}`}
                                          stroke="#1e293b"
                                          strokeWidth="7"
                                          strokeLinecap="round"
                                          fill="none"
                                          opacity="0.95"
                                        />
                                        {/* Inner beltway */}
                                        <path
                                          d={`M ${mergePt.x} ${mergePt.y} L ${trunkEndX} ${trunkEndY}`}
                                          stroke="#0b0f19"
                                          strokeWidth="5"
                                          strokeLinecap="round"
                                          fill="none"
                                        />
                                        {/* Traction slats */}
                                        <path
                                          d={`M ${mergePt.x} ${mergePt.y} L ${trunkEndX} ${trunkEndY}`}
                                          stroke="#2a3042"
                                          strokeWidth="3.5"
                                          strokeDasharray="5 10"
                                          fill="none"
                                          opacity="0.75"
                                          style={{
                                            strokeDashoffset: isSimRunning ? `${simulatedElapsed * 12}px` : '0px'
                                          }}
                                        />
                                        {/* Neon conveyor line */}
                                        <path
                                          d={`M ${mergePt.x} ${mergePt.y} L ${trunkEndX} ${trunkEndY}`}
                                          stroke={isAnyFlowing ? "#10b981" : "#38bdf8"}
                                          strokeWidth="1.8"
                                          fill="none"
                                          opacity="0.85"
                                          strokeDasharray="5 6"
                                          style={{
                                            animation: isAnyFlowing ? 'stroke-flow 1.2s linear infinite' : 'none'
                                          }}
                                          markerEnd={!isExit ? (isAnyFlowing ? `url(#arrow-flowing-${shop.id})` : `url(#arrow-idle-${shop.id})`) : undefined}
                                        />
                                      </g>
                                    );
                                  })()}
                                </g>
                              );
                            } else {
                              // Standard straight line conveyor (no merge needed)
                              const dx = endX - startX;
                              const dy = endY - startY;
                              const dist = Math.sqrt(dx * dx + dy * dy);

                              let finalStartX = startX;
                              let finalStartY = startY;
                              let finalEndX = endX;
                              let finalEndY = endY;

                              if (dist > 70) {
                                const ux = dx / dist;
                                const uy = dy / dist;

                                // Clip to source box (110x75)
                                const tX1 = ux !== 0 ? 55 / Math.abs(ux) : Infinity;
                                const tY1 = uy !== 0 ? 37.5 / Math.abs(uy) : Infinity;
                                const tStart = Math.min(tX1, tY1);

                                finalStartX = startX + ux * (tStart + 4);
                                finalStartY = startY + uy * (tStart + 4);

                                // Clip to target box if not exiting
                                if (!isExit) {
                                  const tX2 = ux !== 0 ? 55 / Math.abs(-ux) : Infinity;
                                  const tY2 = uy !== 0 ? 37.5 / Math.abs(-uy) : Infinity;
                                  const tEnd = Math.min(tX2, tY2);

                                  finalEndX = endX - ux * (tEnd + 10);
                                  finalEndY = endY - uy * (tEnd + 10);
                                }
                              }

                              if (isExit) {
                                elements.push(
                                  <g key={`flow-straight-exit-${st.id}`}>
                                    {/* Heavy border */}
                                    <path
                                      d={`M ${finalStartX} ${finalStartY} L ${endX} ${endY}`}
                                      stroke="#431407"
                                      strokeWidth="8"
                                      strokeLinecap="round"
                                      fill="none"
                                      opacity="0.8"
                                    />
                                    {/* Inner channel */}
                                    <path
                                      d={`M ${finalStartX} ${finalStartY} L ${endX} ${endY}`}
                                      stroke="#0b0f19"
                                      strokeWidth="5"
                                      strokeLinecap="round"
                                      fill="none"
                                    />
                                    {/* Roller Slats */}
                                    <path
                                      d={`M ${finalStartX} ${finalStartY} L ${endX} ${endY}`}
                                      stroke="#2a1205"
                                      strokeWidth="3.5"
                                      strokeDasharray="4 8"
                                      fill="none"
                                      opacity="0.7"
                                      style={{
                                        strokeDashoffset: isSimRunning ? `${simulatedElapsed * 14}px` : '0px'
                                      }}
                                    />
                                    {/* Glowing flow */}
                                    <path
                                      d={`M ${finalStartX} ${finalStartY} L ${endX} ${endY}`}
                                      stroke={isFlowing ? "#f97316" : "#fb923c"}
                                      strokeWidth="2"
                                      fill="none"
                                      opacity="0.9"
                                      strokeDasharray="5 5"
                                      style={{
                                        animation: isFlowing ? 'stroke-flow 0.8s linear infinite' : 'none'
                                      }}
                                    />
                                  </g>
                                );
                              } else {
                                elements.push(
                                  <g key={`flow-straight-${st.id}-${targetSuccessor}`}>
                                    {/* Heavy metal border */}
                                    <path
                                      d={`M ${finalStartX} ${finalStartY} L ${finalEndX} ${finalEndY}`}
                                      stroke="#1e293b"
                                      strokeWidth="7"
                                      strokeLinecap="round"
                                      fill="none"
                                      opacity="0.9"
                                    />
                                    {/* Inner beltway */}
                                    <path
                                      d={`M ${finalStartX} ${finalStartY} L ${finalEndX} ${finalEndY}`}
                                      stroke="#0b0f19"
                                      strokeWidth="5"
                                      strokeLinecap="round"
                                      fill="none"
                                    />
                                    {/* Static Roller Slat Lines */}
                                    <path
                                      d={`M ${finalStartX} ${finalStartY} L ${finalEndX} ${finalEndY}`}
                                      stroke="#475569"
                                      strokeWidth="3.5"
                                      strokeDasharray="2 5"
                                      fill="none"
                                      opacity="0.25"
                                    />
                                    {/* Active rollers */}
                                    <path
                                      d={`M ${finalStartX} ${finalStartY} L ${finalEndX} ${finalEndY}`}
                                      stroke="#2a3042"
                                      strokeWidth="3.5"
                                      strokeDasharray="5 10"
                                      fill="none"
                                      opacity="0.7"
                                      style={{
                                        strokeDashoffset: isSimRunning ? `${simulatedElapsed * 12}px` : '0px'
                                      }}
                                    />
                                    {/* Neon conveyor line */}
                                    <path
                                      d={`M ${finalStartX} ${finalStartY} L ${finalEndX} ${finalEndY}`}
                                      stroke={isFlowing ? "#10b981" : "#38bdf8"}
                                      strokeWidth="1.8"
                                      fill="none"
                                      opacity="0.75"
                                      strokeDasharray="5 6"
                                      style={{
                                        animation: isFlowing ? 'stroke-flow 1.2s linear infinite' : 'none'
                                      }}
                                      markerEnd={isFlowing ? `url(#arrow-flowing-${shop.id})` : `url(#arrow-idle-${shop.id})`}
                                    />
                                  </g>
                                );
                              }
                            }

                            return elements;
                          });
                        })()}
                      </svg>

                      {ssState?.stations.map((st) => {
                        const currentCoords = stationPositions[st.id] || getDefaultStationPos(st.id, shop.id);
                        const occupancy = Math.max(0, st.parts.length - 1);
                        const isStBusy = st.parts.length > 0;
                        const progressPct = isStBusy ? (1 - st.currentCountdown / st.cycleTime) * 100 : 0;

                        return (
                          <div
                            key={st.id}
                            onMouseDown={(e) => handleStationMouseDown(e, st.id, shop.id)}
                            style={{
                              position: 'absolute',
                              left: `${currentCoords.x}px`,
                              top: `${currentCoords.y}px`,
                              width: '110px',
                              height: '75px',
                              zIndex: isDraggingStationRef.current === st.id ? 40 : 10,
                            }}
                            className={`bg-[#0d162a]/95 border rounded-xl shadow-md flex flex-col justify-between overflow-hidden cursor-grab active:cursor-grabbing select-none transition-all ${
                              isDraggingStationRef.current === st.id
                                ? 'border-primary ring-2 ring-primary/30 shadow-lg scale-[1.02]'
                                : 'border-[#2d3a58]/80 hover:border-primary/50'
                            }`}
                            title="Drag to rearrange station layout inside this shop"
                          >
                            {/* Miniature Shop Header look for Station */}
                            <header className="px-2 py-1 bg-[#111c34] border-b border-outline-variant/20 flex justify-between items-center text-[8.5px] uppercase font-bold tracking-wider text-primary select-none pointer-events-none truncate">
                              <div className="flex items-center gap-1 truncate max-w-[70px]">
                                <GripVertical className="w-1.5 h-1.5 text-on-surface-variant/40 shrink-0" />
                                <span className="truncate">{st.name}</span>
                              </div>
                            </header>

                            {/* Miniature Shop Body look for Station */}
                            <div className="p-1 px-1.5 flex-1 flex flex-col justify-between text-[8px] font-mono leading-tight">
                              <div className="flex justify-between items-center text-on-surface-variant/80">
                                <span>Cycle: {st.cycleTime}s</span>
                                <span className={st.parts.length > 0 ? "text-emerald-400 font-bold" : "text-sky-400 font-semibold"}>
                                  [{occupancy}/{st.bufferSize}]
                                </span>
                              </div>

                              {/* Active queue display */}
                              <div className="flex items-center gap-1 bg-black/40 border border-[#232f4c]/30 rounded px-1 py-0.5 mt-0.5 select-none pointer-events-none">
                                {st.parts.length > 0 ? (
                                  <div className="flex items-center gap-1 justify-between w-full">
                                    <div className="scale-75 origin-left shrink-0">
                                      {renderClipShape(st.parts[0].shape, st.parts[0].color)}
                                    </div>
                                    <span className="text-[7.5px] text-[#f1f5f9] font-black truncate max-w-[50px] uppercase">
                                      {st.parts[0].id}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-[7.5px] text-on-surface-variant/20 lowercase mx-auto">idle</span>
                                )}
                              </div>
                            </div>

                            {/* Miniature Progress Bar at absolute bottom of station box */}
                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#10192e] overflow-hidden">
                              {isStBusy && (
                                <div 
                                  className="h-full bg-primary/90 transition-all duration-100 ease-linear"
                                  style={{ width: `${progressPct}%` }}
                                />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    /* Detailed View layout format */
                    <div className="p-3 flex-1 overflow-y-auto space-y-2 text-left pb-1">
                      {ssState?.stations.map((st, sIdx) => {
                        const isStBusy = st.parts.length > 0;
                        const activePart = st.parts[0];
                        const occupancy = Math.max(0, st.parts.length - 1);
                        const progressPct = isStBusy ? (1 - st.currentCountdown / st.cycleTime) * 100 : 0;

                        const targetSuccessor = st.successor || (sIdx === (ssState?.stations?.length || 0) - 1 ? "exit" : ssState?.stations?.[sIdx + 1]?.id || "exit");
                        const targetSuccessorName = targetSuccessor === "exit"
                          ? (shop.isOutputShop ? "Outbound Conveyor" : "Next Shop")
                          : (ssState?.stations?.find(station => station.id === targetSuccessor)?.name || "Next");

                        return (
                          <React.Fragment key={st.id}>
                            <div 
                              draggable={true}
                              onDragStart={(e) => handleStationDragStart(e, shop.id, sIdx)}
                              onDragOver={(e) => handleStationDragOver(e, sIdx)}
                              onDrop={(e) => handleStationDrop(e, shop.id, sIdx)}
                              onDragEnd={handleStationDragEnd}
                              className={`border border-[#1f2d4d]/65 rounded-lg p-1.5 bg-[#10192e]/40 hover:bg-[#10192e]/70 transition-all flex flex-col gap-1 text-left cursor-grab active:cursor-grabbing ${
                                draggedStationIdx === sIdx && draggedStationShopId === shop.id
                                  ? 'opacity-30 border-dashed border-primary ring-1 ring-primary/40 scale-[0.98]'
                                  : ''
                              }`}
                            >
                              {/* Inner Station indicator block */}
                              <div className="flex items-center justify-between text-[10px] font-mono select-none">
                                <div className="flex items-center gap-1 flex-wrap">
                                  <GripVertical className="w-2.5 h-2.5 text-on-surface-variant/40 shrink-0 select-none pointer-events-none" />
                                  <span className="font-bold text-[#b4c3f1]">{st.name}</span>
                                  <span className="text-[8px] opacity-40">| {st.cycleTime}s</span>
                                  <span className="text-[7.5px] font-bold text-sky-400 bg-sky-500/10 px-1.5 py-0.2 rounded border border-sky-500/20 flex items-center gap-0.5" title={`Conveyor Link: ${st.id} ➔ ${targetSuccessor}`}>
                                    <span className={`w-1 h-1 rounded-full bg-sky-400 ${isSimRunning && st.parts.length > 0 ? "animate-pulse" : "opacity-60"}`}></span>
                                    <span>{st.id}&rarr;{targetSuccessor}</span>
                                  </span>
                                  <span className="text-[7px] font-bold text-emerald-400 bg-emerald-500/10 px-1 py-0.2 rounded border border-emerald-500/15" title="Routing Destination">
                                    &rarr; {
                                      (st.successor || (sIdx === (ssState?.stations?.length || 0) - 1 ? "exit" : ssState?.stations?.[sIdx + 1]?.id || "exit")) === "exit"
                                        ? (shop.isOutputShop ? "Exit" : "Next")
                                        : (ssState?.stations?.find(station => station.id === (st.successor || ssState?.stations?.[sIdx + 1]?.id))?.name || "Next")
                                    }
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0 font-bold text-[8.5px]">
                                  <span className="text-[#38bdf8]" title="Total parts exited this station">
                                    ({st.partsExitedCount || 0} Exited)
                                  </span>
                                  <span className="text-[#adc6ff]">
                                    [{occupancy}/{st.bufferSize}]
                                  </span>
                                </div>
                              </div>

                              {/* Active part queue item */}
                              <div className="min-h-[28px] flex items-center bg-black/25 border border-[#2d3a58]/35 rounded-md p-1 relative overflow-hidden text-left">
                                {isStBusy ? (
                                  <div className="flex items-center gap-1.5 w-full select-none text-left">
                                    <div className="shrink-0 scale-90">
                                      {renderClipShape(activePart.shape, activePart.color)}
                                    </div>
                                    <div className="flex-1 flex flex-col leading-none text-left">
                                      <span className="font-mono text-[8.5px] font-black text-[#f1f5f9] uppercase">{activePart.id}</span>
                                      <span className="font-mono text-[7.5px] opacity-55 text-on-surface-variant font-bold mt-0.5">
                                        {formatSecondsToHMS(Math.ceil(st.currentCountdown))}
                                      </span>
                                    </div>
                                    {/* Percentage bar */}
                                    <div 
                                      className="absolute bottom-0 left-0 h-0.5 bg-primary/80 transition-all duration-100 ease-linear" 
                                      style={{ width: `${progressPct}%` }} 
                                      ref={undefined}
                                    />
                                  </div>
                                ) : (
                                  <span className="text-[8px] font-mono uppercase text-on-surface-variant/20 select-none tracking-wider block mx-auto py-0.5 text-center">
                                    IDLE
                                  </span>
                                )}
                              </div>

                              {/* Additional parts waiting in buffers queue */}
                              {st.parts.length > 1 && (
                                <div className="flex flex-wrap gap-1 bg-black/10 border border-outline-variant/5 p-0.5 rounded-md">
                                  {st.parts.slice(1).map((qp, qIdx) => (
                                    <div 
                                      key={`${qp.id}-${qIdx}`} 
                                      className="bg-black/40 border border-outline-variant/15 p-0.5 px-1 rounded flex items-center gap-0.5 text-[7px] font-mono select-none text-left"
                                      title={qp.id}
                                    >
                                      <div className="scale-75 shrink-0">
                                        {renderClipShape(qp.shape, qp.color)}
                                      </div>
                                      <span className="scale-90 text-on-surface-variant/50 font-bold">{qp.id.replace('Part #', '#')}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Visual in-shop conveyor belt showing directional travel from station to next */}
                            {(() => {
                              const movingPartOnThisBelt = flyingParts.find(fp => 
                                fp.fromId === shop.id && 
                                (fp.toId === targetSuccessor || (targetSuccessor === "exit" && fp.toId === "conveyor"))
                              );
                              const isFlowingActive = !!movingPartOnThisBelt || (isSimRunning && st.parts.length > 0);

                              return (
                                <div className="flex flex-col gap-1 py-1 px-2.5 bg-[#0d1526]/55 border border-[rgba(31,45,77,0.4)] rounded-lg mt-0.5">
                                  <div className="flex items-center justify-between text-[7.5px] font-mono select-none text-on-surface-variant/75">
                                    <span className="font-bold flex items-center gap-1 text-primary">
                                      <span className={`inline-block w-1 h-1 rounded-full ${isFlowingActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`}></span>
                                      {st.name} &rarr; {targetSuccessorName}
                                    </span>
                                    {isFlowingActive ? (
                                      <span className="text-[7px] font-bold text-emerald-400 bg-emerald-500/10 px-1 rounded animate-pulse shrink-0">FLOWING</span>
                                    ) : (
                                      <span className="text-[7.5px] opacity-45 shrink-0">READY</span>
                                    )}
                                  </div>
                                  <div className="relative h-5 bg-[#060c18] border border-[#232f4c]/50 rounded-sm flex items-center overflow-hidden">
                                    <div className="absolute inset-y-0 left-0 w-1 bg-slate-700/60 rounded-r-xs z-10"></div>
                                    <div className="absolute inset-y-0 right-0 w-1 bg-slate-700/60 rounded-l-xs z-10"></div>
                                    <div className="absolute inset-0 flex items-center justify-around font-mono font-bold tracking-widest text-[7px] select-none pointer-events-none text-blue-400/30">
                                      <span className={isFlowingActive ? "animate-pulse" : ""}>&gt;&gt;&gt;&gt;&gt;&gt;</span>
                                    </div>
                                    {movingPartOnThisBelt && (
                                      <div
                                        style={{
                                          left: `calc(${movingPartOnThisBelt.progress}% - 10px)`
                                        }}
                                        className="absolute top-1/2 -translate-y-1/2 scale-75 z-20 pointer-events-none transition-all duration-100 ease-linear shrink-0"
                                      >
                                        {renderClipShape(movingPartOnThisBelt.shape, movingPartOnThisBelt.color)}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  )}

                  {/* Card Bottom Statistics footer */}
                  {!isSimpleView && (
                    <footer className="p-2.5 border-t border-[#2d3a58]/40 bg-[#101b33] flex justify-between items-start text-[10px] font-mono select-none relative pb-10">
                      <div className="flex flex-col gap-1 items-start pl-1 flex-1">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex gap-1 items-center text-[8.5px] text-[#8fa2cf]/85">
                            <span className="text-[#a5b4fc] font-semibold">Physical Dimensions:</span>
                            <span className="font-bold text-emerald-400">
                              {shop.width}m (W) &times; {shop.height}m (L)
                            </span>
                          </div>
                          <div className="flex gap-1 items-center text-[8.5px] text-[#8fa2cf]/75">
                            <span className="opacity-75">Visual Area:</span>
                            <span className="font-bold text-sky-400">
                              {getShopWidthPx(shop)}px &times; {getShopHeightPx(shop)}px
                            </span>
                          </div>
                        </div>
                        <div className="text-[8px] text-on-surface-variant/75 mt-1.5 flex gap-1 items-center">
                          <span>Delivered total:</span>
                          <span className="font-bold text-indigo-300 bg-indigo-500/10 px-1.5 py-0.2 rounded border border-indigo-500/15">
                            {totalDone} units
                          </span>
                        </div>
                      </div>
                    </footer>
                  )}

                  {/* Drag Ball Option for resizing the card (pure visualization) */}
                  <div
                    onMouseDown={(e) => handleResizeStart(e, shop)}
                    className="absolute bottom-2.5 right-2.5 w-6.5 h-6.5 rounded-full bg-gradient-to-tr from-[#5f5af7] to-[#b04af7] border-2 border-white shadow-[0_0_12px_rgba(139,92,246,0.65)] cursor-se-resize flex items-center justify-center hover:scale-115 hover:shadow-[0_0_15px_rgba(139,92,246,0.9)] active:scale-90 transition-transform z-30 group"
                    title="Drag this ball to resize the shop layout (pure visualization)"
                  >
                    {/* Grab grip dots on drag ball */}
                    <span className="flex flex-wrap w-2.5 h-2.5 gap-[2px] justify-center items-center pointer-events-none select-none">
                      <span className="w-[3px] h-[3px] rounded-full bg-white opacity-95"></span>
                      <span className="w-[3px] h-[3px] rounded-full bg-white opacity-95"></span>
                      <span className="w-[3px] h-[3px] rounded-full bg-white opacity-95"></span>
                      <span className="w-[3px] h-[3px] rounded-full bg-white opacity-95"></span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

        {/* Global bottom telemetry overlay strip */}
        <footer className="bg-surface-container-lowest border-t border-outline-variant px-6 py-3 shrink-0 flex justify-between items-center text-left select-none z-10 font-mono text-[11px]">
          <div className="flex gap-6">
            <div>
              <span className="text-on-surface-variant uppercase text-[9px] opacity-70">WORK IN PROCESS (WIP)</span>
              <p className="font-black text-primary text-xs mt-0.5">
                {simShops.reduce((sum, ss) => sum + ss.stations.reduce((sumSt, st) => sumSt + st.parts.length, 0), 0) + flyingParts.length}
              </p>
            </div>
            <div>
              <span className="text-on-surface-variant uppercase text-[9px] opacity-70">TOTAL CYCLE TIME</span>
              <p className="font-black text-[#56eb9f] text-xs mt-0.5">{totalCycleTime}s</p>
            </div>
            <div>
              <span className="text-on-surface-variant uppercase text-[9px] opacity-70">OUTBOUND PARTS</span>
              <p className="font-black text-orange-400 text-xs mt-0.5">{conveyorExitCount}</p>
            </div>
            <div>
              <span className="text-on-surface-variant uppercase text-[9px] opacity-70">SIMULATED TIME</span>
              <p className="font-black text-yellow-500 text-xs mt-0.5 font-mono tabular-nums">
                {formatTime(simulatedElapsed)}
              </p>
            </div>
            <div>
              <span className="text-on-surface-variant uppercase text-[9px] opacity-70">AVG PART PRODUCED</span>
              <p className="font-black text-rose-400 text-xs mt-0.5">
                {avgPartProduced} sec/part
              </p>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
