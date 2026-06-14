import type { IoBrokerObject } from '../../types/iobroker';

export function getThresholdStatus(
  val: unknown,
  min: number | undefined,
  max: number | undefined,
): 'exceeded' | 'warn' | null {
  if (typeof val !== 'number' || !Number.isFinite(val)) return null;
  if (min === undefined && max === undefined) return null;

  if ((max !== undefined && val > max) || (min !== undefined && val < min)) return 'exceeded';

  if (min !== undefined && max !== undefined && max > min) {
    const warnZone = (max - min) * 0.1;
    if (val <= min + warnZone || val >= max - warnZone) return 'warn';
  }

  return null;
}

export function getObjectName(obj: IoBrokerObject | undefined): string {
  if (!obj?.common?.name) return '';
  if (typeof obj.common.name === 'string') return obj.common.name;
  return obj.common.name.de || obj.common.name.en || Object.values(obj.common.name)[0] || '';
}

export function resolveI18n(val: string | Record<string, string> | undefined): string | undefined {
  if (!val) return undefined;
  if (typeof val === 'string') return val;
  return val.de || val.en || Object.values(val)[0] || undefined;
}
