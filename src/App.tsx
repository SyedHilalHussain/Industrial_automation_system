/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Settings, Sliders, LayoutGrid, Play, Info } from 'lucide-react';
import { ShopTopology } from './types';
import ConfigurationPanel from './components/ConfigurationPanel';
import LayoutConfigurationPanel from './components/LayoutConfigurationPanel';
import SimulationPanel from './components/SimulationPanel';

export default function App() {
  const [currentStep, setCurrentStep] = useState<'configuration' | 'layout' | 'simulation'>('configuration');
  
  // Grid layout defaults aligned with the mockup screens
  const defaultShops: ShopTopology[] = [
    { 
      id: 1, 
      name: 'SHOP 1', 
      width: 30, 
      height: 30, 
      stations: 8, 
      cycleTime: 45, 
      bufferSize: 12, 
      status: 'Active', 
      successor: 'SHOP 2',
      posX: 100,
      posY: 120,
      widthPx: 288,
      heightPx: 224
    },
    { 
      id: 2, 
      name: 'SHOP 2', 
      width: 30, 
      height: 30, 
      stations: 12, 
      cycleTime: 60, 
      bufferSize: 8, 
      status: 'Active', 
      successor: 'SHOP 3',
      posX: 550,
      posY: 120,
      widthPx: 288,
      heightPx: 224
    },
    { 
      id: 3, 
      name: 'SHOP 3', 
      width: 30, 
      height: 30, 
      stations: 6, 
      cycleTime: 30, 
      bufferSize: 15, 
      status: 'Standby', 
      successor: 'SHOP 4',
      posX: 550,
      posY: 440,
      widthPx: 288,
      heightPx: 224
    },
    { 
      id: 4, 
      name: 'SHOP 4', 
      width: 30, 
      height: 30, 
      stations: 10, 
      cycleTime: 50, 
      bufferSize: 10, 
      status: 'Ready', 
      successor: 'None',
      posX: 100,
      posY: 440,
      widthPx: 288,
      heightPx: 224
    }
  ];

  const [shops, setShops] = useState<ShopTopology[]>(defaultShops);

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
        heightPx: 224
      };
    });

    setShops(generatedShops);
    setCurrentStep('layout');
  };

  // Persists individual modifications back to master state controller
  const handleUpdateShop = (id: number, updatedFields: Partial<ShopTopology>) => {
    setShops(prevShops => {
      const oldShop = prevShops.find(s => s.id === id);
      const isNameChanging = updatedFields.name !== undefined && oldShop && oldShop.name !== updatedFields.name;
      const oldName = oldShop ? oldShop.name : '';

      return prevShops.map(s => {
        if (s.id === id) {
          return { ...s, ...updatedFields };
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
        stations: 8,
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
            onNavigate={setCurrentStep}
          />
        )}

        {currentStep === 'simulation' && (
          <SimulationPanel
            shops={shops}
            onUpdateShop={handleUpdateShop}
            onNavigate={setCurrentStep}
          />
        )}
      </div>
    </div>
  );
}
