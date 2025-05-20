import { API, Logger, PlatformAccessory, PlatformConfig } from 'homebridge';
import platformLang from './lang/en.js';
import { Device, FlumeAPI } from './flume.js';
import { DEFAULT_CONFIG, DEFAULT_REFRESH_INTERVAL, MIN_REFRESH_INTERVAL, MINUTE } from './constants.js';
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';
import { FlumeAccessory, LeakSensorUpdate } from './accessory.js';
import { PLUGIN_NAME, PLATFORM_NAME } from './settings.js';

export class FlumePlatform {

  private isBeta: boolean = false;
  private flumeAPI: FlumeAPI | null = null;
  private readonly accessories: Map<string, PlatformAccessory> = new Map();
  private readonly controllers: Map<string, FlumeAccessory> = new Map();
  private counter: number = 0;
  refreshInterval: NodeJS.Timeout | undefined;

  constructor(
    readonly log: Logger,
    readonly config: PlatformConfig,
    readonly api: API,
  ) {

    const packageVersion = this.packageVersion;
    this.isBeta = this.packageVersion.includes('beta');

    // Log some environment info for debugging
    this.log.info(
      '%s v%s | System %s | Node %s | HB v%s | HAPNodeJS v%s...',
      platformLang.initializing,
      packageVersion,
      process.platform,
      process.version,
      api.serverVersion,
      api.hap.HAPLibraryVersion(),
    );

    try {

      // Apply the user's configuration
      this.config = DEFAULT_CONFIG;
      this.applyUserConfig(config);

      // Set up the Homebridge events
      this.api.on('didFinishLaunching', () => this.pluginSetup());
      this.api.on('shutdown', () => this.pluginShutdown());
    } catch (err) {
      // Catch any errors during initialisation
      log.warn('***** %s. *****', platformLang.disabling);
      log.warn('***** %s. *****', this.parseError(err, [
        platformLang.hbVersionFail,
        platformLang.pluginNotConf,
      ]));
    }
  }

  applyUserConfig(config: PlatformConfig): void {
    
    // Begin applying the user's config
    Object.entries(config).forEach((entry) => {
      const [key, val] = entry;
      switch (key) {
      case 'clientId':
      case 'clientSecret':
      case 'password':
      case 'username':
        if (typeof val !== 'string' || val === '') {
          this.log.warn('%s [%s] %s.', platformLang.cfgItem, key, platformLang.cfgIgn);
        } else {
          this.config[key] = val;
        }
        break;
      case 'disableDeviceLogging':
        if (typeof val === 'string') {
          this.log.warn('%s [%s] %s.', platformLang.cfgItem, key, platformLang.cfgQts);
        }
        this.config[key] = val === 'false' ? false : !!val;
        break;
      case 'name':
      case 'platform':
        break;
      case 'refreshInterval': {
        if (typeof val === 'string') {
          this.log.warn('%s [%s] %s.', platformLang.cfgItem, key, platformLang.cfgQts);
        }
        const intVal = parseInt(val, 10);
        if (Number.isNaN(intVal)) {
          this.log.warn('%s [%s] %s %s.', platformLang.cfgItem, key, platformLang.cfgDef, DEFAULT_REFRESH_INTERVAL);
          this.config[key] = DEFAULT_REFRESH_INTERVAL;
        } else if (intVal < MIN_REFRESH_INTERVAL) {
          this.log.warn('%s [%s] %s %s.', platformLang.cfgItem, key, platformLang.cfgLow, MIN_REFRESH_INTERVAL);
          this.config[key] = MIN_REFRESH_INTERVAL;
        } else {
          this.config[key] = intVal;
        }
        break;
      }
      default:
        this.log.warn('%s [%s] %s.', platformLang.cfgItem, key, platformLang.cfgRmv);
        break;
      }
    });
  }

  async pluginSetup(): Promise<void> {

    // Log that the plugin initialisation has been successful
    this.log.info('%s.', platformLang.initialized);

    if (this.isBeta) {
      const divide = '*'.repeat(platformLang.beta.length + 1); // don't forget the full stop (+1!)
      this.log.warn(divide);
      this.log.warn(`${platformLang.beta}.`);
      this.log.warn(divide);
    }

    try {

      // Ensure username and password have been provided
      if (
        !this.config.username
        || !this.config.password
        || !this.config.clientId
        || !this.config.clientSecret
      ) {
        throw new Error(platformLang.noCreds);
      }

      // Set up the HTTP client if Flume username and password have been provided
      this.flumeAPI = new FlumeAPI(this.log, this.config.username, this.config.password, this.config.clientId, this.config.clientSecret, this.isBeta);
      await this.flumeAPI.obtainToken();
      const deviceList = await this.flumeAPI.getDevices();

      // Check we have devices we can work with
      if (!Array.isArray(deviceList) || deviceList.length === 0) {
        this.accessories.forEach((accessory) => this.removeAccessory(accessory));
        throw new Error(platformLang.noDevices);
      }

      // Initialize each device into Homebridge
      deviceList.forEach((device) => {
        if (!device.bridge_id) {
          return;
        }
        this.initializeDevice(device);
      });

      // Remove any stale accessories that don't appear in the device list
      this.accessories.forEach((accessory) => {
        if (!deviceList.find((el) => accessory.context.deviceId === el.id)) {
          this.removeAccessory(accessory);
        }
      });

      // Perform a first sync and set up the refresh interval
      this.counter = 0;
      this.flumeSync();

      // Note the Flume API has a limit of 120 requests per hour
      this.refreshInterval = setInterval(
        () => this.flumeSync(),
        this.config.refreshInterval * MINUTE,
      );

      // Log that the plugin setup has been successful with a welcome message
      const randIndex = Math.floor(Math.random() * platformLang.zWelcome.length);
      this.log.info('%s. %s', platformLang.complete, platformLang.zWelcome[randIndex]);
    } catch (err) {
      // Catch any errors during setup
      this.log.warn('***** %s. *****', platformLang.disabling);
      this.log.warn('***** %s. *****', this.parseError(err, [
        platformLang.noCreds,
        platformLang.noDevices,
      ]));
      this.pluginShutdown();
    }
  }

