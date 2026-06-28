/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Settings, Sliders, LayoutGrid, Play, Info } from 'lucide-react';
import { ShopTopology, StationTopology } from './types';
import ConfigurationPanel from './components/ConfigurationPanel';
import LayoutConfigurationPanel from './components/LayoutConfigurationPanel';
import ShopLayoutConfigurationPanel from './components/ShopLayoutConfigurationPanel';
import SimulationPanel from './components/SimulationPanel';

const ensureSingleExitForShop = (stations: StationTopology[], shopId: number): StationTopology[] => {
  if (!stations || stations.length === 0) return [];

  return stations.map((st, idx) => {
<<<<<<< HEAD
=======
    // If successor is already defined and points to a valid station in this shop or 'exit', preserve it!
    const isValidSuccessor = st.successor && (st.successor === 'exit' || stations.some(s => s.id === st.successor));
    if (isValidSuccessor) {
      return st;
    }
>>>>>>> 7746fa9 (Basic Version)
    const isLast = idx === stations.length - 1;
    return {
      ...st,
      successor: isLast ? 'exit' : stations[idx + 1].id
    };
  });
};

const createDefaultStationsForShop = (shopId: number, count: number): StationTopology[] => {
  const base = Array.from({ length: count }).map((_, idx) => {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const prefix = letters[(shopId - 1) % letters.length] || 'X';
    return {
      id: `${shopId}-${idx + 1}`,
      name: `${prefix}${idx + 1}`,
      partsCount: 0, // start empty, parts only enter via intake conveyor
      bufferSize: 5,
      cycleTime: 15, // 15 seconds default
    };
  });
  return ensureSingleExitForShop(base, shopId);
};

const arrangeShopsInSequentialFlow = (list: ShopTopology[]): ShopTopology[] => {
  const inShop = list.find(s => s.isInputShop) || list[0];
  if (!inShop) return list;

  const ordered: ShopTopology[] = [];
  const visited = new Set<number>();

  let current: ShopTopology | undefined = inShop;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    ordered.push(current);

    const succName = current.successor ? current.successor.trim().toLowerCase() : '';
    if (succName && succName !== 'none') {
      const nextShop = list.find(s => s.name.trim().toLowerCase() === succName);
      if (nextShop) {
        current = nextShop;
      } else {
        const match = succName.match(/\d+/);
        if (match) {
          const idNum = parseInt(match[0]);
          current = list.find(s => s.id === idNum);
        } else {
          current = undefined;
        }
      }
    } else {
      current = undefined;
    }
  }

  // Gather any detached/isolated shops
  list.forEach(s => {
    if (!visited.has(s.id)) {
      ordered.push(s);
    }
  });

  return list.map(originalShop => {
    const sortedIdx = ordered.findIndex(s => s.id === originalShop.id);
    const index = sortedIdx !== -1 ? sortedIdx : 0;
    return {
      ...originalShop,
      posX: 150 + index * 420,
      posY: 120
    };
  });
};

