/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Sliders, LayoutGrid, Play, Pause, Plus, Minus, Maximize2, 
  Trash2, ArrowRight, Settings, Info, X, 
  ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCcw, AlertTriangle, MonitorPlay,
  GripVertical, Menu, FolderHeart, Save, MoreVertical, Edit2
} from 'lucide-react';
import { ShopTopology, PartFlowItem, StationTopology } from '../types';
import { GitFork } from 'lucide-react';

interface SimulationPanelProps {
  shops: ShopTopology[];
  onNavigate: (step: 'configuration' | 'layout' | 'shop-layout' | 'simulation') => void;
  onUpdateShop: (id: number, updatedFields: Partial<ShopTopology>) => void;
  savedProjects?: any[];
  onSaveProject?: (name: string, step?: string) => any;
  onLoadProject?: (id: string) => void;
  onDeleteProject?: (id: string) => void;
  onRenameProject?: (id: string, newName: string) => void;
  onDeleteAllProjects?: () => void;
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
  shape: 'pentagon' | 'heart' | 'square' | 'triangle' | 'diamond' | 'oval' | 'rectangle' | 'circle';
  color: string;
  fromId: number | string;
  toId: number | string;
  fromStationId?: string;
  progress: number; // 0 to 100
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  borderSize?: number;
  width?: number;
  height?: number;
  isReworking?: boolean;
  reworkTimer?: number;
  orGateYesBranch?: boolean;
}