  pluginShutdown(): void {
    // A function that is called when the plugin fails to load or Homebridge restarts
    try {
      // Stop the refresh interval
      if (this.refreshInterval) {
        clearInterval(this.refreshInterval);
      }
    } catch (err) {
      // No need to show errors at this point
    }
  }

  async flumeSync(): Promise<void> {
    try {
      // Reset the counter for water info once we reach 10
      if (this.counter === 10) {
        this.counter = 0;
      }
      this.accessories.forEach(async (accessory: PlatformAccessory) => {
        try {
          const devInfo = this.counter === 0 ? await this.flumeAPI?.getDeviceInfo(accessory.context.deviceId) : undefined;
          const waterUsage = this.counter === 0 ? await this.flumeAPI?.getWaterUsage(accessory.context.deviceId) : undefined;
          const leakInfo = await this.flumeAPI?.getLeakInfo(accessory.context.deviceId) ?? undefined;
          const update = new LeakSensorUpdate(devInfo, waterUsage, leakInfo);
          this.controllers.get(accessory.UUID)?.externalUpdate(update);
        } catch (err) {
          this.log.warn('[%s] %s %s.', accessory.displayName, platformLang.devNotRef, this.parseError(err));
        }
        this.counter += 1;
      });
    } catch (err) {
      // Catch any errors performing the sync
      this.log.warn('%s %s.', platformLang.syncFailed, this.parseError(err));
    }
  }

  initializeDevice(device: Device): void {
    try {
      /*
        {
          id: '',
          type: 2,
          location_id: 0000,
          user_id: 0000,
          bridge_id: '',
          oriented: true,
          last_seen: '',
          connected: true,
          battery_level: 'high',
          product: 'flume1'
        }
      */

      const uuid = this.api.hap.uuid.generate(device.id);

      // Get the cached accessory or add to Homebridge if it doesn't exist
      const accessory = this.accessories.get(uuid) || this.addAccessory(device);

      // Final check the accessory now exists in Homebridge
      if (!accessory) {
        throw new Error(platformLang.accNotFound);
      }

      // Create the instance for this device type
      this.controllers.set(accessory.UUID, new FlumeAccessory(this, accessory));

      // Log the device initialisation
      this.log.info('[%s] %s [%s].', accessory.displayName, platformLang.devInit, device.id);
    } catch (err) {
      // Catch any errors during device initialisation
      this.log.warn('[%s] %s %s.', device.id, platformLang.devNotInit, this.parseError(err, [
        platformLang.accNotFound,
      ]));
    }
  }

  addAccessory(device: Device): PlatformAccessory | false {

    // Add an accessory to Homebridge
    try {
      const uuid = this.api.hap.uuid.generate(device.id);
      const accessory = new this.api.platformAccessory(platformLang.brand, uuid);
      accessory
        .getService(this.api.hap.Service.AccessoryInformation)
        ?.setCharacteristic(this.api.hap.Characteristic.Name, platformLang.brand)
        .setCharacteristic(this.api.hap.Characteristic.ConfiguredName, platformLang.brand)
        .setCharacteristic(this.api.hap.Characteristic.Manufacturer, platformLang.brand)
        .setCharacteristic(this.api.hap.Characteristic.SerialNumber, device.id)
        .setCharacteristic(this.api.hap.Characteristic.Model, device.product)
        .setCharacteristic(this.api.hap.Characteristic.Identify, true);
      accessory.context.deviceId = device.id;
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.accessories.set(accessory.UUID, accessory);
      this.log.info('[%s] %s.', accessory.displayName, platformLang.devAdd);
      return accessory;
    } catch (err) {
      // Catch any errors during add
      this.log.warn('[%s] %s %s.', platformLang.brand, platformLang.devNotAdd, this.parseError(err));
      return false;
    }
  }

  configureAccessory(accessory: PlatformAccessory): void {
    // Add the configured accessory to our global map
    this.accessories.set(accessory.UUID, accessory);
  }

  removeAccessory(accessory: PlatformAccessory): void {
    // Remove an accessory from Homebridge
    try {
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.accessories.delete(accessory.UUID);
      this.log.info('[%s] %s.', accessory.displayName, platformLang.devRemove);
    } catch (err) {
      // Catch any errors during remove
      this.log.warn('[%s] %s %s.', accessory.displayName, platformLang.devNotRemove, this.parseError(err));
    }
  }

  private get packageVersion(): string {
    try {
      const __dirname = path.dirname(fileURLToPath(import.meta.url));
      const packageJSONPath = path.join(__dirname, '../package.json');
      const packageJSON = JSON.parse(fs.readFileSync(packageJSONPath, { encoding: 'utf8' }));
      return packageJSON.version;
    } catch (error) {
      return '0.0.0'; 
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parseError(err: any, hideStack: string[] = []): string {
    let toReturn = err.message;
    if (err.stack && err?.stack?.length > 0 && !hideStack.includes(err.message)) {
      const stack = err.stack.split('\n');
      if (stack[1]) {
        toReturn += stack[1].replace('   ', '');
      }
    }
    return toReturn;
  };
}
