export interface IoBrokerState {
  val: unknown;
  ack: boolean;
  ts: number;
  q: number;
  from: string;
  user: string;
  lc: number;
  id: string;
  c?: string;
}

export interface IoBrokerObjectCommon {
  name: string | Record<string, string>;
  type?: string;
  role?: string;
  unit?: string;
  read?: boolean;
  write?: boolean;
  min?: number;
  max?: number;
  states?: Record<string, string>;
  custom?: Record<string, { enabled?: boolean }>;
  desc?: string;
  members?: string[];
  smartName?: string | Record<string, string> | false;
  alias?: { id?: string; read?: string; write?: string };
}

export interface IoBrokerObject {
  _id: string;
  type: string;
  common: IoBrokerObjectCommon;
  native: Record<string, unknown>;
  enums?: Record<string, string>;
  from?: string;
  user?: string;
  ts?: number;
}

export interface HistoryEntry {
  val: number;
  ts: number;
  ack?: boolean;
}

export interface HistoryOptions {
  start: number;
  end: number;
  count?: number;
  aggregate?: 'none' | 'average' | 'minmax' | 'min' | 'max';
}

export interface TreeNode {
  name: string;
  fullPath: string;
  children: Map<string, TreeNode>;
  isLeaf: boolean;
  count?: number;
}
