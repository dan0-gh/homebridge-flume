import { Characteristic, Formats, HAP, Perms, PlatformAccessory, Service } from 'homebridge';
import { FlumePlatform } from './platform.js';
import strings from './lang/en.js';
import { DeviceUpdate } from './model/types.js';

class CustomCharacteristic {
  constructor(readonly name: string, readonly uuid: string) {
  }
}

const TODAY_USAGE = new CustomCharacteristic(strings.customCharTodayUsage, 'E966F001-079E-48FF-8F27-9C2605A29F52');
const MONTH_USAGE = new CustomCharacteristic(strings.customCharMonthUsage, 'E966F002-079E-48FF-8F27-9C2605A29F52');
const PREV_MONTH_USAGE = new CustomCharacteristic(strings.customCharPreviousMonth, 'E966F003-079E-48FF-8F27-9C2605A29F52');

export class FlumeAccessory {
  private readonly HAP: HAP;
  private readonly Characteristic: typeof Characteristic;

  private readonly leakService: Service;

  private cacheLeak: boolean;
  private cacheBatt: boolean;
  private cacheStatus: boolean;

  private readonly todayUsageChar: Characteristic;
  private readonly monthUsageChar: Characteristic;
  private readonly prevMonthUsageChar: Characteristic;

  constructor(
    readonly platform: FlumePlatform, 
    readonly accessory: PlatformAccessory,
  ) {
    this.HAP = platform.api.hap;
    this.Characteristic = this.HAP.Characteristic;

    this.leakService = this.accessory.getService(this.HAP.Service.LeakSensor)
      || this.accessory.addService(this.HAP.Service.LeakSensor);

    this.cacheLeak = !!this.leakService.getCharacteristic(this.Characteristic.LeakDetected).value;
    this.cacheBatt = !this.leakService.getCharacteristic(this.Characteristic.StatusLowBattery).value;
    this.cacheStatus = !this.leakService.getCharacteristic(this.Characteristic.StatusFault).value;

    this.todayUsageChar = this.attachCustomCharacteristic(TODAY_USAGE);
    this.monthUsageChar = this.attachCustomCharacteristic(MONTH_USAGE);
    this.prevMonthUsageChar = this.attachCustomCharacteristic(PREV_MONTH_USAGE);
  }

  externalUpdate(update: DeviceUpdate): void {

    // Check the data for leak detection
    if (update.leakInfo && this.hasProperty(update.leakInfo, 'active') && update.leakInfo.active !== this.cacheLeak) {
      this.cacheLeak = update.leakInfo.active ?? false;
      this.leakService.updateCharacteristic(this.Characteristic.LeakDetected, this.cacheLeak ? 1 : 0);
      this.log(`current leak status [${this.cacheLeak ? '' : 'not '}detected]`);
    }

    // Check the data for battery level, cacheBatt is true for OK and false for LOW
    if (update.device && this.hasProperty(update.device, 'battery_level') && (update.device.battery_level !== 'low') !== this.cacheBatt) {
      this.cacheBatt = update.device.battery_level !== 'low';
      this.leakService.updateCharacteristic(this.Characteristic.StatusLowBattery, this.cacheBatt ? 0 : 1);
      this.log(`current battery [${this.cacheBatt ? 'okay' : 'low'}]`);
    }

    // Check the data for connectivity, cacheStatus is true for OK and false for NOT CONNECTED
    if (update.device && this.hasProperty(update.device, 'connected') && update.device.connected !== this.cacheStatus) {
      this.cacheStatus = update.device.connected ?? false;
      this.leakService.updateCharacteristic(this.Characteristic.StatusFault, this.cacheStatus ? 0 : 1);
      this.log(`current status [${this.cacheStatus ? '' : 'not '}connected]`);
    }

    // Water info
    if (update.waterUsage) {
      if (update.waterUsage.today && update.waterUsage.today[0] && this.hasProperty(update.waterUsage.today[0], 'value')) {
        this.todayUsageChar.updateValue(update.waterUsage.today[0].value);
      }
      if (update.waterUsage.month && update.waterUsage.month[0] && this.hasProperty(update.waterUsage.month[0], 'value')) {
        this.monthUsageChar.updateValue(update.waterUsage.month[0].value);
      }
      if (update.waterUsage.prevMonth && update.waterUsage.prevMonth[0] && this.hasProperty(update.waterUsage.prevMonth[0], 'value')) {
        this.prevMonthUsageChar.updateValue(update.waterUsage.prevMonth[0].value);
      }
    }
  }

  private attachCustomCharacteristic(char: CustomCharacteristic): Characteristic {
    let result: Characteristic;

    if (this.leakService.testCharacteristic(char.name)) {
      result = this.leakService.getCharacteristic(char.name)!; // Already tested it exists
    } else {
      result = this.leakService.addCharacteristic(new this.Characteristic(char.name, char.uuid, {
        format: Formats.UINT32,
        perms: [ Perms.PAIRED_READ, Perms.NOTIFY ],
        unit: strings.customCharUnits,
      }));
    }

    return result;
  }

  private hasProperty(obj: object, prop: PropertyKey): boolean {
    return Object.prototype.hasOwnProperty.call(obj, prop);
  }

  private log(msg: string) {
    this.platform.log.info('[%s] %s.', this.accessory.displayName, msg);
  }
}
