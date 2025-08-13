import { DeviceData, LeakData, NotificationType, UsageData } from './types.js';

const BATTERY_LEVEL_LOW = 'low';

export class Device {

  readonly id: string;
  readonly locationId: string;
  readonly productName: string;

  isBatteryLow: boolean;
  isDisconnected: boolean;

  isLeakDetected: boolean = false;
  isFlowing: boolean = false;
  private flowThreshold: number = 0;
  
  usageToday: number = 0;
  usageMonth: number = 0;
  usageLastMonth: number = 0;

  private _onUpdateCallback: ((id: string) => void) | null = null;

  constructor(data: DeviceData, flowThreshold?: number) {
    this.id = data.id;
    this.locationId = data.location_id;
    this.productName = data.product;
    this.isDisconnected = !data.connected;
    this.isBatteryLow = data.battery_level === BATTERY_LEVEL_LOW;
    this.flowThreshold = Math.max(0, flowThreshold ?? 0);
  }

  setOnUpdateCallback(callback: (serialNumber: string) => void): void {
    this._onUpdateCallback = callback;
  }

  update(leakData: LeakData | null, unreadNotifications: Set<NotificationType> | null, deviceData: DeviceData | null, usageData: UsageData | null) {

    if (leakData) {
      this.isLeakDetected = leakData.active;
    } else if (unreadNotifications) {
      this.isLeakDetected = unreadNotifications.has(NotificationType.USAGE_ALERT);
    }

    if (deviceData) {
      this.isBatteryLow = deviceData.battery_level === BATTERY_LEVEL_LOW;
      this.isDisconnected = !deviceData.connected;
    }

    if (usageData) {
      const previousUsageToday = this.usageToday;
      this.usageToday = usageData.today[0]?.value || 0;
      this.usageMonth = usageData.month[0]?.value || 0;
      this.usageLastMonth = usageData.lastMonth[0]?.value || 0;

      const usageIncrease = this.usageToday - previousUsageToday;
      this.isFlowing = usageIncrease > this.flowThreshold;
    }

    if (this._onUpdateCallback) {
      this._onUpdateCallback(this.id);
    }
  }
}