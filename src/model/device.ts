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
  currentFlowRate: number = 0; // units per minute (gallons/min, liters/min, etc.)

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

      // Calculate current flow rate from minute-level data
      if (usageData.flowRate && usageData.flowRate.length > 0) {
        // Get the most recent minute's usage as the current flow rate
        // The flowRate array contains per-minute usage values
        const recentMinutes = usageData.flowRate;
        if (recentMinutes.length > 0) {
          // Use the most recent minute's value, or average the last few minutes
          // Taking the last value gives the most current reading
          const lastMinute = recentMinutes[recentMinutes.length - 1];
          this.currentFlowRate = lastMinute?.value || 0;
        } else {
          this.currentFlowRate = 0;
        }
      }
    }

    if (this._onUpdateCallback) {
      this._onUpdateCallback(this.id);
    }
  }
}