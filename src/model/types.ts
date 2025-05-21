export type Device = {
  id: string;
  bridge_id: string;
  product: string;
  battery_level: string;
  connected: boolean;
};

export type LeakInfo = {
  active: boolean;
};

export type WaterUsage = {
  today: [{ value: number; }];
  month: [{ value: number; }];
  prevMonth: [{ value: number; }];
};

export class DeviceUpdate {
  constructor(
    readonly device: Device,
    readonly waterUsage: WaterUsage | undefined,
    readonly leakInfo: LeakInfo | undefined,
  ) {}
};