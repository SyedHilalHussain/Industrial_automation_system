/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface StationTopology {
  id: string; // e.g. "1-1"
  name: string; // e.g. "Station 1"
  partsCount: number; // initial parts count in this station
  bufferSize: number; // buffer capacity
  cycleTime: number; // cycle time in seconds
  successor?: string; // target station ID or "exit"
}

export interface ShopTopology {
  id: number;
  name: string;
  width: number; // in meters (default 10-100)
  height: number; // in meters
  stations: number; // count of stations
  cycleTime: number; // standard countdown cycle in seconds
  bufferSize: number; // max components
  status: 'Active' | 'Standby' | 'Ready' | 'Idle';
  successor: string; // "Shop 2" | "Shop 3" | "Shop 4" | "None"
  // For interactive visual positioning in the Simulation Canvas
  posX: number;
  posY: number;
  widthPx: number;
  heightPx: number;
  stationsData?: StationTopology[];
  isInputShop?: boolean;
  isOutputShop?: boolean;
  intakePartsCount?: number;
}

export interface PartFlowItem {
  id: string; // e.g. A3, X7
  shape: 'pentagon' | 'heart' | 'square' | 'triangle' | 'diamond' | 'oval';
  color: string; // Tailwind bg color class
}

export interface SimulationState {
  shops: { [key: number]: {
    cycleTime: number;
    current: number; // remaining seconds
    parts: PartFlowItem[];
    connections: number[]; // dynamic connection target shop ids
    type: 'generator' | 'standard';
  }};
  isSimRunning: boolean;
  avgCycleTime: number;
  buffers: { [key: number]: number }; // Buffer Size overrides from the Buffer panel
}
