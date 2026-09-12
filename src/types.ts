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
  isImportConverter?: boolean; // is this station acting as an import converter
}

export interface OrGateTopology {
  id: string; // e.g. "orgate-1-12345"
  name: string; // e.g. "OR GATE 1"
  posX: number;
  posY: number;
  criteriaCategory: 'shape' | 'color' | 'borderSize' | 'width' | 'height';
  criteriaValue: string; // e.g. "square" or "bg-[#4b8eff]"
  targetStationA: string; // Successor if yes
  targetStationB: string; // Successor if no
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
  orGates?: OrGateTopology[];
  isInputShop?: boolean;
  isOutputShop?: boolean;
  intakePartsCount?: number;
  partShape?: 'pentagon' | 'heart' | 'square' | 'triangle' | 'diamond' | 'oval' | 'rectangle' | 'circle';
  partSize?: number;
  partWidth?: number;
  partHeight?: number;
  paintStrokeWidth?: number;
  paintFillColor?: string;
}

export interface PartFlowItem {
  id: string; // e.g. A3, X7
  shape: 'pentagon' | 'heart' | 'square' | 'triangle' | 'diamond' | 'oval' | 'rectangle' | 'circle';
  color: string; // Tailwind bg color class or color code
  borderSize?: number; // border size in pixels
  width?: number; // custom width value
  height?: number; // custom height value
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