export default function SimulationPanel({
  shops,
  onNavigate,
  onUpdateShop,
  savedProjects,
  onSaveProject,
  onLoadProject,
  onDeleteProject,
  onRenameProject,
  onDeleteAllProjects
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
    const baseWidth = s.widthPx || (s.width ? Math.round((s.width / 30) * 288) : 288);
    // Automatically expand the box if there are OR Gates
    const extraWidth = s.orGates && s.orGates.length > 0 ? 110 : 0;
    return Math.max(180, Math.min(620, baseWidth + extraWidth));
  };
  const getShopHeightPx = (s: ShopTopology) => {
    const count = s.stations || 3;
    const baseHeight = s.heightPx || (115 + count * 82);
    // Automatically expand height if there are OR Gates
    const extraHeight = s.orGates && s.orGates.length > 0 ? (s.orGates.length * 105) : 0;
    return Math.max(200, Math.min(950, baseHeight + extraHeight));
  };

  // --- Animation and Drag-Pan State ---
  const [isSimRunning, setIsSimRunning] = useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = useState<number>(0.95);
  const [panX, setPanX] = useState<number>(40);
  const [panY, setPanY] = useState<number>(10);

  // States for project saving & simple view station positions
  const [projectName, setProjectName] = useState<string>("");
  const [isSavedProjectsOpen, setIsSavedProjectsOpen] = useState<boolean>(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [hasFinishedSim, setHasFinishedSim] = useState<boolean>(false);

  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [renamingText, setRenamingText] = useState<string>("");
  const [activeMenuProjectId, setActiveMenuProjectId] = useState<string | null>(null);

  const [isSimpleView, setIsSimpleView] = useState<boolean>(true);
  const [stationPositions, setStationPositions] = useState<{ [stationId: string]: { x: number, y: number } }>({});
  const [taskbarFontSize, setTaskbarFontSize] = useState<number>(11);
  const [partsToAddCount, setPartsToAddCount] = useState<number>(1);
  const sidebarInShop = shops.find(s => s.isInputShop) || shops[0];

  // Refs for station dragging in simple view
  const isDraggingStationRef = useRef<string | null>(null);
  const isDraggingStationParentShopIdRef = useRef<number | null>(null);
  const stationDragStartRef = useRef({ x: 0, y: 0 });
  const stationStartCoordsRef = useRef({ x: 0, y: 0 });

  // Refs for OR Gate dragging in simple view
  const isDraggingOrGateRef = useRef<string | null>(null);
  const isDraggingOrGateParentShopIdRef = useRef<number | null>(null);
  const orGateDragStartRef = useRef({ x: 0, y: 0 });
  const orGateStartCoordsRef = useRef({ x: 0, y: 0 });

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

  // --- Custom Part Builder States & Refs ---
  const [customPartShape, setCustomPartShape] = useState<'pentagon' | 'heart' | 'square' | 'triangle' | 'diamond' | 'oval' | 'rectangle'>('square');
  const [customPartColor, setCustomPartColor] = useState<string>('bg-[#4b8eff]');
  const [customPartBorder, setCustomPartBorder] = useState<number>(2);
  const [customPartWidth, setCustomPartWidth] = useState<number>(40);
  const [customPartHeight, setCustomPartHeight] = useState<number>(40);

  const [initialCustomQueue, setInitialCustomQueue] = useState<PartFlowItem[]>([]);

  // Keep conveyor queue initialized with dynamic defaults
  useEffect(() => {
    const inShop = shops.find(s => s.isInputShop);
    const limit = inShop?.intakePartsCount ?? 15;
    if (initialCustomQueue.length === 0) {
      const defaults = Array.from({ length: limit }).map(() => generatePart());
      setInitialCustomQueue(defaults);
      setSimState(prev => {
        if (prev.intakeQueue.length === 0) {
          return { ...prev, intakeQueue: defaults };
        }
        return prev;
      });
    }
  }, [shops]);

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
  const lastTickRef = useRef<number>(0);

  // Constants
  const shapes: Array<'pentagon' | 'heart' | 'square' | 'triangle' | 'diamond' | 'oval' | 'rectangle'> = [
    'pentagon', 'heart', 'square', 'triangle', 'diamond', 'oval', 'rectangle'
  ];
  const colors = [
    'bg-[#4b8eff]', 'bg-[#b7c8e1]', 'bg-[#ffb595]', 'bg-[#adc6ff]', 'bg-[#eb9e34]', 'bg-[#ef6719]'
  ];

  const generatePart = (): PartFlowItem => {
    const inShop = shops.find(s => s.isInputShop) || shops[0];
    const shape = inShop?.partShape || 'square';
    const color = inShop?.paintFillColor || '#FF5733';
    const borderSize = inShop?.paintStrokeWidth !== undefined ? inShop.paintStrokeWidth : 3;
    const width = inShop?.partWidth || 50;
    const height = inShop?.partHeight || 50;
    const idVal = partCounterRef.current++;

    return { 
      id: `Part #${idVal}`, 
      shape, 
      color,
      borderSize,
      width,
      height
    };
  };

  // Reconcile or initialize stations inside the simulation state
  useEffect(() => {
    setSimState(prev => {
      const inShop = shops.find(s => s.isInputShop);
      const limit = inShop?.intakePartsCount ?? 15;
      
      let nextIntakeQueue = [...prev.intakeQueue];
      // Initialize or reset queue when simulation is at 0 elapsed time and not already initialized (prevent wipe on Stop clock reset)
      if (simulatedElapsed === 0 && prev.simShops.length === 0) {
        // If the queue lacks the core parts or is empty, initialize default
        if (prev.intakeQueue.length === 0) {
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

  const handleUpdateStationSuccessor = (shopId: number, stationId: string, successorId: string) => {
    const shop = shops.find(s => s.id === shopId);
    if (shop && shop.stationsData) {
      const updatedStations = shop.stationsData.map(st => {
        if (st.id === stationId) {
          return { ...st, successor: successorId };
        }
        return st;
      });
      onUpdateShop(shopId, { stationsData: updatedStations });
    }

    setSimState(prev => {
      const nextSimShops = prev.simShops.map(ss => {
        if (ss.id === shopId) {
          return {
            ...ss,
            stations: ss.stations.map(st => {
              if (st.id === stationId) {
                return { ...st, successor: successorId };
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
  };

  const handleStationDragEnd = () => {
    setDraggedStationIdx(null);
    setDraggedStationShopId(null);
  };

  // Handles starting simulation from zero with timer loops and resets
  const handleStartSimulation = () => {
    setHasFinishedSim(false);
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

  const getAutoLayoutForShop = (shopId: number) => {
    const shop = shops.find(s => s.id === shopId);
    if (!shop) return {};

    const stations = shop.stationsData || [];
    const orGates = shop.orGates || [];

    // All elements inside this shop
    const allElements = [
      ...stations.map(st => ({ id: st.id, type: 'station', name: st.name, original: st })),
      ...orGates.map(og => ({ id: og.id, type: 'orgate', name: og.name, original: og }))
    ];

    if (allElements.length === 0) return {};

    // Build adjacency and indegree lists to compute levels
    const adj: { [id: string]: string[] } = {};
    const inDegree: { [id: string]: number } = {};

    allElements.forEach(el => {
      adj[el.id] = [];
      inDegree[el.id] = 0;
    });

    allElements.forEach(el => {
      if (el.type === 'station') {
        const succ = (el.original as any).successor;
        if (succ && succ !== 'exit' && succ !== 'none') {
          if (allElements.some(e => e.id === succ)) {
            adj[el.id].push(succ);
          }
        }
      } else {
        const succA = (el.original as any).targetStationA;
        const succB = (el.original as any).targetStationB;
        if (succA && succA !== 'exit' && succA !== 'none') {
          if (allElements.some(e => e.id === succA)) {
            adj[el.id].push(succA);
          }
        }
        if (succB && succB !== 'exit' && succB !== 'none') {
          if (allElements.some(e => e.id === succB)) {
            adj[el.id].push(succB);
          }
        }
      }
    });

    allElements.forEach(el => {
      adj[el.id].forEach(childId => {
        if (inDegree[childId] !== undefined) {
          inDegree[childId]++;
        }
      });
    });

    // Leftmost are elements with in-degree = 0 (receiving parts from outside / import conveyor)
    const leftmost = allElements.filter(el => inDegree[el.id] === 0).map(el => el.id);
    if (leftmost.length === 0 && allElements.length > 0) {
      leftmost.push(allElements[0].id);
    }

    // Rightmost are elements that go to exit
    const rightmost = allElements.filter(el => {
      if (el.type === 'station') {
        const succ = (el.original as any).successor;
        return !succ || succ === 'exit' || succ === 'none';
      } else {
        const succA = (el.original as any).targetStationA;
        const succB = (el.original as any).targetStationB;
        return succA === 'exit' || succB === 'exit';
      }
    }).map(el => el.id);

    // BFS or simple assignment
    const level: { [id: string]: number } = {};
    leftmost.forEach(id => {
      level[id] = 0;
    });

    const queue = [...leftmost];
    const visited = new Set<string>();
    while (queue.length > 0) {
      const curr = queue.shift()!;
      if (visited.has(curr)) continue;
      visited.add(curr);

      const currLevel = level[curr] || 0;
      const children = adj[curr] || [];
      children.forEach(child => {
        if (level[child] === undefined || level[child] < currLevel + 1) {
          level[child] = currLevel + 1;
        }
        queue.push(child);
      });
    }

    // Force rightmost to be at the maximum level
    let maxLevel = 0;
    allElements.forEach(el => {
      const lvl = level[el.id] || 0;
      if (!rightmost.includes(el.id) && lvl > maxLevel) {
        maxLevel = lvl;
      }
    });

    const finalLevels: { [id: string]: number } = {};
    allElements.forEach(el => {
      if (leftmost.includes(el.id)) {
        finalLevels[el.id] = 0;
      } else if (rightmost.includes(el.id)) {
        // Force exits to the rightmost column
        finalLevels[el.id] = Math.max(2, maxLevel + 1);
      } else {
        // Middle elements
        finalLevels[el.id] = Math.min(Math.max(1, level[el.id] || 1), Math.max(1, maxLevel));
      }
    });

    // Group by final levels
    const levelsMap: { [lvl: number]: string[] } = {};
    allElements.forEach(el => {
      const lvl = finalLevels[el.id];
      if (!levelsMap[lvl]) levelsMap[lvl] = [];
      levelsMap[lvl].push(el.id);
    });

    const sortedLevels = Object.keys(levelsMap).map(Number).sort((a, b) => a - b);
    const positions: { [id: string]: { x: number, y: number } } = {};

    const shopWidth = getShopWidthPx(shop);
    const shopHeight = getShopHeightPx(shop);
    const headerHeight = 53;
    const contentHeight = shopHeight - headerHeight - 20;

    const numCols = sortedLevels.length || 1;
    const availableWidth = shopWidth - 140; // leave padding for columns
    const colSpacing = numCols > 1 ? availableWidth / (numCols - 1) : 150;

    sortedLevels.forEach((lvl, colIdx) => {
      const ids = levelsMap[lvl];
      const numInLvl = ids.length;

      // Sort stations so we stack them nicely. Place OR gates in the middle or bottom/top for perfect visibility
      ids.sort((a, b) => {
        const elA = allElements.find(e => e.id === a);
        const elB = allElements.find(e => e.id === b);
        if (elA?.type === 'orgate' && elB?.type !== 'orgate') return 1;
        if (elA?.type !== 'orgate' && elB?.type === 'orgate') return -1;
        return a.localeCompare(b);
      });

      ids.forEach((id, rowIdx) => {
        const el = allElements.find(e => e.id === id);
        const isOrGate = el?.type === 'orgate';

        // X coordinate:
        let x = 20;
        if (colIdx === 0) {
          x = 24;
        } else if (colIdx === numCols - 1) {
          x = shopWidth - 140 - (isOrGate ? 15 : 0);
        } else {
          x = 24 + colIdx * colSpacing - (isOrGate ? 15 : 0);
        }

        // Y coordinate:
        let y = 110;
        if (numInLvl === 1) {
          y = (contentHeight - (isOrGate ? 72 : 75)) / 2 + 10;
        } else {
          // Stack them vertically with generous, perfectly proportional spacing
          const usableY = contentHeight - 45;
          const totalElementHeight = numInLvl * (isOrGate ? 72 : 75);
          const gap = (usableY - totalElementHeight) / (numInLvl - 1 || 1);
          y = 25 + rowIdx * ((isOrGate ? 72 : 75) + gap);
        }

        const maxSafeY = contentHeight - (isOrGate ? 72 : 75) - 5;
        y = Math.max(15, Math.min(maxSafeY, y));

        positions[id] = { x: Math.round(x), y: Math.round(y) };
      });
    });

    return positions;
  };

  const getOrGatePos = (og: any, shopId: number) => {
    // If the user manually dragged it from default (60, 100), respect the manual position
    if (og.posX !== 60 || og.posY !== 100) {
      return { x: og.posX, y: og.posY };
    }
    const layout = getAutoLayoutForShop(shopId);
    if (layout[og.id]) {
      return layout[og.id];
    }
    return { x: og.posX, y: og.posY };
  };

  const getImportOrthogonalPath = (startX: number, startY: number, endX: number, endY: number) => {
    const midX = Math.max(startX + 15, endX - 25);
    return `M ${startX} ${startY} H ${midX} V ${endY} H ${endX}`;
  };

  const interpolateImportOrthogonal = (startX: number, startY: number, endX: number, endY: number, progress: number) => {
    const midX = Math.max(startX + 15, endX - 25);
    const L1 = Math.abs(midX - startX);
    const L2 = Math.abs(endY - startY);
    const L3 = Math.abs(endX - midX);
    const Ltot = L1 + L2 + L3;
    if (Ltot === 0) return { x: startX, y: startY };
    
    const p1 = (L1 / Ltot) * 100;
    const p2 = ((L1 + L2) / Ltot) * 100;
    
    if (progress <= p1) {
      const t = progress / p1;
      return {
        x: startX + (midX - startX) * t,
        y: startY
      };
    } else if (progress <= p2) {
      const t = (progress - p1) / (p2 - p1);
      return {
        x: midX,
        y: startY + (endY - startY) * t
      };
    } else {
      const t = (progress - p2) / (100 - p2);
      return {
        x: midX + (endX - midX) * t,
        y: endY
      };
    }
  };

  const interpolateBezierConveyor = (
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    progress: number
  ) => {
    const cy1 = startY + (endY - startY) / 2;
    const cy2 = startY + (endY - startY) / 2;
    const t = progress / 100;
    const inv = 1 - t;
    return {
      x: inv * inv * inv * startX + 3 * inv * inv * t * startX + 3 * inv * t * t * endX + t * t * t * endX,
      y: inv * inv * inv * startY + 3 * inv * inv * t * cy1 + 3 * inv * t * t * cy2 + t * t * t * endY,
    };
  };

  const findShopForFlyingPart = (fp: FlyingPart) => {
    if (fp.fromId === 'import_conveyor') {
      return shops.find(s => s.isInputShop);
    }
    if (typeof fp.fromId === 'number') {
      return shops.find(s => s.id === fp.fromId);
    }
    if (typeof fp.fromId === 'string' && fp.fromId.startsWith('orgate-')) {
      return shops.find(s => s.orGates?.some(g => g.id === fp.fromId));
    }
    if (typeof fp.fromId === 'string' && fp.fromId.includes('-')) {
      return shops.find(s => s.stationsData?.some(st => st.id === fp.fromId));
    }
    return shops.find(s => s.id === fp.fromId);
  };

  const resolveFlyingPartEndpoints = (fp: FlyingPart) => {
    const headerHeight = 53;
    let startX = fp.startX;
    let startY = fp.startY;
    let endX = fp.endX;
    let endY = fp.endY;

    const isFromImport = fp.fromId === 'import_conveyor';
    const isStationTransfer = typeof fp.toId === 'string' && fp.toId.includes('-');
    const shop = findShopForFlyingPart(fp);

    if (!shop) {
      return { startX, startY, endX, endY, shop: null as ShopTopology | null | undefined };
    }

    if (isFromImport) {
      const targetStPos = stationPositions[fp.toId as string] || getDefaultStationPos(fp.toId as string, shop.id);
      startX = shop.posX - 25;
      startY = shop.posY + 85;
      endX = shop.posX + targetStPos.x;
      endY = shop.posY + headerHeight + targetStPos.y + 37.5;
    } else if (isStationTransfer) {
      const isStartOrGate = fp.fromStationId?.startsWith('orgate-') ?? false;
      const isEndOrGate = (fp.toId as string).startsWith('orgate-');
      const isEndExit = fp.toId === 'exit';

      if (isStartOrGate) {
        const og = (shop.orGates || []).find(g => g.id === fp.fromStationId);
        if (og) {
          const ogPos = getOrGatePos(og, shop.id);
          startX = shop.posX + ogPos.x + 36;
          startY = shop.posY + headerHeight + ogPos.y + (fp.orGateYesBranch ? 0 : 72);
        }
      } else if (fp.fromStationId) {
        const sourceStPos = stationPositions[fp.fromStationId] || getDefaultStationPos(fp.fromStationId, shop.id);
        startX = shop.posX + sourceStPos.x + 55;
        startY = shop.posY + headerHeight + sourceStPos.y + 37.5;
      }

      if (isEndExit) {
        endX = shop.posX + getShopWidthPx(shop) / 2;
        endY = shop.posY + (shop.isOutputShop ? -23 : getShopHeightPx(shop) - 20);
      } else if (isEndOrGate) {
        const og = (shop.orGates || []).find(g => g.id === fp.toId);
        if (og) {
          const ogPos = getOrGatePos(og, shop.id);
          endX = shop.posX + ogPos.x;
          endY = shop.posY + headerHeight + ogPos.y + 36;
        }
      } else {
        const targetStPos = stationPositions[fp.toId as string] || getDefaultStationPos(fp.toId as string, shop.id);
        endX = shop.posX + targetStPos.x + 55;
        endY = shop.posY + headerHeight + targetStPos.y + 37.5;
      }
    } else if (fp.toId === 'conveyor') {
      startX = shop.posX + getShopWidthPx(shop) / 2;
      startY = shop.posY + 15;
      endX = startX;
      endY = 49;
    } else if (fp.toId === 'outbound_belt') {
      startX = shop.posX + getShopWidthPx(shop) / 2;
      startY = 49;
      endX = startX + 600;
      endY = 49;
    } else if (typeof fp.toId === 'number') {
      const targetShopObj = shops.find(s => s.id === fp.toId);
      if (targetShopObj) {
        startX = shop.posX + getShopWidthPx(shop) / 2;
        startY = shop.posY + getShopHeightPx(shop) - 20;
        endX = targetShopObj.posX + getShopWidthPx(targetShopObj) / 2;
        endY = targetShopObj.posY + 30;
      }
    }

    return { startX, startY, endX, endY, shop };
  };

  const getFlyingPartPosition = (
    fp: FlyingPart,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    shop: ShopTopology | null | undefined
  ) => {
    const headerHeight = 53;
    const isStationTransfer = typeof fp.toId === 'string' && fp.toId.includes('-');

    if (fp.toId === 'conveyor') {
      return {
        x: startX,
        y: startY + (endY - startY) * (fp.progress / 100),
      };
    }

    if (fp.toId === 'outbound_belt') {
      return {
        x: startX + (endX - startX) * (fp.progress / 100),
        y: startY,
      };
    }

    if (isStationTransfer && shop) {
      const isStartOrGate = fp.fromStationId?.startsWith('orgate-') ?? false;
      const isEndOrGate = (fp.toId as string).startsWith('orgate-');
      const isEndExit = fp.toId === 'exit';

      const relativeStartX = startX - shop.posX;
      const relativeStartY = startY - (shop.posY + headerHeight);
      const relativeEndX = endX - shop.posX;
      const relativeEndY = endY - (shop.posY + headerHeight);

      const localPos = interpolateOrthogonal(
        relativeStartX,
        relativeStartY,
        relativeEndX,
        relativeEndY,
        fp.progress,
        isStartOrGate,
        isEndOrGate,
        isEndExit,
        isStartOrGate,
        isEndOrGate
      );
      return {
        x: shop.posX + localPos.x,
        y: shop.posY + headerHeight + localPos.y,
      };
    }

    if (fp.fromId === 'import_conveyor' && shop) {
      const relativeStartX = startX - shop.posX;
      const relativeStartY = startY - shop.posY;
      const relativeEndX = endX - shop.posX;
      const relativeEndY = endY - shop.posY;
      const localPos = interpolateImportOrthogonal(
        relativeStartX,
        relativeStartY,
        relativeEndX,
        relativeEndY,
        fp.progress
      );
      return {
        x: shop.posX + localPos.x,
        y: shop.posY + localPos.y,
      };
    }

    return interpolateBezierConveyor(startX, startY, endX, endY, fp.progress);
  };

  const getOrGateAbsolutePos = (gateId: string, shopId: number) => {
    const shopObj = shops.find(s => s.id === shopId);
    if (!shopObj) return { x: 0, y: 0 };
    const og = shopObj.orGates?.find(g => g.id === gateId);
    if (!og) {
      return { x: shopObj.posX + 100, y: shopObj.posY + 150 };
    }
    const headerHeight = 53;
    const pos = getOrGatePos(og, shopId);
    return {
      x: shopObj.posX + pos.x + 36,
      y: shopObj.posY + headerHeight + pos.y + 36
    };
  };

  const handleOrGateMouseDown = (e: React.MouseEvent, gateId: string, shopId: number) => {
    e.stopPropagation();
    e.preventDefault();
    const shop = shops.find(s => s.id === shopId);
    if (shop && shop.orGates) {
      const gate = shop.orGates.find(g => g.id === gateId);
      if (gate) {
        isDraggingOrGateRef.current = gateId;
        isDraggingOrGateParentShopIdRef.current = shopId;
        orGateDragStartRef.current = { x: e.clientX, y: e.clientY };
        orGateStartCoordsRef.current = { x: gate.posX, y: gate.posY };
      }
    }
  };

  const handleDeleteOrGate = (gateId: string, shopId: number) => {
    const shop = shops.find(s => s.id === shopId);
    if (shop && shop.orGates) {
      const nextOrGates = shop.orGates.filter(g => g.id !== gateId);
      onUpdateShop(shopId, { orGates: nextOrGates });
      setSysNotice(`Removed ${gateId}.`);
      setTimeout(() => setSysNotice(null), 3000);
    }
  };

  const handleAddOrGate = (shopId: number) => {
    const shop = shops.find(s => s.id === shopId);
    if (shop) {
      const currentOrGates = shop.orGates || [];
      const newId = `orgate-${shopId}-${Date.now()}`;
      const stations = shop.stationsData || [];
      const firstStationId = stations[0]?.id || 'exit';
      
      const newGate = {
        id: newId,
        name: `OR GATE ${currentOrGates.length + 1}`,
        posX: 60,
        posY: 100,
        criteriaCategory: 'shape' as const,
        criteriaValue: 'square',
        targetStationA: firstStationId,
        targetStationB: firstStationId !== 'exit' ? 'exit' : 'exit'
      };
      
      const nextOrGates = [...currentOrGates, newGate];
      onUpdateShop(shopId, { orGates: nextOrGates });
      setSysNotice(`Added ${newGate.name} inside ${shop.name}.`);
      setTimeout(() => setSysNotice(null), 3000);
    }
  };

  const handleUpdateOrGate = (shopId: number, gateId: string, updatedFields: any) => {
    const shop = shops.find(s => s.id === shopId);
    if (shop && shop.orGates) {
      const nextOrGates = shop.orGates.map(og => og.id === gateId ? { ...og, ...updatedFields } : og);
      onUpdateShop(shopId, { orGates: nextOrGates });
    }
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
      intakeQueue: [...initialCustomQueue],
      conveyorExitCount: 0,
      intakeRoundRobinIndex: 0
    });
    setSimulatedElapsed(0);
    setSysNotice("Simulation hard reset: counts cleared, parts returned to initial queue.");
    setTimeout(() => setSysNotice(null), 3000);
  };

  // --- Processing Cycle Loop: Ticks every 20ms for buttery smooth visualization ---
  useEffect(() => {
    if (!isSimRunning) return;

    lastTickRef.current = Date.now();

    const interval = setInterval(() => {
      const now = Date.now();
      // Calculate actual delta and cap it to prevent massive jumps if tab was sleeping
      const realDeltaMs = Math.min(200, now - lastTickRef.current);
      lastTickRef.current = now;
      const deltaSec = (realDeltaMs / 1000) * simSpeed;
      
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
          const originalInShop = shops.find(s => s.id === inShopSim.id);
          const inShopOrGates = originalInShop?.orGates || [];

          // Identify stations in the input shop that do not have any internal predecessor station or OR Gate
          const intakeStations = inShopSim.stations.filter((st, sIdx) => {
            const hasStationPredecessor = inShopSim.stations.some((other, oIdx) => {
              const succ = other.successor || (oIdx === inShopSim.stations.length - 1 ? "exit" : inShopSim.stations[oIdx + 1]?.id || "exit");
              return succ === st.id;
            });
            const hasOrGatePredecessor = inShopOrGates.some(og => og.targetStationA === st.id || og.targetStationB === st.id);
            return !hasStationPredecessor && !hasOrGatePredecessor;
          });

          // Identify OR Gates that do not have any station pointing to them as successor
          const intakeOrGates = inShopOrGates.filter(og => {
            const hasStationPredecessor = inShopSim.stations.some((other, oIdx) => {
              const succ = other.successor || (oIdx === inShopSim.stations.length - 1 ? "exit" : inShopSim.stations[oIdx + 1]?.id || "exit");
              return succ === og.id;
            });
            return !hasStationPredecessor;
          });

          // Combined list of intake targets
          const intakeNodes: { id: string; type: 'station' | 'orgate' }[] = [
            ...intakeStations.map(st => ({ id: st.id, type: 'station' as const })),
            ...intakeOrGates.map(og => ({ id: og.id, type: 'orgate' as const }))
          ];

          if (intakeNodes.length > 0) {
            let canFeederContinue = true;
            while (canFeederContinue && nextIntakeQueue.length > 0) {
              const targetNode = intakeNodes[nextRoundRobinIdx % intakeNodes.length];
              let hasSpace = false;
              let destX = 0;
              let destY = 0;

              if (targetNode.type === 'station') {
                const targetSt = inShopSim.stations.find(s => s.id === targetNode.id);
                if (targetSt) {
                  const flyingToTarget = prev.flyingParts.filter(fp => fp.toId === targetSt.id).length + newFlyingParts.filter(fp => fp.toId === targetSt.id).length;
                  if (targetSt.parts.length + flyingToTarget < targetSt.bufferSize + 1) {
                    hasSpace = true;
                    const currentCoords = stationPositions[targetSt.id] || getDefaultStationPos(targetSt.id, inShopSim.id);
                    const headerHeight = 53;
                    destX = originalInShop!.posX + currentCoords.x;
                    destY = originalInShop!.posY + headerHeight + currentCoords.y + 37.5;
                  }
                }
              } else {
                // OR Gate always has space because it forwards parts instantaneously
                hasSpace = true;
                const gatePos = getOrGateAbsolutePos(targetNode.id, inShopSim.id);
                destX = gatePos.x;
                destY = gatePos.y;
              }

              if (hasSpace) {
                const nextPart = nextIntakeQueue.shift();
                if (nextPart && originalInShop) {
                  // Absolute start pos on conveyor belt line
                  const startX = originalInShop.posX - 25;
                  const startY = originalInShop.posY + 85;

                  newFlyingParts.push({
                    ...nextPart,
                    fromId: 'import_conveyor',
                    toId: targetNode.id,
                    fromStationId: 'import',
                    progress: 0,
                    startX,
                    startY,
                    endX: destX,
                    endY: destY
                  });
                  
                  nextRoundRobinIdx++;
                } else {
                  canFeederContinue = false;
                }
              } else {
                // Alternating target node is full, wait to enforce order strictly
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
              const nextCount = st.currentCountdown - deltaSec;

              if (nextCount <= 0) {
                // Determine target successor string (support alternating comma split or OR Gates)
                const targetSuccessor = st.successor || (j === lastStationIdx ? "exit" : ss.stations[j + 1]?.id || "exit");
                const targetsList = targetSuccessor.split(',').map(x => x.trim()).filter(Boolean);
                
                let selectedTarget = targetsList[0] || "exit";
                if (targetsList.length > 1) {
                  const exitIndex = st.partsExitedCount || 0;
                  selectedTarget = targetsList[exitIndex % targetsList.length];
                }

                if (selectedTarget !== "exit") {
                  if (selectedTarget.startsWith('orgate-')) {
                    // Route to an OR Gate!
                    let targetGateId = selectedTarget;

                    const gatePos = getOrGateAbsolutePos(targetGateId, ss.id);
                    const finishedPart = st.parts.shift();
                    if (finishedPart) {
                      st.partsExitedCount = (st.partsExitedCount || 0) + 1;
                      const shopId = ss.id;
                      const sourceStPos = stationPositions[st.id] || getDefaultStationPos(st.id, shopId);
                      const headerHeight = 53;
                      const startX = original.posX + sourceStPos.x + 55;
                      const startY = original.posY + headerHeight + sourceStPos.y + 37.5;

                      newFlyingParts.push({
                        ...finishedPart,
                        fromId: ss.id,
                        toId: targetGateId,
                        fromStationId: st.id,
                        progress: 0,
                        startX,
                        startY,
                        endX: gatePos.x,
                        endY: gatePos.y
                      });
                    }
                    st.currentCountdown = st.cycleTime;
                  } else {
                    // Move to internal succeeding station in the same shop
                    const nextSt = ss.stations.find(station => station.id === selectedTarget);
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
          const nextProg = fp.progress + 60 * deltaSec;
          if (nextProg >= 100) {
            // Arrived! Add to targeted first station queue if space exists
            if (fp.toId !== 'conveyor' && fp.toId !== 'outbound_belt') {
              if (typeof fp.toId === 'string' && fp.toId.startsWith('orgate-')) {
                // Arrived at an OR Gate! Evaluate logic immediately.
                let foundGate: any = null;
                let gateShop: any = null;
                for (let s of shops) {
                  const og = s.orGates?.find(g => g.id === fp.toId);
                  if (og) {
                    foundGate = og;
                    gateShop = s;
                    break;
                  }
                }

                if (foundGate && gateShop) {
                  const checkGateMatch = (gate: any, part: any): boolean => {
                    const criteriaCategory = gate.criteriaCategory;
                    const criteriaValue = gate.criteriaValue ? gate.criteriaValue.trim().toLowerCase() : '';
                    if (criteriaCategory === 'shape') {
                      return part.shape.toLowerCase() === criteriaValue;
                    } else if (criteriaCategory === 'color') {
                      const cleanVal = criteriaValue.replace('#', '');
                      const cleanColor = part.color.toLowerCase().replace('#', '').replace('bg-[', '').replace(']', '').replace('bg-', '');
                      return cleanColor === cleanVal;
                    } else if (criteriaCategory === 'borderSize') {
                      return (part.borderSize ?? 0) === parseInt(criteriaValue);
                    } else if (criteriaCategory === 'width') {
                      return (part.width ?? 0) === parseInt(criteriaValue);
                    } else if (criteriaCategory === 'height') {
                      return (part.height ?? 0) === parseInt(criteriaValue);
                    }
                    return false;
                  };

                  const isMatch = checkGateMatch(foundGate, fp);
                  const selectedTarget = isMatch ? foundGate.targetStationA : foundGate.targetStationB;

                  const gatePos = getOrGateAbsolutePos(foundGate.id, gateShop.id);
                  const headerHeight = 53;

                  let destX = 0;
                  let destY = 0;
                  let finalToId: string | number = selectedTarget;

                  if (selectedTarget === 'exit') {
                    if (gateShop.isOutputShop || gateShop.connections?.length === 0) {
                      finalToId = 'conveyor';
                      destX = gateShop.posX + getShopWidthPx(gateShop) / 2;
                      destY = 49;
                    } else {
                      const matchSucc = shops.find(target => target.name.trim().toLowerCase() === gateShop.successor.trim().toLowerCase());
                      const targetId = matchSucc ? matchSucc.id : (gateShop.id + 1);
                      finalToId = targetId;

                      const targetOrig = shops.find(t => t.id === targetId);
                      if (targetOrig) {
                        destX = targetOrig.posX + getShopWidthPx(targetOrig) / 2;
                        destY = targetOrig.posY + 30;
                      } else {
                        destX = gateShop.posX + getShopWidthPx(gateShop) / 2;
                        destY = gateShop.posY + getShopHeightPx(gateShop) - 20;
                      }
                    }
                  } else if (selectedTarget.startsWith('orgate-')) {
                    const targetGatePos = getOrGateAbsolutePos(selectedTarget, gateShop.id);
                    destX = targetGatePos.x;
                    destY = targetGatePos.y;
                  } else {
                    const succPos = stationPositions[selectedTarget] || getDefaultStationPos(selectedTarget, gateShop.id);
                    destX = gateShop.posX + succPos.x + 55;
                    destY = gateShop.posY + headerHeight + succPos.y + 37.5;
                  }

                  newFlyingParts.push({
                    id: fp.id,
                    shape: fp.shape,
                    color: fp.color,
                    borderSize: fp.borderSize,
                    width: fp.width,
                    height: fp.height,
                    fromId: fp.toId,
                    toId: finalToId,
                    progress: 0,
                    startX: gatePos.x,
                    startY: gatePos.y,
                    endX: destX,
                    endY: destY
                  });
                }
              } else if (typeof fp.toId === 'string' && fp.toId.includes('-')) {
                for (let ss of nextSimShops) {
                  const targetSt = ss.stations.find(s => s.id === fp.toId);
                  if (targetSt) {
                    targetSt.parts.push({ 
                      id: fp.id, 
                      shape: fp.shape, 
                      color: fp.color,
                      borderSize: fp.borderSize,
                      width: fp.width,
                      height: fp.height
                    });
                    break;
                  }
                }
              } else if (typeof fp.toId === 'number') {
                const targetShop = nextSimShops.find(cs => cs.id === fp.toId);
                if (targetShop) {
                  const firstStTarget = targetShop.stations[0];
                  if (firstStTarget) {
                    firstStTarget.parts.push({ 
                      id: fp.id, 
                      shape: fp.shape, 
                      color: fp.color,
                      borderSize: fp.borderSize,
                      width: fp.width,
                      height: fp.height
                    });
                  }
                }
              }
            } else if (fp.toId === 'conveyor') {
              newConveyorExits++;
              newFlyingParts.push({
                id: fp.id,
                shape: fp.shape,
                color: fp.color,
                borderSize: fp.borderSize,
                width: fp.width,
                height: fp.height,
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
          setTimeout(() => {
            setIsSimRunning(false);
            setHasFinishedSim(true);
          }, 0);
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
    }, 20);

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

  const getDefaultStationPos = (stationId: string, shopId: number) => {
    if (stationPositions[stationId]) {
      return stationPositions[stationId];
    }
    const layout = getAutoLayoutForShop(shopId);
    if (layout[stationId]) {
      return layout[stationId];
    }
    return { x: 24, y: 110 };
  };

  const clipLine = (startX: number, startY: number, endX: number, endY: number, isStartOrGate: boolean, isEndOrGate: boolean, isEndExit: boolean) => {
    const dx = endX - startX;
    const dy = endY - startY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    let finalStartX = startX;
    let finalStartY = startY;
    let finalEndX = endX;
    let finalEndY = endY;

    if (dist > 30) {
      const ux = dx / dist;
      const uy = dy / dist;

      // Clip starting point
      const startHalf = isStartOrGate ? 36 : 55;
      finalStartX = startX + ux * startHalf;
      finalStartY = startY + uy * startHalf;

      // Clip ending point
      if (!isEndExit) {
        const endHalf = isEndOrGate ? 36 : 55;
        finalEndX = endX - ux * endHalf;
        finalEndY = endY - uy * endHalf;
      }
    }
    return { finalStartX, finalStartY, finalEndX, finalEndY };
  };

  const getOrthogonalPath = (
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    isStartOrGate: boolean,
    isEndOrGate: boolean,
    isEndExit: boolean,
    skipStartClip: boolean = false,
    skipEndClip: boolean = false
  ) => {
    const W1 = skipStartClip ? 0 : (isStartOrGate ? 36 : 55);
    const H1 = skipStartClip ? 0 : (isStartOrGate ? 36 : 37.5);
    const W2 = skipEndClip ? 0 : (isEndOrGate ? 36 : 55);
    const H2 = skipEndClip ? 0 : (isEndOrGate ? 36 : 37.5);

    // Check if it's already perfectly aligned (within 2 pixels)
    if (Math.abs(startX - endX) < 2) {
      // Purely vertical line
      const clippedStartY = endY >= startY ? startY + H1 : startY - H1;
      const clippedEndY = isEndExit ? endY : (endY >= startY ? endY - H2 : endY + H2);
      return {
        path: `M ${startX} ${clippedStartY} L ${endX} ${clippedEndY}`,
        labelX: startX,
        labelY: (clippedStartY + clippedEndY) / 2,
      };
    }

    if (Math.abs(startY - endY) < 2) {
      // Purely horizontal line
      const clippedStartX = endX >= startX ? startX + W1 : startX - W1;
      const clippedEndX = isEndExit ? endX : (endX >= startX ? endX - W2 : endX + W2);
      return {
        path: `M ${clippedStartX} ${startY} L ${clippedEndX} ${endY}`,
        labelX: (clippedStartX + clippedEndX) / 2,
        labelY: startY,
      };
    }

    // Otherwise, we bend. Let's decide horizontal-first vs vertical-first.
    // If the horizontal distance is greater than or equal to the vertical distance, go horizontal first.
    const goHorizontalFirst = Math.abs(endX - startX) >= Math.abs(endY - startY);

    if (goHorizontalFirst) {
      const clippedStartX = endX >= startX ? startX + W1 : startX - W1;
      const clippedStartY = startY;

      const clippedEndX = endX;
      const clippedEndY = isEndExit ? endY : (endY >= startY ? endY - H2 : endY + H2);

      const cornerX = endX;
      const cornerY = startY;

      // Place label in the middle of the longest segment
      const L1 = Math.abs(cornerX - clippedStartX);
      const L2 = Math.abs(clippedEndY - cornerY);
      let labelX = cornerX;
      let labelY = cornerY;
      if (L1 >= L2) {
        labelX = (clippedStartX + cornerX) / 2;
        labelY = startY;
      } else {
        labelX = endX;
        labelY = (cornerY + clippedEndY) / 2;
      }

      return {
        path: `M ${clippedStartX} ${clippedStartY} L ${cornerX} ${cornerY} L ${clippedEndX} ${clippedEndY}`,
        labelX,
        labelY,
      };
    } else {
      const clippedStartX = startX;
      const clippedStartY = endY >= startY ? startY + H1 : startY - H1;

      const clippedEndX = isEndExit ? endX : (endX >= startX ? endX - W2 : endX + W2);
      const clippedEndY = endY;

      const cornerX = startX;
      const cornerY = endY;

      // Place label in the middle of the longest segment
      const L1 = Math.abs(cornerY - clippedStartY);
      const L2 = Math.abs(clippedEndX - cornerX);
      let labelX = cornerX;
      let labelY = cornerY;
      if (L1 >= L2) {
        labelX = startX;
        labelY = (clippedStartY + cornerY) / 2;
      } else {
        labelX = (cornerX + clippedEndX) / 2;
        labelY = endY;
      }

      return {
        path: `M ${clippedStartX} ${clippedStartY} L ${cornerX} ${cornerY} L ${clippedEndX} ${clippedEndY}`,
        labelX,
        labelY,
      };
    }
  };

  const interpolateOrthogonal = (
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    progress: number,
    isStartOrGate: boolean,
    isEndOrGate: boolean,
    isEndExit: boolean,
    skipStartClip: boolean = false,
    skipEndClip: boolean = false
  ) => {
    const W1 = skipStartClip ? 0 : (isStartOrGate ? 36 : 55);
    const H1 = skipStartClip ? 0 : (isStartOrGate ? 36 : 37.5);
    const W2 = skipEndClip ? 0 : (isEndOrGate ? 36 : 55);
    const H2 = skipEndClip ? 0 : (isEndOrGate ? 36 : 37.5);

    let clippedStartX = startX;
    let clippedStartY = startY;
    let clippedEndX = endX;
    let clippedEndY = endY;

    if (Math.abs(startX - endX) < 2) {
      clippedStartY = endY >= startY ? startY + H1 : startY - H1;
      clippedEndY = isEndExit ? endY : (endY >= startY ? endY - H2 : endY + H2);
      const t = progress / 100;
      return {
        x: startX,
        y: clippedStartY + (clippedEndY - clippedStartY) * t
      };
    }

    if (Math.abs(startY - endY) < 2) {
      clippedStartX = endX >= startX ? startX + W1 : startX - W1;
      clippedEndX = isEndExit ? endX : (endX >= startX ? endX - W2 : endX + W2);
      const t = progress / 100;
      return {
        x: clippedStartX + (clippedEndX - clippedStartX) * t,
        y: startY
      };
    }

    const goHorizontalFirst = Math.abs(endX - startX) >= Math.abs(endY - startY);

    if (goHorizontalFirst) {
      clippedStartX = endX >= startX ? startX + W1 : startX - W1;
      clippedStartY = startY;

      clippedEndX = endX;
      clippedEndY = isEndExit ? endY : (endY >= startY ? endY - H2 : endY + H2);

      const cornerX = endX;
      const cornerY = startY;

      const Lh = Math.abs(cornerX - clippedStartX);
      const Lv = Math.abs(clippedEndY - cornerY);
      const Ltot = Lh + Lv;
      if (Ltot === 0) return { x: startX, y: startY };

      const pSwitch = (Lh / Ltot) * 100;

      if (progress <= pSwitch) {
        const t = progress / pSwitch;
        return {
          x: clippedStartX + (cornerX - clippedStartX) * t,
          y: clippedStartY
        };
      } else {
        const t = (progress - pSwitch) / (100 - pSwitch);
        return {
          x: cornerX,
          y: cornerY + (clippedEndY - cornerY) * t
        };
      }
    } else {
      clippedStartX = startX;
      clippedStartY = endY >= startY ? startY + H1 : startY - H1;

      clippedEndX = isEndExit ? endX : (endX >= startX ? endX - W2 : endX + W2);
      clippedEndY = endY;

      const cornerX = startX;
      const cornerY = endY;

      const Lv = Math.abs(cornerY - clippedStartY);
      const Lh = Math.abs(clippedEndX - cornerX);
      const Ltot = Lh + Lv;
      if (Ltot === 0) return { x: startX, y: startY };

      const pSwitch = (Lv / Ltot) * 100;

      if (progress <= pSwitch) {
        const t = progress / pSwitch;
        return {
          x: clippedStartX,
          y: clippedStartY + (cornerY - clippedStartY) * t
        };
      } else {
        const t = (progress - pSwitch) / (100 - pSwitch);
        return {
          x: cornerX + (clippedEndX - cornerX) * t,
          y: cornerY
        };
      }
    }
  };

  const handleStationMouseDown = (e: React.MouseEvent, stationId: string, shopId: number) => {
    e.stopPropagation();
    e.preventDefault();
    
    const currentPos = stationPositions[stationId] || getDefaultStationPos(stationId, shopId);
    
    isDraggingStationRef.current = stationId;
    isDraggingStationParentShopIdRef.current = shopId;
    stationDragStartRef.current = { x: e.clientX, y: e.clientY };
    stationStartCoordsRef.current = { x: currentPos.x, y: currentPos.y };
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (resizingShopId !== null) {
      const id = resizingShopId;
      const shop = shops.find(s => s.id === id);
      if (shop) {
        const dx = (e.clientX - resizeStartRef.current.x) / zoomLevel;
        const dy = (e.clientY - resizeStartRef.current.y) / zoomLevel;
        const newWidth = Math.max(220, Math.min(800, resizeStartRef.current.width + dx));
        const newHeight = Math.max(240, Math.min(1000, resizeStartRef.current.height + dy));
        onUpdateShop(id, {
          widthPx: Math.round(newWidth),
          heightPx: Math.round(newHeight)
        });
      }
      return;
    }

    if (isDraggingStationRef.current !== null && isDraggingStationParentShopIdRef.current !== null) {
      const stationId = isDraggingStationRef.current;
      const shopId = isDraggingStationParentShopIdRef.current;
      const shop = shops.find(s => s.id === shopId);
      if (shop) {
        const dx = (e.clientX - stationDragStartRef.current.x) / zoomLevel;
        const dy = (e.clientY - stationDragStartRef.current.y) / zoomLevel;
        
        const nextX = Math.round(stationStartCoordsRef.current.x + dx);
        const nextY = Math.round(stationStartCoordsRef.current.y + dy);

        const shopWidth = getShopWidthPx(shop);
        const shopHeight = getShopHeightPx(shop);

        const boundedX = Math.max(8, Math.min(shopWidth - 118, nextX));
        const boundedY = Math.max(55, Math.min(shopHeight - 83, nextY));

        setStationPositions(prev => ({
          ...prev,
          [stationId]: { x: boundedX, y: boundedY }
        }));
      }
      return;
    }

    if (isDraggingOrGateRef.current !== null && isDraggingOrGateParentShopIdRef.current !== null) {
      const gateId = isDraggingOrGateRef.current;
      const shopId = isDraggingOrGateParentShopIdRef.current;
      const shop = shops.find(s => s.id === shopId);
      if (shop && shop.orGates) {
        const dx = (e.clientX - orGateDragStartRef.current.x) / zoomLevel;
        const dy = (e.clientY - orGateDragStartRef.current.y) / zoomLevel;
        
        const nextX = Math.round(orGateStartCoordsRef.current.x + dx);
        const nextY = Math.round(orGateStartCoordsRef.current.y + dy);

        const shopWidth = getShopWidthPx(shop);
        const shopHeight = getShopHeightPx(shop);

        const boundedX = Math.max(8, Math.min(shopWidth - 80, nextX));
        const boundedY = Math.max(55, Math.min(shopHeight - 80, nextY));

        const updatedGates = shop.orGates.map(g => g.id === gateId ? { ...g, posX: boundedX, posY: boundedY } : g);
        onUpdateShop(shopId, { orGates: updatedGates });
      }
      return;
    }

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
    isDraggingOrGateRef.current = null;
    isDraggingOrGateParentShopIdRef.current = null;
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

  const renderClipShape = (shape: string, color: string, borderSize?: number, width?: number, height?: number) => {
    const finalWidth = width !== undefined ? `${width}px` : '20px';
    const finalHeight = height !== undefined ? `${height}px` : '20px';
    const finalBorder = borderSize !== undefined ? `${borderSize}px` : '1px';

    const isHexColor = color && color.startsWith('#');

    const customStyles: React.CSSProperties = {
      width: finalWidth,
      height: finalHeight,
      borderWidth: finalBorder,
      borderColor: 'rgba(255,255,255,0.25)',
      backgroundColor: isHexColor ? color : undefined,
    };

    const commonClasses = "flex items-center justify-center shrink-0 shadow-sm transition-transform scale-95 border";
    const bgClass = isHexColor ? "" : color;

    switch (shape) {
      case 'pentagon':
        return (
          <div 
            className={`${commonClasses} ${bgClass}`}
            style={{ ...customStyles, clipPath: 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)' }}
          />
        );
      case 'heart':
        return (
          <div 
            className={`${commonClasses} ${bgClass}`}
            style={{ ...customStyles, clipPath: 'path("M12,5 C10.2,2 6,2.4 4,5 C1.5,8.2 4.4,13 12,19.2 C19.6,13 22.5,8.2 20,5 C18,2.4 13.8,2 12,5 Z")' }}
          />
        );
      case 'square':
        return (
          <div 
            className={`${commonClasses} ${bgClass} rounded-sm`}
            style={customStyles}
          />
        );
      case 'rectangle':
        return (
          <div 
            className={`${commonClasses} ${bgClass} rounded-sm`}
            style={{ ...customStyles, width: width !== undefined ? `${width}px` : '28px', height: height !== undefined ? `${height}px` : '16px' }}
          />
        );
      case 'triangle':
        return (
          <div 
            className={`${commonClasses} ${bgClass}`}
            style={{ ...customStyles, clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)' }}
          />
        );
      case 'diamond':
        return (
          <div 
            className={`${commonClasses} ${bgClass}`}
            style={{ ...customStyles, clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }}
          />
        );
      case 'oval':
        return (
          <div 
            className={`${commonClasses} ${bgClass} rounded-full`}
            style={customStyles}
          />
        );
      case 'circle': {
        const side = width !== undefined && height !== undefined ? Math.min(width, height) : 20;
        return (
          <div 
            className={`${commonClasses} ${bgClass} rounded-full`}
            style={{ ...customStyles, width: `${side}px`, height: `${side}px` }}
          />
        );
      }
      default:
        return (
          <div 
            className={`${commonClasses} ${bgClass || 'bg-primary'}`}
            style={customStyles}
          />
        );
    }
  };

  const renderClipShapeWithFit = (shape: string, color: string, borderSize?: number, width?: number, height?: number, maxFitSize: number = 24) => {
    const originalWidth = width ?? 20;
    const originalHeight = height ?? 20;
    const maxDim = Math.max(originalWidth, originalHeight);
    
    const scale = maxDim > maxFitSize ? maxFitSize / maxDim : 1;
    const finalWidth = Math.round(originalWidth * scale);
    const finalHeight = Math.round(originalHeight * scale);
    const finalBorder = borderSize !== undefined ? Math.max(1, Math.round(borderSize * scale)) : 1;
    
    return renderClipShape(shape, color, finalBorder, finalWidth, finalHeight);
  };

  return (
    <div className="flex flex-1 overflow-hidden h-full">
      {/* Sidebar navigation and buffer modifier */}
      {!isSidebarHidden && (
        <aside className="w-64 border-r border-outline-variant flex flex-col bg-surface-container-low p-4 gap-4 shrink-0 select-none z-10 overflow-y-auto max-h-screen scrollbar-none">
          <div className="flex-1">
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
            <li>
              <button 
                type="button"
                onClick={() => setIsSavedProjectsOpen(true)}
                className={`w-full flex items-center justify-between px-4 py-2 rounded font-mono uppercase tracking-wider transition-all text-left ${
                  isSavedProjectsOpen
                    ? 'bg-[#1b2640] text-primary border-l-2 border-primary font-bold cursor-pointer'
                    : 'text-on-surface-variant hover:bg-surface-container-high cursor-pointer'
                }`}
                style={{ fontSize: `${taskbarFontSize}px` }}
                title="View saved layouts screen"
              >
                <div className="flex items-center gap-3">
                  <FolderHeart className="w-4 h-4 shrink-0 text-primary" style={{ width: `${taskbarFontSize + 4}px`, height: `${taskbarFontSize + 4}px` }} />
                  <span>Saved Projects</span>
                </div>
                {savedProjects && savedProjects.length > 0 && (
                  <span className="text-[9px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-bold">
                    {savedProjects.length}
                  </span>
                )}
              </button>
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

          {/* Section: Blueprint Template */}
          <div className="mt-4 border-t border-outline-variant/30 pt-4 text-left">
            <div className="flex items-center gap-1.5 mb-3 text-[#adc6ff] select-none">
              <Settings className="w-4 h-4 shrink-0 text-primary" style={{ width: `${taskbarFontSize + 3}px`, height: `${taskbarFontSize + 3}px` }} />
              <h3 className="font-mono text-xs uppercase tracking-wider text-primary font-bold flex items-center gap-1.5">
                Blueprint Template
              </h3>
            </div>

            <span className="text-[10px] font-mono text-[#8e909a] font-bold uppercase tracking-wider block mb-2">
              SELECT SHAPE:
            </span>

            <div className="grid grid-cols-4 gap-2 mb-4">
              {[
                { id: 'rectangle', label: 'rectang..' },
                { id: 'pentagon', label: 'pentagon' },
                { id: 'heart', label: 'heart' },
                { id: 'square', label: 'square' },
                { id: 'triangle', label: 'triangle' },
                { id: 'diamond', label: 'diamond' },
                { id: 'oval', label: 'oval' },
                { id: 'circle', label: 'circle' },
              ].map((sh) => {
                const isActive = sidebarInShop.partShape === sh.id;
                const shapeColor = isActive ? (sidebarInShop.paintFillColor || '#FF5733') : '#313e56';
                return (
                  <button
                    key={sh.id}
                    type="button"
                    onClick={() => onUpdateShop(sidebarInShop.id, { partShape: sh.id as any })}
                    className={`flex flex-col items-center justify-center p-2 rounded-lg border bg-[#11192e]/60 transition-all hover:bg-[#15223f] cursor-pointer ${
                      isActive 
                        ? 'border-primary ring-1 ring-primary/30' 
                        : 'border-outline-variant/20 hover:border-outline-variant/40'
                    }`}
                  >
                    <div className="h-6 w-full flex items-center justify-center mb-1">
                      {renderClipShape(sh.id, shapeColor, 1.5, 18, 18)}
                    </div>
                    <span className="text-[9px] font-mono font-semibold text-on-surface-variant truncate w-full text-center">
                      {sh.label}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="space-y-4 mb-4">
              {/* WIDTH */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-[10px] font-mono text-[#8e909a] font-bold uppercase tracking-wider">
                    WIDTH:
                  </label>
                  <span className="text-[10px] font-mono font-bold text-primary">
                    {sidebarInShop.partWidth || 50} mm
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="20"
                    max="100"
                    value={sidebarInShop.partWidth || 50}
                    onChange={(e) => onUpdateShop(sidebarInShop.id, { partWidth: parseInt(e.target.value) })}
                    className="flex-1 accent-primary bg-surface-container-high h-1.5 rounded-lg appearance-none cursor-pointer"
                  />
                  <input
                    type="number"
                    min="20"
                    max="100"
                    value={sidebarInShop.partWidth || 50}
                    onChange={(e) => {
                      const val = Math.min(100, Math.max(20, parseInt(e.target.value) || 20));
                      onUpdateShop(sidebarInShop.id, { partWidth: val });
                    }}
                    className="w-12 bg-[#0d162a] border border-[#2d3a58]/40 py-0.5 px-1.5 rounded text-center text-xs font-bold text-on-surface focus:outline-none"
                  />
                </div>
              </div>

              {/* LENGTH / HEIGHT */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-[10px] font-mono text-[#8e909a] font-bold uppercase tracking-wider">
                    LENGTH / HEIGHT:
                  </label>
                  <span className="text-[10px] font-mono font-bold text-primary">
                    {sidebarInShop.partHeight || 50} mm
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="20"
                    max="100"
                    value={sidebarInShop.partHeight || 50}
                    onChange={(e) => onUpdateShop(sidebarInShop.id, { partHeight: parseInt(e.target.value) })}
                    className="flex-1 accent-primary bg-surface-container-high h-1.5 rounded-lg appearance-none cursor-pointer"
                  />
                  <input
                    type="number"
                    min="20"
                    max="100"
                    value={sidebarInShop.partHeight || 50}
                    onChange={(e) => {
                      const val = Math.min(100, Math.max(20, parseInt(e.target.value) || 20));
                      onUpdateShop(sidebarInShop.id, { partHeight: val });
                    }}
                    className="w-12 bg-[#0d162a] border border-[#2d3a58]/40 py-0.5 px-1.5 rounded text-center text-xs font-bold text-on-surface focus:outline-none"
                  />
                </div>
              </div>

              {/* BORDER THICKNESS */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-[10px] font-mono text-[#8e909a] font-bold uppercase tracking-wider">
                    BORDER THICKNESS:
                  </label>
                  <span className="text-[10px] font-mono font-bold text-primary">
                    {sidebarInShop.paintStrokeWidth || 3} px
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={sidebarInShop.paintStrokeWidth || 3}
                    onChange={(e) => onUpdateShop(sidebarInShop.id, { paintStrokeWidth: parseInt(e.target.value) })}
                    className="flex-1 accent-primary bg-surface-container-high h-1.5 rounded-lg appearance-none cursor-pointer"
                  />
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={sidebarInShop.paintStrokeWidth || 3}
                    onChange={(e) => {
                      const val = Math.min(10, Math.max(1, parseInt(e.target.value) || 1));
                      onUpdateShop(sidebarInShop.id, { paintStrokeWidth: val });
                    }}
                    className="w-12 bg-[#0d162a] border border-[#2d3a58]/40 py-0.5 px-1.5 rounded text-center text-xs font-bold text-on-surface focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-outline-variant/15 text-left">
              <label className="block text-[10px] font-mono text-[#8e909a] font-bold uppercase tracking-wider mb-2">
                FILL COLOR (HEX):
              </label>
              
              <div className="flex gap-2 items-center mb-3">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={sidebarInShop.paintFillColor || '#FF5733'}
                    onChange={(e) => onUpdateShop(sidebarInShop.id, { paintFillColor: e.target.value })}
                    className="w-full bg-[#0d162a] border border-[#2d3a58]/45 py-1.5 px-3 rounded-lg text-xs font-bold text-on-surface focus:outline-none pl-9 uppercase font-mono"
                  />
                  <div 
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 rounded border border-white/20"
                    style={{ backgroundColor: sidebarInShop.paintFillColor || '#FF5733' }}
                  />
                </div>
                <input
                  type="color"
                  value={sidebarInShop.paintFillColor || '#FF5733'}
                  onChange={(e) => onUpdateShop(sidebarInShop.id, { paintFillColor: e.target.value })}
                  className="w-8 h-8 p-0 bg-transparent border-0 cursor-pointer rounded overflow-hidden shrink-0"
                />
              </div>

              {/* Preset Color Swatches */}
              <div className="grid grid-cols-8 gap-1.5">
                {[
                  '#FF5733', // Orange/Vermilion
                  '#3B82F6', // Blue
                  '#EF4444', // Red
                  '#10B981', // Emerald
                  '#F59E0B', // Yellow/Amber
                  '#8B5CF6', // Purple
                  '#EC4899', // Pink
                  '#60A5FA', // Light blue
                ].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => onUpdateShop(sidebarInShop.id, { paintFillColor: c })}
                    className={`h-5 rounded-md border cursor-pointer transition-all ${
                      (sidebarInShop.paintFillColor || '#FF5733').toLowerCase() === c.toLowerCase()
                        ? 'border-white scale-110 shadow-md ring-1 ring-white/20'
                        : 'border-transparent hover:scale-105'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>



        </div>



        {/* System Integrity display inside sidebar footer */}
        <div className="pt-4 border-t border-outline-variant/30 text-left text-xs">
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
        <div className="absolute bottom-16 right-6 z-20 bg-[#121c33]/92 border border-[#2d3a58]/45 p-2.5 rounded-lg backdrop-blur-sm shadow-xl flex items-center gap-2.5 select-none animate-fade-in">
          <button 
            type="button"
            onClick={() => { setPanX(40); setPanY(10); setZoomLevel(0.95); }}
            className="text-on-surface-variant hover:text-primary transition-all text-[9px] uppercase font-mono font-bold tracking-tight cursor-pointer"
            title="Reset Pan & coordinates"
          >
            Reset Camera
          </button>
          <div className="h-3.5 w-px bg-outline-variant/30" />
          <div className="flex items-center gap-1.5">
            {/* Zoom Out Button option */}
            <button 
              type="button"
              onClick={handleZoomOut}
              disabled={zoomLevel <= 0.65}
              className="text-[#dae2fd] hover:text-primary transition-colors cursor-pointer disabled:opacity-40"
              title="Zoom Canvas Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            {/* Live Percent level Display */}
            <span className="font-mono text-[10px] font-bold text-primary min-w-[26px] text-center">
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
              <ZoomIn className="w-3.5 h-3.5" />
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

              {/* OR Gate Cable Connections */}
              {shops.flatMap(shop => (shop.orGates || []).map(og => {
                const headerHeight = 53;
                const ogPos = getOrGatePos(og, shop.id);
                const gateX = shop.posX + ogPos.x + 24;
                const gateY = shop.posY + headerHeight + ogPos.y + 24;

                // Connection A (Positive Branch)
                let targetAX = shop.posX + getShopWidthPx(shop) / 2;
                let targetAY = shop.posY + getShopHeightPx(shop) - 20;
                if (og.targetStationA && og.targetStationA !== 'exit') {
                  if (og.targetStationA.startsWith('orgate-')) {
                    const otherOg = (shop.orGates || []).find(g => g.id === og.targetStationA);
                    if (otherOg) {
                      const otherOgPos = getOrGatePos(otherOg, shop.id);
                      targetAX = shop.posX + otherOgPos.x + 24;
                      targetAY = shop.posY + headerHeight + otherOgPos.y + 24;
                    }
                  } else {
                    const pos = stationPositions[og.targetStationA] || getDefaultStationPos(og.targetStationA, shop.id);
                    targetAX = shop.posX + pos.x + 55;
                    targetAY = shop.posY + headerHeight + pos.y + 37.5;
                  }
                }

                // Connection B (Negative Branch)
                let targetBX = shop.posX + getShopWidthPx(shop) / 2;
                let targetBY = shop.posY + getShopHeightPx(shop) - 20;
                if (og.targetStationB && og.targetStationB !== 'exit') {
                  if (og.targetStationB.startsWith('orgate-')) {
                    const otherOg = (shop.orGates || []).find(g => g.id === og.targetStationB);
                    if (otherOg) {
                      const otherOgPos = getOrGatePos(otherOg, shop.id);
                      targetBX = shop.posX + otherOgPos.x + 24;
                      targetBY = shop.posY + headerHeight + otherOgPos.y + 24;
                    }
                  } else {
                    const pos = stationPositions[og.targetStationB] || getDefaultStationPos(og.targetStationB, shop.id);
                    targetBX = shop.posX + pos.x + 55;
                    targetBY = shop.posY + headerHeight + pos.y + 37.5;
                  }
                }

                return (
                  <g key={`orgate-cables-${og.id}`}>
                    {/* Path to Target A (Green Positive Route) */}
                    <path
                      d={`M ${gateX} ${gateY} C ${gateX} ${(gateY + targetAY)/2}, ${targetAX} ${(gateY + targetAY)/2}, ${targetAX} ${targetAY}`}
                      className="fill-none stroke-emerald-950/80 stroke-[5]"
                    />
                    <path
                      d={`M ${gateX} ${gateY} C ${gateX} ${(gateY + targetAY)/2}, ${targetAX} ${(gateY + targetAY)/2}, ${targetAX} ${targetAY}`}
                      className="fill-none stroke-emerald-500/85 stroke-[2] stroke-dasharray-[5_8]"
                      style={{
                        strokeDashoffset: isSimRunning ? `${-simulatedElapsed * 16}px` : '0px'
                      }}
                      markerEnd="url(#arrowhead)"
                    />

                    {/* Path to Target B (Rose Negative Route) */}
                    <path
                      d={`M ${gateX} ${gateY} C ${gateX} ${(gateY + targetBY)/2}, ${targetBX} ${(gateY + targetBY)/2}, ${targetBX} ${targetBY}`}
                      className="fill-none stroke-rose-950/80 stroke-[5]"
                    />
                    <path
                      d={`M ${gateX} ${gateY} C ${gateX} ${(gateY + targetBY)/2}, ${targetBX} ${(gateY + targetBY)/2}, ${targetBX} ${targetBY}`}
                      className="fill-none stroke-rose-500/85 stroke-[2] stroke-dasharray-[5_8]"
                      style={{
                        strokeDashoffset: isSimRunning ? `${-simulatedElapsed * 16}px` : '0px'
                      }}
                      markerEnd="url(#arrowhead)"
                    />
                  </g>
                );
              }))}
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
                      {renderClipShapeWithFit(qp.shape, qp.color, qp.borderSize, qp.width, qp.height, 22)}
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
                    startX = shop.posX - 25;
                    startY = shop.posY + 85;
                    endX = shop.posX + targetStPos.x;
                    endY = shop.posY + headerHeight + targetStPos.y + 37.5;
                  }
                } else if (isStationTransfer && shop) {
                  // Moving station-to-station / station-to-orgate / orgate-to-station / orgate-to-orgate in current shop
                  const isStartOrGate = fp.fromStationId?.startsWith('orgate-') ?? false;
                  const isEndOrGate = (fp.toId as string).startsWith('orgate-');
                  const isEndExit = fp.toId === 'exit';

                  // Start Coord
                  if (isStartOrGate) {
                    const og = (shop.orGates || []).find(g => g.id === fp.fromStationId);
                    if (og) {
                      const ogPos = getOrGatePos(og, shop.id);
                      const isYesBranch = fp.toId === og.targetStationA;
                      startX = shop.posX + ogPos.x + 36;
                      if (isYesBranch) {
                        startY = shop.posY + headerHeight + ogPos.y;
                      } else {
                        startY = shop.posY + headerHeight + ogPos.y + 72;
                      }
                    }
                  } else if (fp.fromStationId) {
                    const sourceStPos = stationPositions[fp.fromStationId] || getDefaultStationPos(fp.fromStationId, shop.id);
                    startX = shop.posX + sourceStPos.x + 55;
                    startY = shop.posY + headerHeight + sourceStPos.y + 37.5;
                  }

                  // End Coord
                  if (isEndExit) {
                    endX = shop.posX + getShopWidthPx(shop) / 2;
                    endY = shop.posY + (shop.isOutputShop ? -23 : getShopHeightPx(shop) - 20);
                  } else if (isEndOrGate) {
                    const og = (shop.orGates || []).find(g => g.id === fp.toId);
                    if (og) {
                      const ogPos = getOrGatePos(og, shop.id);
                      endX = shop.posX + ogPos.x;
                      endY = shop.posY + headerHeight + ogPos.y + 36;
                    }
                  } else {
                    const targetStPos = stationPositions[fp.toId] || getDefaultStationPos(fp.toId as string, shop.id);
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
                if (isSimpleView) {
                  const isStartOrGate = fp.fromStationId?.startsWith('orgate-') ?? false;
                  const isEndOrGate = (fp.toId as string).startsWith('orgate-');
                  const isEndExit = fp.toId === 'exit';

                  const shop = shops.find(s => s.id === fp.fromId);
                  const headerHeight = 53;
                  if (shop) {
                    // Call our orthogonal interpolation
                    const relativeStartX = startX - shop.posX;
                    const relativeStartY = startY - (shop.posY + headerHeight);
                    const relativeEndX = endX - shop.posX;
                    const relativeEndY = endY - (shop.posY + headerHeight);

                    const localPos = interpolateOrthogonal(
                      relativeStartX,
                      relativeStartY,
                      relativeEndX,
                      relativeEndY,
                      fp.progress,
                      isStartOrGate,
                      isEndOrGate,
                      isEndExit,
                      isStartOrGate, // skipStartClip if it is an OR Gate
                      isEndOrGate    // skipEndClip if it is an OR Gate
                    );

                    currentX = shop.posX + localPos.x;
                    currentY = shop.posY + headerHeight + localPos.y;
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
              } else if (fp.fromId === 'import_conveyor') {
                const shop = shops.find(s => s.isInputShop);
                if (shop) {
                  const relativeStartX = startX - shop.posX;
                  const relativeStartY = startY - shop.posY;
                  const relativeEndX = endX - shop.posX;
                  const relativeEndY = endY - shop.posY;
                  const localPos = interpolateImportOrthogonal(
                    relativeStartX,
                    relativeStartY,
                    relativeEndX,
                    relativeEndY,
                    fp.progress
                  );
                  currentX = shop.posX + localPos.x;
                  currentY = shop.posY + localPos.y;
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
                  {renderClipShapeWithFit(fp.shape, fp.color, fp.borderSize, fp.width, fp.height, 20)}
                  {fp.isReworking && (
                    <div className="absolute -inset-2 rounded-full border-2 border-yellow-500 animate-ping opacity-75" />
                  )}
                  {fp.isReworking && (
                    <span className="absolute -top-4 left-1/2 -translate-x-1/2 bg-yellow-500 text-[6px] text-slate-900 font-black px-1 rounded uppercase tracking-tighter">
                      FIXING
                    </span>
                  )}
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
                          const orGates = shop.orGates || [];

                          const stationConveyors = ssState.stations.flatMap((st, sIdx) => {
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
                            } else if (targetSuccessor.startsWith('orgate-')) {
                              const og = orGates.find(g => g.id === targetSuccessor);
                              if (og) {
                                const ogPos = getOrGatePos(og, shop.id);
                                endX = ogPos.x;
                                endY = ogPos.y + 36;
                              } else {
                                endX = getShopWidthPx(shop) / 2;
                                endY = getShopHeightPx(shop) - 20 - 53;
                              }
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
                              const importStartY = 85;
                              const importEndX = currentPos.x;
                              const importEndY = currentPos.y + 37.5;
                              const pathD = getImportOrthogonalPath(importStartX, importStartY, importEndX, importEndY);
                              const isImportActive = isSimRunning && (flyingParts.some(fp => fp.toId === st.id && fp.fromId === 'import_conveyor') || st.parts.length > 0);

                              elements.push(
                                <g key={`flow-import-${st.id}`}>
                                  {/* Heavy border */}
                                  <path
                                    d={pathD}
                                    stroke="#3b0764"
                                    strokeWidth="8"
                                    strokeLinecap="round"
                                    fill="none"
                                    opacity="0.85"
                                  />
                                  {/* Inner channel */}
                                  <path
                                    d={pathD}
                                    stroke="#0b0f19"
                                    strokeWidth="5.5"
                                    strokeLinecap="round"
                                    fill="none"
                                  />
                                  {/* Rotating traction slots */}
                                  <path
                                    d={pathD}
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
                                    d={pathD}
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

                            // Check if the target is a connected OR Gate
                            const isTargetOrGate = targetSuccessor.startsWith('orgate-');

                            // Use getOrthogonalPath for standard station conveyors!
                            const { path: pathD, labelX, labelY } = getOrthogonalPath(
                              startX,
                              startY,
                              endX,
                              endY,
                              false, // isStartOrGate
                              isTargetOrGate,
                              isExit,
                              false, // skipStartClip
                              isTargetOrGate // skipEndClip if it is an OR Gate
                            );

                            const targetSuccessorName = isExit ? "Exit" : (isTargetOrGate ? (orGates.find(g => g.id === targetSuccessor)?.name || 'OR Gate') : (ssState.stations.find(station => station.id === targetSuccessor)?.name || 'Station'));
                            const conveyorLabel = `CV: ${st.name} ➔ ${targetSuccessorName}`;

                            if (isExit) {
                              elements.push(
                                <g key={`flow-straight-exit-${st.id}`}>
                                  {/* Heavy border */}
                                  <path
                                    d={pathD}
                                    stroke="#431407"
                                    strokeWidth="8"
                                    strokeLinecap="round"
                                    fill="none"
                                    opacity="0.8"
                                  />
                                  {/* Inner channel */}
                                  <path
                                    d={pathD}
                                    stroke="#0b0f19"
                                    strokeWidth="5"
                                    strokeLinecap="round"
                                    fill="none"
                                  />
                                  {/* Roller Slats */}
                                  <path
                                    d={pathD}
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
                                    d={pathD}
                                    stroke={isFlowing ? "#f97316" : "#fb923c"}
                                    strokeWidth="2"
                                    fill="none"
                                    opacity="0.9"
                                    strokeDasharray="5 5"
                                    style={{
                                      animation: isFlowing ? 'stroke-flow 0.8s linear infinite' : 'none'
                                    }}
                                  />
                                  {/* Conveyor label */}
                                  <text
                                    x={labelX}
                                    y={labelY - 5}
                                    fill="#f97316"
                                    stroke="#050a14"
                                    strokeWidth="3"
                                    paintOrder="stroke"
                                    fontSize="7.5"
                                    fontWeight="bold"
                                    fontFamily="monospace"
                                    textAnchor="middle"
                                    className="select-none pointer-events-none opacity-80"
                                  >
                                    {conveyorLabel}
                                  </text>
                                </g>
                              );
                            } else {
                              elements.push(
                                <g key={`flow-straight-${st.id}-${targetSuccessor}`}>
                                  {/* Heavy border */}
                                  <path
                                    d={pathD}
                                    stroke="#1e293b"
                                    strokeWidth="7"
                                    strokeLinecap="round"
                                    fill="none"
                                    opacity="0.9"
                                  />
                                  {/* Inner beltway */}
                                  <path
                                    d={pathD}
                                    stroke="#0b0f19"
                                    strokeWidth="5"
                                    strokeLinecap="round"
                                    fill="none"
                                  />
                                  {/* Static Roller Slat Lines */}
                                  <path
                                    d={pathD}
                                    stroke="#475569"
                                    strokeWidth="3.5"
                                    strokeDasharray="2 5"
                                    fill="none"
                                    opacity="0.25"
                                  />
                                  {/* Active rollers */}
                                  <path
                                    d={pathD}
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
                                    d={pathD}
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
                                  {/* Conveyor label */}
                                  <text
                                    x={labelX}
                                    y={labelY - 5}
                                    fill="#38bdf8"
                                    stroke="#050a14"
                                    strokeWidth="3"
                                    paintOrder="stroke"
                                    fontSize="7.5"
                                    fontWeight="bold"
                                    fontFamily="monospace"
                                    textAnchor="middle"
                                    className="select-none pointer-events-none opacity-80"
                                  >
                                    {conveyorLabel}
                                  </text>
                                </g>
                              );
                            }

                            return elements;
                          });

                          // Render OR Gate exit conveyors (Yes and No paths)
                          const orGateExits = orGates.flatMap((og) => {
                            const ogElements: React.JSX.Element[] = [];
                            const ogPos = getOrGatePos(og, shop.id);
                            
                            const startX_A = ogPos.x + 36;
                            const startY_A = ogPos.y;
                            const startX_B = ogPos.x + 36;
                            const startY_B = ogPos.y + 72;

                            const yesTargetName = (() => {
                              const target = og.targetStationA;
                              if (target === 'exit') return 'Exit';
                              if (target.startsWith('orgate-')) {
                                  return (shop.orGates || []).find(g => g.id === target)?.name || 'OR Gate';
                              }
                              return (shop.stationsData || []).find(s => s.id === target)?.name || target;
                            })();

                            const noTargetName = (() => {
                              const target = og.targetStationB;
                              if (target === 'exit') return 'Exit';
                              if (target.startsWith('orgate-')) {
                                return (shop.orGates || []).find(g => g.id === target)?.name || 'OR Gate';
                              }
                              return (shop.stationsData || []).find(s => s.id === target)?.name || target;
                            })();

                            // 1. YES (targetStationA) Connection Target
                            let endX_A = 0;
                            let endY_A = 0;
                            const isExit_A = og.targetStationA === 'exit';

                            if (isExit_A) {
                              endX_A = getShopWidthPx(shop) / 2;
                              const headerHeight = 53;
                              endY_A = shop.isOutputShop ? -23 : getShopHeightPx(shop) - 20 - headerHeight;
                            } else if (og.targetStationA.startsWith('orgate-')) {
                              const targetOg = orGates.find(g => g.id === og.targetStationA);
                              if (targetOg) {
                                const targetOgPos = getOrGatePos(targetOg, shop.id);
                                endX_A = targetOgPos.x;
                                endY_A = targetOgPos.y + 36;
                              } else {
                                endX_A = getShopWidthPx(shop) / 2;
                                endY_A = getShopHeightPx(shop) - 20 - 53;
                              }
                            } else {
                              const succStation = ssState.stations.find(station => station.id === og.targetStationA);
                              if (succStation) {
                                const succPos = stationPositions[succStation.id] || getDefaultStationPos(succStation.id, shop.id);
                                endX_A = succPos.x + 55;
                                endY_A = succPos.y + 37.5;
                              } else {
                                endX_A = getShopWidthPx(shop) / 2;
                                endY_A = getShopHeightPx(shop) - 20 - 53;
                              }
                            }

                            // 2. NO (targetStationB) Connection Target
                            let endX_B = 0;
                            let endY_B = 0;
                            const isExit_B = og.targetStationB === 'exit';

                            if (isExit_B) {
                              endX_B = getShopWidthPx(shop) / 2;
                              const headerHeight = 53;
                              endY_B = shop.isOutputShop ? -23 : getShopHeightPx(shop) - 20 - headerHeight;
                            } else if (og.targetStationB.startsWith('orgate-')) {
                              const targetOg = orGates.find(g => g.id === og.targetStationB);
                              if (targetOg) {
                                const targetOgPos = getOrGatePos(targetOg, shop.id);
                                endX_B = targetOgPos.x;
                                endY_B = targetOgPos.y + 36;
                              } else {
                                endX_B = getShopWidthPx(shop) / 2;
                                endY_B = getShopHeightPx(shop) - 20 - 53;
                              }
                            } else {
                              const succStation = ssState.stations.find(station => station.id === og.targetStationB);
                              if (succStation) {
                                const succPos = stationPositions[succStation.id] || getDefaultStationPos(succStation.id, shop.id);
                                endX_B = succPos.x + 55;
                                endY_B = succPos.y + 37.5;
                              } else {
                                endX_B = getShopWidthPx(shop) / 2;
                                endY_B = getShopHeightPx(shop) - 20 - 53;
                              }
                            }

                            // original single gate exit drawing logic
                            const isFlowingYes = isSimRunning && flyingParts.some(fp => fp.fromId === og.id && (fp.toId === og.targetStationA || fp.toId === 'conveyor' || typeof fp.toId === 'number'));
                            const isFlowingNo = isSimRunning && flyingParts.some(fp => fp.fromId === og.id && (fp.toId === og.targetStationB || fp.toId === 'conveyor' || typeof fp.toId === 'number'));

                            // Clip and get orthogonal path for YES path
                            const isEndOrGate_A = og.targetStationA.startsWith('orgate-');
                            const { path: pathD_A, labelX: labelX_A, labelY: labelY_A } = getOrthogonalPath(
                              startX_A, startY_A, endX_A, endY_A,
                              true, // isStartOrGate
                              isEndOrGate_A, isExit_A,
                              true, // skipStartClip
                              isEndOrGate_A // skipEndClip
                            );

                            const yesPathName = `CV: ${og.name} ➔ ${yesTargetName} (YES)`;

                            // Draw YES connection
                            ogElements.push(
                              <g key={`flow-yes-${og.id}`}>
                                <path
                                  d={pathD_A}
                                  stroke="#7c2d12"
                                  strokeWidth="6"
                                  strokeLinecap="round"
                                  fill="none"
                                  opacity="0.9"
                                />
                                <path
                                  d={pathD_A}
                                  stroke="#0b0f19"
                                  strokeWidth="4"
                                  strokeLinecap="round"
                                  fill="none"
                                />
                                <path
                                  d={pathD_A}
                                  stroke="#ea580c"
                                  strokeWidth="2.5"
                                  strokeDasharray="4 8"
                                  fill="none"
                                  opacity="0.75"
                                  style={{
                                    strokeDashoffset: isSimRunning ? `${simulatedElapsed * 12}px` : '0px'
                                  }}
                                />
                                <path
                                  d={pathD_A}
                                  stroke={isFlowingYes ? "#f97316" : "#fdba74"}
                                  strokeWidth="1.8"
                                  fill="none"
                                  opacity="0.9"
                                  strokeDasharray="5 5"
                                  style={{
                                    animation: isFlowingYes ? 'stroke-flow 0.8s linear infinite' : 'none'
                                  }}
                                  markerEnd={isFlowingYes ? `url(#arrow-flowing-${shop.id})` : `url(#arrow-idle-${shop.id})`}
                                />
                                <text
                                  x={labelX_A}
                                  y={labelY_A - 5}
                                  fill="#fdba74"
                                  stroke="#0c0301"
                                  strokeWidth="3"
                                  paintOrder="stroke"
                                  fontSize="7.5"
                                  fontWeight="bold"
                                  fontFamily="monospace"
                                  textAnchor="middle"
                                  opacity="0.95"
                                  className="select-none pointer-events-none"
                                >
                                  {yesPathName}
                                </text>
                              </g>
                            );

                            // Clip and get orthogonal path for NO path
                            const isEndOrGate_B = og.targetStationB.startsWith('orgate-');
                            const { path: pathD_B, labelX: labelX_B, labelY: labelY_B } = getOrthogonalPath(
                              startX_B, startY_B, endX_B, endY_B,
                              true, // isStartOrGate
                              isEndOrGate_B, isExit_B,
                              true, // skipStartClip
                              isEndOrGate_B // skipEndClip
                            );

                            const noPathName = `CV: ${og.name} ➔ ${noTargetName} (NO)`;

                            // Draw NO connection
                            ogElements.push(
                              <g key={`flow-no-${og.id}`}>
                                <path
                                  d={pathD_B}
                                  stroke="#4c0519"
                                  strokeWidth="6"
                                  strokeLinecap="round"
                                  fill="none"
                                  opacity="0.9"
                                />
                                <path
                                  d={pathD_B}
                                  stroke="#0b0f19"
                                  strokeWidth="4"
                                  strokeLinecap="round"
                                  fill="none"
                                />
                                <path
                                  d={pathD_B}
                                  stroke="#be123c"
                                  strokeWidth="2.5"
                                  strokeDasharray="4 8"
                                  fill="none"
                                  opacity="0.75"
                                  style={{
                                    strokeDashoffset: isSimRunning ? `${simulatedElapsed * 12}px` : '0px'
                                  }}
                                />
                                <path
                                  d={pathD_B}
                                  stroke={isFlowingNo ? "#ef4444" : "#fda4af"}
                                  strokeWidth="1.8"
                                  fill="none"
                                  opacity="0.9"
                                  strokeDasharray="5 5"
                                  style={{
                                    animation: isFlowingNo ? 'stroke-flow 0.8s linear infinite' : 'none'
                                  }}
                                  markerEnd={isFlowingNo ? `url(#arrow-flowing-${shop.id})` : `url(#arrow-idle-${shop.id})`}
                                />
                                <text
                                  x={labelX_B}
                                  y={labelY_B - 5}
                                  fill="#fda4af"
                                  stroke="#0f0104"
                                  strokeWidth="3"
                                  paintOrder="stroke"
                                  fontSize="7.5"
                                  fontWeight="bold"
                                  fontFamily="monospace"
                                  textAnchor="middle"
                                  opacity="0.95"
                                  className="select-none pointer-events-none"
                                >
                                  {noPathName}
                                </text>
                              </g>
                            );

                            return ogElements;
                          });

                          return [...stationConveyors, ...orGateExits];
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
                            title={`${st.name} (Drag to rearrange layout)`}
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
                                      {renderClipShapeWithFit(st.parts[0].shape, st.parts[0].color, st.parts[0].borderSize, st.parts[0].width, st.parts[0].height, 16)}
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

                      {(shop.orGates || []).map((og) => {
                        const yesTargetName = (() => {
                          const target = og.targetStationA;
                          if (target === 'exit') return 'Exit';
                          if (target.startsWith('orgate-')) {
                            return (shop.orGates || []).find(g => g.id === target)?.name || 'OR Gate';
                          }
                          return (shop.stationsData || []).find(s => s.id === target)?.name || target;
                        })();

                        const noTargetName = (() => {
                          const target = og.targetStationB;
                          if (target === 'exit') return 'Exit';
                          if (target.startsWith('orgate-')) {
                            return (shop.orGates || []).find(g => g.id === target)?.name || 'OR Gate';
                          }
                          return (shop.stationsData || []).find(s => s.id === target)?.name || target;
                        })();

                        const ogPos = getOrGatePos(og, shop.id);
                        return (
                          <div
                            key={og.id}
                            onMouseDown={(e) => handleOrGateMouseDown(e, og.id, shop.id)}
                            style={{
                              position: 'absolute',
                              left: `${ogPos.x}px`,
                              top: `${ogPos.y}px`,
                              width: '72px',
                              height: '72px',
                              zIndex: isDraggingOrGateRef.current === og.id ? 45 : 15,
                            }}
                            className="flex items-center justify-center pointer-events-auto cursor-grab active:cursor-grabbing group"
                            title={`${og.name} Routing Gate (Drag to move)\nIF [${og.criteriaCategory.toUpperCase()}] is "${og.criteriaValue.toUpperCase()}"\n➔ YES (Match) to: ${yesTargetName}\n➔ NO (No Match) to: ${noTargetName}`}
                          >
                            {/* Rotated diamond background */}
                            <div className="absolute w-[56px] h-[56px] rotate-45 border-2 border-orange-500 bg-[#221208] shadow-[0_0_14px_rgba(249,115,22,0.65)] transition-transform duration-200 group-hover:scale-105">
                              <div className="absolute inset-1 border border-orange-400/20 rotate-45" />
                            </div>
                            {/* Non-rotated text layer */}
                            <div className="absolute inset-0 flex flex-col items-center justify-center select-none pointer-events-none">
                              <span className="font-bold text-[11px] leading-none tracking-wider text-orange-400 font-mono">OR</span>
                              <span className="text-[7.5px] leading-none font-semibold text-orange-500/85 font-mono mt-0.5">GATE</span>
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
                                      {renderClipShapeWithFit(activePart.shape, activePart.color, activePart.borderSize, activePart.width, activePart.height, 22)}
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
                                        {renderClipShapeWithFit(qp.shape, qp.color, qp.borderSize, qp.width, qp.height, 14)}
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
                                        {renderClipShapeWithFit(movingPartOnThisBelt.shape, movingPartOnThisBelt.color, movingPartOnThisBelt.borderSize, movingPartOnThisBelt.width, movingPartOnThisBelt.height, 16)}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}
                          </React.Fragment>
                        );
                      })}

                      {/* Active OR Gates in Detailed View */}
                      {shop.orGates && shop.orGates.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-dashed border-[#1f2d4d]/60 space-y-3">
                          <div className="flex items-center gap-1.5 px-1 select-none">
                            <div className="w-2.5 h-2.5 rotate-45 bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.6)]" />
                            <span className="text-[10px] font-bold text-orange-400 tracking-wider font-sans uppercase">Active OR Gate Routing Control</span>
                          </div>

                          {shop.orGates.map((og) => {
                            const yesTargetName = (() => {
                              const target = og.targetStationA;
                              if (target === 'exit') return 'Exit';
                              if (target.startsWith('orgate-')) {
                                return (shop.orGates || []).find(g => g.id === target)?.name || 'OR Gate';
                              }
                              return (shop.stationsData || []).find(s => s.id === target)?.name || target;
                            })();

                            const noTargetName = (() => {
                              const target = og.targetStationB;
                              if (target === 'exit') return 'Exit';
                              if (target.startsWith('orgate-')) {
                                return (shop.orGates || []).find(g => g.id === target)?.name || 'OR Gate';
                              }
                              return (shop.stationsData || []).find(s => s.id === target)?.name || target;
                            })();

                            // Find which stations feed into this OR Gate (predecessors)
                            const predecessors = (ssState?.stations || [])
                              .filter(st => st.successor === og.id)
                              .map(st => st.name);

                            const isFlowingYes = isSimRunning && flyingParts.some(fp => fp.fromId === og.id && fp.toId === og.targetStationA);
                            const isFlowingNo = isSimRunning && flyingParts.some(fp => fp.fromId === og.id && fp.toId === og.targetStationB);
                            const isIncoming = isSimRunning && flyingParts.some(fp => fp.toId === og.id);

                            return (
                              <div
                                key={og.id}
                                className="border border-orange-500/20 bg-[#1c120c]/45 rounded-lg p-2.5 flex flex-col gap-2 hover:bg-[#1c120c]/65 transition-all text-[10px]"
                              >
                                <div className="flex items-center justify-between select-none font-mono">
                                  <div className="flex items-center gap-1.5">
                                    <div className="w-2.5 h-2.5 rotate-45 border border-orange-500 flex items-center justify-center bg-orange-950/40">
                                      <div className="w-1 h-1 bg-orange-400" />
                                    </div>
                                    <span className="font-bold text-orange-300">{og.name}</span>
                                  </div>
                                  <span className="text-[8px] bg-orange-500/10 text-orange-400 font-bold px-1.5 py-0.2 rounded border border-orange-500/15">
                                    DECISION POINT
                                  </span>
                                </div>

                                <div className="bg-[#100b07] border border-orange-500/10 rounded p-1.5 font-mono space-y-1">
                                  <div className="text-[9px] text-orange-400/80 font-bold">ROUTING CRITERIA</div>
                                  <div className="text-[10px] text-orange-200 pl-1">
                                    IF part <span className="text-orange-400 font-bold">{og.criteriaCategory.toUpperCase()}</span> IS <span className="text-emerald-400 font-bold">"{og.criteriaValue.toUpperCase()}"</span>
                                  </div>
                                </div>

                                <div className="space-y-1.5 font-mono text-[9px]">
                                  {/* Incoming Flow */}
                                  <div className="flex items-start gap-1 pl-1 text-slate-400">
                                    <span className="text-slate-500 select-none">↳ Inflow from:</span>
                                    <span className="text-slate-300 font-bold">
                                      {predecessors.length > 0 ? predecessors.join(', ') : 'None'}
                                    </span>
                                    {isIncoming && (
                                      <span className="text-[7px] text-sky-400 bg-sky-500/10 px-1 rounded animate-pulse font-bold ml-auto">
                                        RECEIVING
                                      </span>
                                    )}
                                  </div>

                                  {/* Yes Branch */}
                                  <div className="flex flex-col gap-1 py-1 px-2 bg-[#0c1a12] border border-emerald-500/20 rounded">
                                    <div className="flex items-center justify-between">
                                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${isFlowingYes ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`}></span>
                                        YES Branch (Match)
                                      </span>
                                      {isFlowingYes ? (
                                        <span className="text-[7.5px] font-bold text-emerald-400 bg-emerald-500/10 px-1 rounded animate-pulse shrink-0">FLOWING</span>
                                      ) : (
                                        <span className="text-[7.5px] text-emerald-500/50 shrink-0">READY</span>
                                      )}
                                    </div>
                                    <div className="text-[10px] text-emerald-300 pl-2.5 font-bold">
                                      ➔ {yesTargetName}
                                    </div>
                                  </div>

                                  {/* No Branch */}
                                  <div className="flex flex-col gap-1 py-1 px-2 bg-[#1c0e0b] border border-rose-500/20 rounded">
                                    <div className="flex items-center justify-between">
                                      <span className="text-rose-400 font-bold flex items-center gap-1">
                                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${isFlowingNo ? 'bg-rose-400 animate-pulse' : 'bg-slate-500'}`}></span>
                                        NO Branch (Mismatch)
                                      </span>
                                      {isFlowingNo ? (
                                        <span className="text-[7.5px] font-bold text-rose-400 bg-rose-500/10 px-1 rounded animate-pulse shrink-0">FLOWING</span>
                                      ) : (
                                        <span className="text-[7.5px] text-rose-500/50 shrink-0">READY</span>
                                      )}
                                    </div>
                                    <div className="text-[10px] text-rose-300 pl-2.5 font-bold">
                                      ➔ {noTargetName}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
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
        </div>

        {/* End of simulation banner offering to save layout */}
        {hasFinishedSim && (
          <div className="absolute bottom-44 left-1/2 -translate-x-1/2 z-30 bg-[#121c33]/95 border-2 border-emerald-500/50 p-4 rounded-xl shadow-[0_0_30px_rgba(16,185,129,0.25)] backdrop-blur-md max-w-md w-full animate-bounce flex flex-col gap-2.5 font-mono text-left">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-2 text-emerald-400">
                <span className="text-sm">🎉</span>
                <span className="text-xs uppercase tracking-wider font-extrabold">Simulation Complete!</span>
              </div>
              <button 
                type="button"
                onClick={() => setHasFinishedSim(false)}
                className="text-emerald-400 hover:text-white text-xs cursor-pointer focus:outline-none"
              >
                ✕
              </button>
            </div>
            <p className="text-[10px] text-[#bbf7d0]/80 leading-relaxed">
              All parts have finished processing. You produced <strong>{conveyorExitCount} parts</strong> at an average rate of <strong>{avgPartProduced} sec/part</strong>! Save this layout to preserve your workflow.
            </p>
            <div className="flex gap-2 items-center mt-1">
              <input
                type="text"
                placeholder="Name your layout..."
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="flex-1 bg-emerald-900/60 border border-emerald-500/40 px-2 py-1 rounded text-xs text-white font-mono placeholder-emerald-600 focus:outline-none focus:border-emerald-400"
              />
              <button
                type="button"
                onClick={() => {
                  if (onSaveProject) {
                    onSaveProject(projectName || "Completed Simulation Layout", "simulation");
                    setProjectName("");
                    setHasFinishedSim(false);
                    setSaveSuccess("Layout saved successfully!");
                    setTimeout(() => setSaveSuccess(null), 3000);
                  }
                }}
                className="bg-emerald-400 text-slate-900 font-extrabold text-xs px-3 py-1 rounded hover:bg-emerald-300 transition-colors cursor-pointer"
              >
                Save Results
              </button>
            </div>
          </div>
        )}

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

          {/* Save Layout Button at the bottom */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setIsSimRunning(false);
                setProjectName("");
                setIsSaveModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-primary hover:bg-primary/90 text-slate-900 font-extrabold rounded font-mono uppercase tracking-wider text-[10px] transition-all shadow active:scale-95 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5 text-slate-900" />
              <span>Save Layout</span>
            </button>
          </div>
        </footer>
      </main>

      {/* Project Naming Save Layout Modal Overlay */}
      {isSaveModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center animate-fade-in">
          <div className="bg-[#121c33]/95 border-2 border-primary/40 rounded-xl shadow-[0_0_30px_rgba(56,189,248,0.25)] p-5 w-full max-w-md text-left font-mono relative">
            <button
              type="button"
              onClick={() => setIsSaveModalOpen(false)}
              className="absolute top-4 right-4 text-on-surface-variant hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
            
            <div className="flex items-center gap-2 mb-3">
              <Save className="w-5 h-5 text-primary" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-white">Save Industrial Layout</h3>
            </div>
            
            <p className="text-[10px] text-on-surface-variant/80 mb-4 leading-relaxed">
              Provide a descriptive name to preserve your current station configurations, capacities, custom rules, and connections.
            </p>
            
            <div className="space-y-4">
              <div>
                <label className="text-[8px] uppercase tracking-wider text-primary font-black block mb-1">Layout Name</label>
                <input
                  type="text"
                  placeholder="e.g. Optimized Assembly, High Capacity B..."
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="w-full bg-[#10192e] border border-outline-variant/50 focus:border-primary px-3 py-2 rounded text-xs text-white font-bold placeholder-on-surface-variant/30 focus:outline-none focus:ring-1 focus:ring-primary/40"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && projectName.trim()) {
                      if (onSaveProject) {
                        const newProj = onSaveProject(projectName, "simulation");
                        setIsSaveModalOpen(false);
                        setSaveSuccess(`"${newProj.name}" Saved!`);
                        setTimeout(() => setSaveSuccess(null), 3000);
                      }
                    }
                  }}
                />
              </div>
              
              <div className="flex gap-2.5 justify-end">
                <button
                  type="button"
                  onClick={() => setIsSaveModalOpen(false)}
                  className="px-4 py-1.5 bg-[#1b2640] hover:bg-[#253558] text-[#dae2fd] hover:text-white font-bold rounded cursor-pointer transition-colors text-[10px] uppercase"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!projectName.trim()}
                  onClick={() => {
                    if (onSaveProject && projectName.trim()) {
                      const newProj = onSaveProject(projectName, "simulation");
                      setIsSaveModalOpen(false);
                      setSaveSuccess(`"${newProj.name}" Saved!`);
                      setTimeout(() => setSaveSuccess(null), 3000);
                    }
                  }}
                  className="px-4 py-1.5 bg-primary disabled:opacity-50 disabled:cursor-not-allowed text-slate-900 font-extrabold rounded cursor-pointer hover:bg-primary/95 transition-colors text-[10px] uppercase shadow"
                >
                  Save Project
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FULLSCREEN OVERLAY FOR SAVED PROJECTS */}
      {isSavedProjectsOpen && (
        <div className="fixed inset-0 bg-[#070b14]/98 backdrop-blur-md z-[9999] flex flex-col p-6 overflow-y-auto font-sans select-none animate-fade-in">
          {/* Header section */}
          <div className="max-w-7xl mx-auto w-full flex items-center justify-between border-b border-[#2d3a58]/35 pb-4 mb-6">
            <div className="text-left">
              <div className="flex items-center gap-3">
                <FolderHeart className="w-6 h-6 text-primary animate-pulse" />
                <h2 className="text-2xl font-black tracking-tight text-white uppercase font-mono">
                  Saved Industrial Projects
                </h2>
              </div>
              <p className="text-xs text-[#8e909a] font-medium mt-1 font-mono max-w-2xl leading-relaxed">
                Review and select layout blocks to load their customized shop topologies, conveyors, OR gates, and active buffer configurations.
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              {savedProjects && savedProjects.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const confirmed = window.confirm("Are you sure you want to permanently delete ALL saved projects? This cannot be undone.");
                    if (confirmed) {
                      if (onDeleteAllProjects) {
                        onDeleteAllProjects();
                      } else {
                        localStorage.removeItem('industrial_saved_projects');
                      }
                      setSysNotice("Cleared all saved projects.");
                      setTimeout(() => setSysNotice(null), 3000);
                    }
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-red-600/10 hover:bg-red-600 text-red-400 hover:text-white rounded-lg border border-red-500/25 transition-all text-xs font-mono font-bold cursor-pointer uppercase shadow-sm"
                  title="Wipe out all saved configurations"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Remove Everything</span>
                </button>
              )}
              
              <button
                type="button"
                onClick={() => {
                  setIsSavedProjectsOpen(false);
                  setActiveMenuProjectId(null);
                  setRenamingProjectId(null);
                }}
                className="p-2 bg-[#121c33]/80 border border-[#2d3a58]/40 hover:bg-white/5 rounded-lg text-on-surface-variant hover:text-white cursor-pointer transition-colors shadow-sm"
                title="Back to Simulation"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Grid display layout */}
          <div className="max-w-7xl mx-auto w-full flex-1">
            {!savedProjects || savedProjects.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 bg-[#0d1424]/40 border border-dashed border-[#2d3a58]/30 rounded-2xl">
                <FolderHeart className="w-12 h-12 text-[#32456f] mb-3 animate-pulse" />
                <p className="text-sm font-mono font-bold text-[#dae2fd]">No saved industrial layouts found.</p>
                <p className="text-[11px] font-mono text-on-surface-variant mt-1">Click "Save Layout" in the simulation sidebar to store a project.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-12">
                {savedProjects.map((p: any) => {
                  const isMenuOpen = activeMenuProjectId === p.id;
                  const isRenaming = renamingProjectId === p.id;

                  return (
                    <div
                      key={p.id}
                      onClick={() => {
                        if (!isRenaming) {
                          if (onLoadProject) {
                            onLoadProject(p.id);
                            setIsSavedProjectsOpen(false);
                            setSysNotice(`Loaded Layout "${p.name}"`);
                            setTimeout(() => setSysNotice(null), 3000);
                          }
                        }
                      }}
                      className="group flex flex-col justify-between bg-[#0e1526]/90 border border-[#202d4a] rounded-xl p-4 cursor-pointer relative hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 transform hover:-translate-y-0.5 select-none"
                    >
                      {/* Block Header */}
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <div className="flex-1 min-w-0">
                          {isRenaming ? (
                            <input
                              type="text"
                              value={renamingText}
                              onChange={(e) => setRenamingText(e.target.value)}
                              onKeyDown={(e) => {
                                e.stopPropagation();
                                if (e.key === 'Enter') {
                                  if (onRenameProject && renamingText.trim()) {
                                    onRenameProject(p.id, renamingText.trim());
                                  }
                                  setRenamingProjectId(null);
                                } else if (e.key === 'Escape') {
                                  setRenamingProjectId(null);
                                }
                              }}
                              onClick={(e) => e.stopPropagation()}
                              onBlur={() => {
                                if (onRenameProject && renamingText.trim()) {
                                  onRenameProject(p.id, renamingText.trim());
                                }
                                setRenamingProjectId(null);
                              }}
                              className="w-full bg-[#070b14] border border-primary text-xs text-white font-mono font-bold rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary/50"
                              autoFocus
                            />
                          ) : (
                            <h3 className="text-sm font-extrabold text-white font-mono truncate group-hover:text-primary transition-colors" title={p.name}>
                              {p.name}
                            </h3>
                          )}
                          <div className="text-[9px] font-mono font-semibold text-on-surface-variant mt-0.5 opacity-60">
                            {p.timestamp}
                          </div>
                        </div>

                        {/* More Action Menu controls */}
                        <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveMenuProjectId(isMenuOpen ? null : p.id);
                            }}
                            className="p-1.5 bg-[#121c33]/50 border border-[#2d3a58]/30 rounded hover:bg-white/5 text-on-surface-variant hover:text-white cursor-pointer transition-colors"
                            title="Options"
                          >
                            <MoreVertical className="w-3.5 h-3.5" />
                          </button>

                          {isMenuOpen && (
                            <div className="absolute right-0 mt-1 w-28 bg-[#11192e] border border-[#2d3a58]/70 rounded-md shadow-2xl z-50 overflow-hidden font-mono text-[10px]">
                              <button
                                type="button"
                                onClick={() => {
                                  setRenamingProjectId(p.id);
                                  setRenamingText(p.name);
                                  setActiveMenuProjectId(null);
                                }}
                                className="w-full text-left px-3 py-1.5 hover:bg-white/5 text-on-surface hover:text-primary cursor-pointer transition-colors border-b border-[#2d3a58]/30 flex items-center gap-1.5"
                              >
                                <Edit2 className="w-3 h-3 text-primary" />
                                <span>Rename</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (onDeleteProject) {
                                    onDeleteProject(p.id);
                                  }
                                  setActiveMenuProjectId(null);
                                }}
                                className="w-full text-left px-3 py-1.5 hover:bg-red-500/15 hover:bg-red-600 hover:text-white text-red-400 cursor-pointer transition-colors flex items-center gap-1.5"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Delete</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Dynamic Mini Preview visual */}
                      <div className="flex-1 my-2 font-sans select-none">
                        <ProjectMiniPreview shops={p.shops} />
                      </div>

                      {/* Click indicator button inside card */}
                      <div className="mt-2.5 pt-2.5 border-t border-[#202d4a]/60 flex items-center justify-between text-[9px] font-mono text-primary font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                        <span>LOAD TOPOLOGY</span>
                        <span>➔</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// Interactive Dynamic Mini Zoom-out Preview Component
// -------------------------------------------------------------
interface ProjectMiniPreviewProps {
  shops: ShopTopology[];
}

export function ProjectMiniPreview({ shops }: ProjectMiniPreviewProps) {
  return (
    <div className="w-full h-24 bg-[#060a12] rounded-lg border border-[#2d3a58]/35 relative overflow-hidden flex items-center justify-center p-2 gap-2 select-none">
      {shops.map((shop, idx) => {
        const stations = shop.stationsData || [];
        const orGates = shop.orGates || [];
        const paintColor = shop.paintFillColor || '#FF5733';
        return (
          <div 
            key={shop.id || idx} 
            className="flex-1 h-full bg-[#101726] border border-[#2d3a58]/30 rounded-lg p-1.5 flex flex-col justify-between relative overflow-hidden shadow-inner"
          >
            {/* Shop title inside preview */}
            <div className="text-[6.5px] font-mono text-[#8e909a] font-black uppercase tracking-tight truncate max-w-full">
              {shop.name}
            </div>
            
            {/* Dots representation of stations and OR gates */}
            <div className="flex flex-wrap gap-1 items-center justify-center flex-1 py-1 max-h-[45px] overflow-hidden">
              {stations.map((st, sidx) => (
                <div 
                  key={st.id || sidx} 
                  className="w-1.5 h-1.5 rounded-full shadow-[0_0_4px_rgba(255,255,255,0.15)]"
                  style={{ backgroundColor: paintColor }}
                />
              ))}
              {orGates.map((og, oidx) => (
                <div 
                  key={og.id || oidx} 
                  className="w-1.5 h-1.5 bg-orange-500 rotate-45 shrink-0 shadow-[0_0_4px_rgba(249,115,22,0.3)]"
                />
              ))}
            </div>

            {/* Successor channel indicator */}
            <div className="text-[5.5px] font-mono text-primary/75 text-right uppercase tracking-tighter truncate font-extrabold">
              ➔ {shop.successor === 'None' ? 'OUT' : `S${shop.successor}`}
            </div>
          </div>
        );
      })}
    </div>
  );
}