export default function App() {
  const [currentStep, setCurrentStep] = useState<'configuration' | 'layout' | 'shop-layout' | 'simulation'>('configuration');
  
  // Grid layout defaults aligned with the mockup screens
  const defaultShops: ShopTopology[] = [
    { 
      id: 1, 
      name: 'SHOP 1', 
      width: 30, 
      height: 30, 
      stations: 3, 
      cycleTime: 45, 
      bufferSize: 12, 
      status: 'Active', 
      successor: 'SHOP 2',
      posX: 100,
      posY: 120,
      widthPx: 288,
      heightPx: 320,
      isInputShop: true,
      isOutputShop: false,
      intakePartsCount: 15,
    },
    { 
      id: 2, 
      name: 'SHOP 2', 
      width: 30, 
      height: 30, 
      stations: 3, 
      cycleTime: 60, 
      bufferSize: 8, 
      status: 'Active', 
      successor: 'SHOP 3',
      posX: 550,
      posY: 120,
      widthPx: 288,
      heightPx: 320,
      isInputShop: false,
      isOutputShop: false,
    },
    { 
      id: 3, 
      name: 'SHOP 3', 
      width: 30, 
      height: 30, 
      stations: 2, 
      cycleTime: 30, 
      bufferSize: 15, 
      status: 'Standby', 
      successor: 'SHOP 4',
      posX: 550,
      posY: 440,
      widthPx: 288,
      heightPx: 320,
      isInputShop: false,
      isOutputShop: false,
    },
    { 
      id: 4, 
      name: 'SHOP 4', 
      width: 30, 
      height: 30, 
      stations: 2, 
      cycleTime: 50, 
      bufferSize: 10, 
      status: 'Ready', 
      successor: 'None',
      posX: 100,
      posY: 440,
      widthPx: 288,
      heightPx: 320,
      isInputShop: false,
      isOutputShop: true,
    }
  ].map(shop => ({
    ...shop,
    status: shop.status as 'Active' | 'Standby' | 'Ready' | 'Idle',
    stationsData: createDefaultStationsForShop(shop.id, shop.stations)
  }));

  const [shops, setShops] = useState<ShopTopology[]>(arrangeShopsInSequentialFlow(defaultShops));

  // Handle step 1 submission to dynamically build the shops and transition
  const handleProceedFromConfiguration = (config: {
    shopCount: number;
    width: number;
    height: number;
    stationCount: number;
  }) => {
    // Generate shopCount shops sequentially, assigning balanced widths/heights & successor channels
    const generatedShops: ShopTopology[] = Array.from({ length: config.shopCount }).map((_, idx) => {
      const shopId = idx + 1;
      
      // Determine standard viewport slot positions to prevent card stack overlay in simulation draggable canvas
      const xSlots = [100, 550, 550, 100, 960, 960];
      const ySlots = [120, 120, 440, 440, 120, 440];
      
      const posX = xSlots[idx % xSlots.length];
      const posY = ySlots[idx % ySlots.length];

      // Formulate realistic default offsets or proportional parameters
      const defaultCycleTimes = [45, 60, 30, 50, 40, 55];
      const defaultBuffers = [12, 8, 15, 10, 16, 12];
      const defaultStatuses: Array<'Active' | 'Standby' | 'Ready' | 'Idle'> = ['Active', 'Active', 'Standby', 'Ready', 'Idle', 'Idle'];

      const isInputShop = shopId === 1;
      const isOutputShop = shopId === config.shopCount;

      return {
        id: shopId,
        name: `SHOP ${shopId}`,
        width: config.width,
        height: config.height,
        stations: config.stationCount,
        cycleTime: defaultCycleTimes[idx % defaultCycleTimes.length],
        bufferSize: defaultBuffers[idx % defaultBuffers.length],
        status: defaultStatuses[idx % defaultStatuses.length],
        successor: shopId < config.shopCount ? `SHOP ${shopId + 1}` : 'None',
        posX,
        posY,
        widthPx: 288,
        heightPx: 320,
        isInputShop,
        isOutputShop,
        intakePartsCount: isInputShop ? 15 : undefined,
        stationsData: createDefaultStationsForShop(shopId, config.stationCount)
      };
    });

    setShops(arrangeShopsInSequentialFlow(generatedShops));
    setCurrentStep('layout');
  };

  // Persists individual modifications back to master state controller
  const handleUpdateShop = (id: number, updatedFields: Partial<ShopTopology>) => {
    setShops(prevShops => {
      const oldShop = prevShops.find(s => s.id === id);
      const isNameChanging = updatedFields.name !== undefined && oldShop && oldShop.name !== updatedFields.name;
      const oldName = oldShop ? oldShop.name : '';

      // 1. Initial baseline updates (e.g., merging updated fields, managing station length)
      let nextShops = prevShops.map(s => {
        if (s.id === id) {
          const merged = { ...s, ...updatedFields };

          // Reconcile stationsData if stations count changes
          if (updatedFields.stations !== undefined && updatedFields.stations !== s.stations) {
            const count = updatedFields.stations;
            const currentStations = merged.stationsData || [];
            if (currentStations.length < count) {
              const diff = count - currentStations.length;
              const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
              const prefix = letters[(id - 1) % letters.length] || 'X';
              
              const newStations = Array.from({ length: diff }).map((_, idx) => ({
                id: `${id}-${currentStations.length + idx + 1}`,
                name: `${prefix}${currentStations.length + idx + 1}`,
                partsCount: 0,
                bufferSize: 5,
                cycleTime: 15
              }));
              merged.stationsData = [...currentStations, ...newStations];
            } else if (currentStations.length > count) {
              merged.stationsData = currentStations.slice(0, count);
            }
          }

          if (merged.stationsData) {
            merged.stationsData = ensureSingleExitForShop(merged.stationsData, id);
          }
          return merged;
        }

        // Exclusive single field for isInputShop
        if (updatedFields.isInputShop === true && s.id !== id) {
          return { ...s, isInputShop: false };
        }
        // Exclusive single field for isOutputShop
        if (updatedFields.isOutputShop === true && s.id !== id) {
          return { ...s, isOutputShop: false };
        }

        if (isNameChanging && oldName && s.successor.toLowerCase() === oldName.toLowerCase()) {
          return { ...s, successor: updatedFields.name! };
        }
        // Fallback checks for lowercase/uppercase variants
        if (isNameChanging && s.successor.toLowerCase() === `shop ${id}`) {
          return { ...s, successor: updatedFields.name! };
        }
        return s;
      });

      // 2. Ensure exactly one IN (Input) and one OUT (Output) exists
      let inShop = nextShops.find(s => s.isInputShop);
      if (!inShop && nextShops.length > 0) {
        nextShops[0].isInputShop = true;
        inShop = nextShops[0];
      }

      let outShop = nextShops.find(s => s.isOutputShop);
      if (!outShop && nextShops.length > 0) {
        // Find a shop different from inShop if possible
        const alternateOut = nextShops.find(s => s.id !== (inShop?.id ?? -1)) || nextShops[nextShops.length - 1];
        alternateOut.isOutputShop = true;
        outShop = alternateOut;
      }

      // 3. If IN and OUT are the same shop and we have multiple shops, adjust so they are distinct
      if (nextShops.length > 1 && inShop && outShop && inShop.id === outShop.id) {
        if (updatedFields.isInputShop === true) {
          // Input was targeted, so move Output to another shop
          const alternate = nextShops.find(s => s.id !== inShop!.id);
          if (alternate) {
            nextShops = nextShops.map(s => {
              if (s.id === alternate.id) return { ...s, isOutputShop: true };
              if (s.id === inShop!.id) return { ...s, isOutputShop: false };
              return s;
            });
          }
        } else {
          // Output was targeted (or other field changed), so move Input to another shop
          const alternate = nextShops.find(s => s.id !== outShop!.id);
          if (alternate) {
            nextShops = nextShops.map(s => {
              if (s.id === alternate.id) return { ...s, isInputShop: true };
              if (s.id === outShop!.id) return { ...s, isInputShop: false };
              return s;
            });
          }
        }
      }

      // Recheck/resolve final inShop and outShop designations
      inShop = nextShops.find(s => s.isInputShop) || nextShops[0];
      outShop = nextShops.find(s => s.isOutputShop) || nextShops[nextShops.length - 1];

      // 4. Clean and enforce successor rules:
      // - OUT shops have successor 'None'
      // - Non-OUT shops must have a unique non-None, non-self successor
      nextShops = nextShops.map(s => {
        if (s.isOutputShop) {
          // If a shop is both the output AND input shop (e.g. single shop configuration), preserve its intakePartsCount!
          if (s.isInputShop) {
            return { ...s, successor: 'None', intakePartsCount: s.intakePartsCount ?? 15 };
          }
          return { ...s, successor: 'None', intakePartsCount: undefined };
        }
        if (s.isInputShop) {
          return { ...s, intakePartsCount: s.intakePartsCount ?? 15 };
        }
        return s;
      });

      if (nextShops.length > 1) {
        const nonOutShops = nextShops.filter(s => !s.isOutputShop);
        const claimed = new Set<string>();
        claimed.add('None'); // Only OUT shop can have None

        // Sort nonOutShops so that the shop being updated is processed FIRST.
        // This guarantees its manual successor choice is claimed first and never overridden!
        const sortedNonOutShops = [...nonOutShops].sort((a, b) => {
          if (a.id === id) return -1;
          if (b.id === id) return 1;
          return 0;
        });

        const updatedSuccessors: { [shopId: number]: string } = {};

        sortedNonOutShops.forEach(s => {
          let currSucc = s.successor;
          const isInvalid = !currSucc || currSucc === 'None' || currSucc === s.name || claimed.has(currSucc);
          
          if (isInvalid) {
            // Find an available successor that is not itself and not already claimed
            const available = nextShops.find(target => target.name !== s.name && !claimed.has(target.name));
            if (available) {
              currSucc = available.name;
            } else {
              const fallback = nextShops.find(target => target.name !== s.name);
              if (fallback) {
                currSucc = fallback.name;
              }
            }
          }
          
          claimed.add(currSucc);
          updatedSuccessors[s.id] = currSucc;
        });

        // Apply updated successors back to nextShops
        nextShops = nextShops.map(s => {
          if (updatedSuccessors[s.id] !== undefined) {
            return { ...s, successor: updatedSuccessors[s.id] };
          }
          return s;
        });
      } else if (nextShops.length === 1) {
        nextShops[0].successor = 'None';
        nextShops[0].isInputShop = true;
        nextShops[0].isOutputShop = true;
        if (nextShops[0].intakePartsCount === undefined) {
          nextShops[0].intakePartsCount = 15;
        }
      }

      // If the update was a coordinate change (user dragged a card), don't force auto-layout
      if (updatedFields.posX !== undefined || updatedFields.posY !== undefined) {
        return nextShops;
      }
      return arrangeShopsInSequentialFlow(nextShops);
    });
  };

  // Reset shop card to layout mockup defaults
  const handleResetShop = (id: number) => {
    const originalDefault = defaultShops.find(d => d.id === id);
    if (originalDefault) {
      handleUpdateShop(id, originalDefault);
    } else {
      // Generic safe clear fallback
      handleUpdateShop(id, {
        width: 40,
        height: 40,
        stations: 3,
        cycleTime: 40,
        bufferSize: 10,
        successor: id < shops.length ? `SHOP ${id + 1}` : 'None'
      });
    }
  };

  return (
    <div className="min-h-screen bg-[#0b1326] text-[#dae2fd] flex flex-col font-sans overflow-hidden">
      
      {/* Primary Workshop Content Routing Box */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {currentStep === 'configuration' && (
          <ConfigurationPanel onProceed={handleProceedFromConfiguration} />
        )}

        {currentStep === 'layout' && (
          <LayoutConfigurationPanel
            shops={shops}
            onUpdateShop={handleUpdateShop}
            onResetShop={handleResetShop}
            onNavigate={(step) => setCurrentStep(step as any)}
          />
        )}

        {currentStep === 'shop-layout' && (
          <ShopLayoutConfigurationPanel
            shops={shops}
            onUpdateShop={handleUpdateShop}
            onNavigate={(step) => setCurrentStep(step as any)}
          />
        )}

        {currentStep === 'simulation' && (
          <SimulationPanel
            shops={shops}
            onUpdateShop={handleUpdateShop}
            onNavigate={(step) => setCurrentStep(step as any)}
          />
        )}
      </div>
    </div>
  );
}
