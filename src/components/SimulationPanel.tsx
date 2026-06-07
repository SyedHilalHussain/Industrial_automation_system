/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Sliders, LayoutGrid, Play, Pause, Plus, Minus, Maximize2, 
  Trash2, ArrowRight, Settings, Info, X, 
  ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCcw, AlertTriangle, MonitorPlay,
  GripVertical
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
  // Finds the single final shop of the line (highest ID or successor 'None')
  const finalShopId = React.useMemo(() => {
    if (shops.length === 0) return 4;
    const noneSuccessor = shops.find(s => s.successor === 'None');
    if (noneSuccessor) return noneSuccessor.id;
    return Math.max(...shops.map(s => s.id));
  }, [shops]);

  // Dynamic dimension helpers
  const getShopWidthPx = (s: ShopTopology) => {
    const baseWidth = s.width || 30;
    return Math.max(180, Math.min(480, Math.round((baseWidth / 30) * 288)));
  };
  const getShopHeightPx = (s: ShopTopology) => {
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

  // Timer controls
  const [simSpeed, setSimSpeed] = useState<number>(1.0);
  const [simulatedElapsed, setSimulatedElapsed] = useState<number>(0);
  const [showTimerPopup, setShowTimerPopup] = useState<boolean>(true);
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
  }>({ simShops: [], flyingParts: [], processedCounts: {}, partsReleasedCount: 0, intakeQueue: [], conveyorExitCount: 0 });

  const { simShops, flyingParts, processedCounts, partsReleasedCount, intakeQueue, conveyorExitCount } = simState;

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
              successor: st.successor
            };
          }

          if (existingSt) {
            return {
              ...existingSt,
              cycleTime: st.cycleTime,
              bufferSize: st.bufferSize,
              successor: st.successor
            };
          } else {
            return {
              id: st.id,
              name: st.name,
              parts: [],
              currentCountdown: st.cycleTime,
              cycleTime: st.cycleTime,
              bufferSize: st.bufferSize,
              successor: st.successor
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

  // Handle addition of a part to the labeled Entrance shop (isInputShop: true)
  const handleAddPartToInShop = () => {
    const inShop = shops.find(s => s.isInputShop);
    if (!inShop) {
      setSysNotice('Error: No input shop designated. Mark a shop [IN] first.');
      setTimeout(() => setSysNotice(null), 4000);
      return;
    }

    setSimState(prev => {
      const newPart = generatePart();
      const updatedQueue = [...prev.intakeQueue, newPart];
      
      return {
        ...prev,
        intakeQueue: updatedQueue
      };
    });

    setSysNotice(`Added 1 part to the intake conduit queue.`);
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

        // Auto-feed waiting intake parts into first station buffer of the input shop
        const inShopSim = nextSimShops.find(ss => {
          const orig = shops.find(o => o.id === ss.id);
          return orig?.isInputShop;
        });
        if (inShopSim && nextIntakeQueue.length > 0) {
          const firstSt = inShopSim.stations[0];
          while (firstSt && firstSt.parts.length < firstSt.bufferSize + 1 && nextIntakeQueue.length > 0) {
            const nextPart = nextIntakeQueue.shift();
            if (nextPart) {
              firstSt.parts.push(nextPart);
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
                    if (nextSt.parts.length < nextSt.bufferSize + 1) {
                      const finishedPart = st.parts.shift();
                      if (finishedPart) {
                        nextSt.parts.push(finishedPart);
                      }
                      st.currentCountdown = st.cycleTime;
                    } else {
                      // Blocked due to backpressure (countdown capped at 0)
                      st.currentCountdown = 0;
                    }
                  } else {
                    // Fallback if target station cannot be located: process out normally
                    st.parts.shift();
                    st.currentCountdown = st.cycleTime;
                  }
                } else {
                  // Exits this shop. Determine next destination.
                  if (original.isOutputShop || ss.connections.length === 0) {
                    // Exits the plant onto final Outbound production conveyor belt
                    const finishedPart = st.parts.shift();
                    if (finishedPart) {
                      nextProcessed[ss.id] = (nextProcessed[ss.id] || 0) + 1;

                      const startX = original.posX + getShopWidthPx(original) / 2;
                      const startY = original.posY + 30;

                      newFlyingParts.push({
                        ...finishedPart,
                        fromId: ss.id,
                        toId: 'conveyor',
                        progress: 0,
                        startX,
                        startY,
                        endX: startX,
                        endY: 65
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
                      if (firstStTarget && firstStTarget.parts.length < firstStTarget.bufferSize + 1) {
                        const finishedPart = st.parts.shift();
                        if (finishedPart) {
                          nextProcessed[ss.id] = (nextProcessed[ss.id] || 0) + 1;

                          const startX = original.posX + getShopWidthPx(original) / 2;
                          const startY = original.posY + getShopHeightPx(original) - 20;
                          const endX = targetOrig.posX + getShopWidthPx(targetOrig) / 2;
                          const endY = targetOrig.posY + 30;

                          newFlyingParts.push({
                            ...finishedPart,
                            fromId: ss.id,
                            toId: targetId,
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
                    } else {
                      // Fallback normal complete
                      const finishedPart = st.parts.shift();
                      if (finishedPart) {
                        nextProcessed[ss.id] = (nextProcessed[ss.id] || 0) + 1;
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
            if (fp.toId !== 'conveyor') {
              const targetShop = nextSimShops.find(cs => cs.id === fp.toId);
              if (targetShop) {
                const firstStTarget = targetShop.stations[0];
                if (firstStTarget && firstStTarget.parts.length < firstStTarget.bufferSize + 1) {
                  firstStTarget.parts.push({ id: fp.id, shape: fp.shape, color: fp.color });
                }
              }
            } else {
              newConveyorExits++;
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
          conveyorExitCount: prev.conveyorExitCount + newConveyorExits
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
      <aside className="w-64 border-r border-outline-variant flex flex-col bg-surface-container-low p-4 gap-6 shrink-0 justify-between select-none z-10">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-widest text-[#8e909a] mb-3 font-bold text-left">System Controls</p>
          <ul className="space-y-1">
            <li>
              <button 
                type="button"
                onClick={() => onNavigate('configuration')}
                className="w-full flex items-center gap-3 px-4 py-2.5 rounded text-on-surface-variant hover:bg-surface-container-high transition-all cursor-pointer text-left font-mono text-[11px] uppercase tracking-wider"
              >
                <Sliders className="w-4 h-4 text-on-surface-variant" />
                <span>Configuration</span>
              </button>
            </li>
            <li>
              <button 
                type="button"
                onClick={() => onNavigate('layout')}
                className="w-full flex items-center gap-3 px-4 py-2.5 rounded text-on-surface-variant hover:bg-surface-container-high transition-all cursor-pointer text-left font-mono text-[11px] uppercase tracking-wider"
              >
                <LayoutGrid className="w-4 h-4 text-on-surface-variant" />
                <span>Layout</span>
              </button>
            </li>
            <li>
              <button 
                type="button"
                onClick={() => onNavigate('shop-layout')}
                className="w-full flex items-center gap-3 px-4 py-2.5 rounded text-on-surface-variant hover:bg-surface-container-high transition-all cursor-pointer text-left font-mono text-[11px] uppercase tracking-wider"
              >
                <Settings className="w-4 h-4 text-on-surface-variant" />
                <span>Shop Layout</span>
              </button>
            </li>
            <li>
              <div className="w-full flex items-center gap-3 px-4 py-2.5 bg-[#1b2640] text-primary border-l-2 border-primary rounded font-mono text-[11px] uppercase tracking-wider font-bold">
                <Play className="w-4 h-4 text-primary animate-pulse" />
                <span>Simulation</span>
              </div>
            </li>
          </ul>

          {/* Add Part Button */}
          <div className="mt-5 border-t border-outline-variant/30 pt-5">
            <div className="flex justify-between items-center mb-2.5 px-1 font-mono text-[10px]">
              <span className="text-[#8e909a] uppercase tracking-wider">Conduit Queue:</span>
              <span className="text-emerald-400 font-bold">
                {intakeQueue.length} parts waiting
              </span>
            </div>

            <button 
              type="button"
              onClick={handleAddPartToInShop}
              className="w-full flex items-center justify-center gap-2 py-3 rounded font-mono font-bold text-xs uppercase bg-emerald-500 hover:bg-emerald-400 text-slate-900 transition-all shadow-md active:scale-95 cursor-pointer select-none"
            >
              <Plus className="w-4 h-4 text-slate-900" />
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
              transform: 'none' 
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
              <button 
                type="button" 
                onClick={() => setShowTimerPopup(false)}
                className="text-on-surface-variant hover:text-red-400 p-0.5 rounded transition-colors cursor-pointer"
              >
                <X className="w-2.5" />
              </button>
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
                    value={simSpeed}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (!isNaN(val)) {
                        setSimSpeed(Math.max(1, Math.min(1000, val)));
                      } else {
                        setSimSpeed(1);
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

            {/* Run state controls containing exactly 2 buttons: Start or Stop */}
            <div className="mt-2 text-left font-mono">
              <label className="font-mono text-[7.5px] uppercase tracking-wider text-on-surface-variant opacity-85 font-bold block mb-1">
                Continuous Clock
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    if (!isSimRunning) {
                      setSimulatedElapsed(0);
                      setSimState(prev => ({
                        ...prev,
                        conveyorExitCount: 0
                      }));
                      setAvgPartProduced("0.0");
                    }
                    setIsSimRunning(true);
                  }}
                  className={`font-mono text-[9px] py-1 rounded border transition-all cursor-pointer text-center font-bold uppercase ${
                    isSimRunning
                      ? 'bg-emerald-500/25 text-emerald-400 border-emerald-500 shadow-sm'
                      : 'bg-[#1b2640]/30 border-outline-variant/15 text-on-surface-variant hover:bg-[#1b2640]'
                  }`}
                >
                  Start
                </button>
                <button
                  type="button"
                  onClick={() => {
                    // Stop the interactive simulation clock stream without resetting the elapsed time
                    setIsSimRunning(false);
                  }}
                  className={`font-mono text-[9px] py-1 rounded border transition-all cursor-pointer text-center font-bold uppercase ${
                    !isSimRunning
                      ? 'bg-rose-500/25 text-rose-400 border-rose-500 shadow-sm'
                      : 'bg-[#1b2640]/30 border-outline-variant/15 text-on-surface-variant hover:bg-[#1b2640]'
                  }`}
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
            <span className="p-1 px-2.5 bg-emerald-500/10 text-emerald-400 font-mono text-[9px] rounded font-bold border border-emerald-500/25">
              FLOW DIAGRAM
            </span>
            <div className="flex flex-col">
              <h1 className="text-sm font-semibold text-on-surface">Live Workshop Simulator</h1>
              <p className="text-[10px] text-on-surface-variant mt-0.5">Drag shops to reorder, zoom canvas to focus, click HUD to lock clock speed.</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Operational Stream Connected Indicator */}
            <div className="text-[10px] text-on-surface-variant flex items-center gap-1.5 shrink-0 bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-2.5 py-1.5 font-mono select-none">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-bold opacity-85 uppercase tracking-widest text-[#dae2fd]/75 text-[9px]">Operational Stream Connected</span>
            </div>

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
              <div className="absolute right-12 top-1/2 -translate-y-1/2 flex items-center gap-1.5 bg-orange-950/85 border border-orange-500/40 px-2.5 py-0.5 rounded text-[9.5px] font-mono text-orange-400 font-bold z-10 select-none shadow-[0_0_12px_rgba(249,115,22,0.4)]">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                <span>OUTBOUND PARTS COUNTER: {conveyorExitCount}</span>
              </div>
            </div>

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
              const startX = fp.startX;
              const startY = fp.startY;
              const endX = fp.endX;
              const endY = fp.endY;

              let currentX = startX;
              let currentY = startY;

              if (fp.toId === 'conveyor') {
                currentX = startX;
                currentY = startY + (endY - startY) * (fp.progress / 100);
              } else {
                const cy1 = startY + (endY - startY) / 2;
                const cy2 = startY + (endY - startY) / 2;

                const t = fp.progress / 100;
                currentX = (1 - t) * (1 - t) * (1 - t) * startX + 3 * (1 - t) * (1 - t) * t * startX + 3 * (1 - t) * t * t * endX + t * t * t * endX;
                currentY = (1 - t) * (1 - t) * (1 - t) * startY + 3 * (1 - t) * (1 - t) * t * cy1 + 3 * (1 - t) * t * t * cy2 + t * t * t * endY;
              }

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
                  className="pointer-events-none scale-110 drop-shadow-lg"
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
                    className="p-3 bg-[#111c34] border-b border-outline-variant/30 flex justify-between items-center cursor-move select-none"
                    title="Drag to reposition card"
                  >
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
                  </header>

                  {/* Sequential Stations internal list layout */}
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
                            className={`border border-[#1f2d4d]/65 rounded-xl p-2 bg-[#10192e]/40 hover:bg-[#10192e]/70 transition-all flex flex-col gap-1.5 text-left cursor-grab active:cursor-grabbing ${
                              draggedStationIdx === sIdx && draggedStationShopId === shop.id
                                ? 'opacity-30 border-dashed border-primary ring-1 ring-primary/40 scale-[0.98]'
                                : ''
                            }`}
                          >
                          {/* Inner Station indicator block */}
                          <div className="flex items-center justify-between text-[10px] font-mono select-none">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <GripVertical className="w-3 h-3 text-on-surface-variant/40 shrink-0 select-none pointer-events-none" />
                              <span className="font-bold text-[#b4c3f1]">{st.name}</span>
                              <span className="text-[8px] opacity-40">| T: {st.cycleTime}s</span>
                              <span className="text-[7.5px] font-bold text-emerald-400 bg-emerald-500/10 px-1 py-0.5 rounded border border-emerald-500/15" title="Routing Destination">
                                &rarr; {
                                  (st.successor || (sIdx === (ssState?.stations?.length || 0) - 1 ? "exit" : ssState?.stations?.[sIdx + 1]?.id || "exit")) === "exit"
                                    ? (shop.isOutputShop ? "Conveyor" : "Next Shop")
                                    : (ssState?.stations?.find(station => station.id === (st.successor || ssState?.stations?.[sIdx + 1]?.id))?.name || "Next")
                                }
                              </span>
                            </div>
                            <span className="text-[9px] text-[#adc6ff] font-bold">
                              [{occupancy}/{st.bufferSize}]
                            </span>
                          </div>

                          {/* Active part queue item */}
                          <div className="min-h-[38px] flex items-center bg-black/25 border border-[#2d3a58]/35 rounded-lg p-1.5 relative overflow-hidden text-left">
                            {isStBusy ? (
                              <div className="flex items-center gap-2 w-full select-none text-left">
                                <div className="shrink-0">
                                  {renderClipShape(activePart.shape, activePart.color)}
                                </div>
                                <div className="flex-1 flex flex-col leading-none text-left">
                                  <span className="font-mono text-[9px] font-black text-[#f1f5f9] uppercase">{activePart.id}</span>
                                  <span className="font-mono text-[8px] opacity-55 text-on-surface-variant font-bold mt-0.5">
                                    Remaining: {formatSecondsToHMS(Math.ceil(st.currentCountdown))}
                                  </span>
                                </div>
                                {/* Percentage bar */}
                                <div 
                                  className="absolute bottom-0 left-0 h-0.5 bg-primary/80 transition-all duration-100 ease-linear" 
                                  style={{ width: `${progressPct}%` }} 
                                />
                              </div>
                            ) : (
                              <span className="text-[8.5px] font-mono uppercase text-on-surface-variant/30 select-none tracking-wider block mx-auto py-1.5 text-center">
                                EMPTY (STATION IDLE)
                              </span>
                            )}
                          </div>

                          {/* Additional parts waiting in buffers queue */}
                          {st.parts.length > 1 && (
                            <div className="flex flex-wrap gap-1 bg-black/10 border border-outline-variant/5 p-1 rounded-lg">
                              {st.parts.slice(1).map((qp, qIdx) => (
                                <div 
                                  key={`${qp.id}-${qIdx}`} 
                                  className="bg-black/40 border border-outline-variant/15 p-0.5 px-1 rounded flex items-center gap-1 text-[7.5px] font-mono select-none text-left"
                                  title={qp.id}
                                >
                                  {renderClipShape(qp.shape, qp.color)}
                                  <span className="scale-90 text-on-surface-variant/60 font-bold">{qp.id.replace('Part #', '#')}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Visual in-shop conveyor belt showing directional travel from station to next */}
                        <div className="flex flex-col gap-1.5 py-1.5 px-3 bg-[#0d1526]/55 border border-[rgba(31,45,77,0.4)] rounded-xl mt-1">
                          <div className="flex items-center justify-between text-[8px] font-mono select-none text-on-surface-variant/70">
                            <span className="font-bold flex items-center gap-1 text-primary">
                              <span className={`inline-block w-1.5 h-1.5 rounded-full ${isSimRunning ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`}></span>
                              CONVEYOR: {st.name} &rarr; {targetSuccessorName}
                            </span>
                            {isSimRunning && st.parts.length > 0 ? (
                              <span className="text-[7.5px] font-bold text-emerald-400 bg-emerald-500/10 px-1 py-0.2 rounded animate-pulse">FLOWING</span>
                            ) : (
                              <span className="text-[7.5px] opacity-40">READY</span>
                            )}
                          </div>
                          <div className="relative h-3 bg-[#060c18] border border-[#232f4c]/70 rounded-md flex items-center overflow-hidden">
                            <div className="absolute inset-y-0 left-0 w-1.5 bg-slate-700/60 rounded-r-sm z-10"></div>
                            <div className="absolute inset-y-0 right-0 w-1.5 bg-slate-700/60 rounded-l-sm z-10"></div>
                            <div className="absolute inset-0 flex items-center justify-around font-mono font-bold tracking-widest text-[8px] select-none pointer-events-none text-blue-400/50">
                              <span className={isSimRunning && st.parts.length > 0 ? "animate-pulse" : ""}>&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt;</span>
                              <span className={isSimRunning && st.parts.length > 0 ? "animate-pulse" : ""}>&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt;</span>
                            </div>
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })}
                  </div>

                  {/* Card Bottom Statistics footer */}
                  <footer className="p-2 border-t border-outline-variant/35 bg-[#101b33] flex justify-between items-center text-[10px] font-mono select-none">
                    <span className="text-on-surface-variant/70 pl-1">Delivered total:</span>
                    <span className="font-bold text-primary pr-1 bg-black/25 p-0.5 px-2 rounded-md">
                      {totalDone} units
                    </span>
                  </footer>
                </div>
              );
            })}
          </div>
        </div>

        {/* Global bottom telemetry overlay strip */}
        <footer className="bg-surface-container-lowest border-t border-outline-variant px-6 py-3 shrink-0 flex justify-between items-center text-left select-none z-10 font-mono text-[11px]">
          <div className="flex gap-6">
            <div>
              <span className="text-on-surface-variant uppercase text-[9px] opacity-70">TOTAL CONFIGURED SHOPS</span>
              <p className="font-black text-[#dae2fd] text-xs mt-0.5">{shops.length}</p>
            </div>
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
              <span className="text-on-surface-variant uppercase text-[9px] opacity-70">AVG PART PRODUCED</span>
              <p className="font-black text-rose-400 text-xs mt-0.5">
                {avgPartProduced} sec/part
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-[9px] uppercase tracking-wider text-on-surface-variant/70 font-bold block sm:inline">SIMULATOR CONTROLS:</span>
              
              {/* Reset System State - Clears all simulation data, pieces, conveyor exit counts, and backpressures */}
              <button
                type="button"
                onClick={handleClearAllSimData}
                className="p-2 gap-1 px-3 bg-[#1b2640] hover:bg-rose-500/20 text-[#adc6ff] hover:text-rose-400 border border-[#2d3a58]/80 hover:border-rose-500 rounded-lg flex items-center justify-center transition-all cursor-pointer font-mono text-[9px] uppercase font-bold"
                title="Reset simulation layout, parts queue, and elapsed time to absolute zero"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset System State</span>
              </button>
            </div>




          </div>
        </footer>
      </main>
    </div>
  );
}
