import fs from 'fs';
import { API, Logger, PlatformAccessory, PlatformConfig } from 'homebridge';
import path from 'path';
import { fileURLToPath } from 'url';

import { FlumeAccessory } from './accessory.js';
import { PLUGIN_NAME, PLATFORM_NAME } from './settings.js';
import { parseError } from './utils.js';

import strings from './lang/en.js';

import { FlumeAPI } from './model/api.js';
import { Device, DeviceUpdate } from './model/types.js';

export class FlumePlatform {

  private isBeta: boolean = false;
  private flumeAPI: FlumeAPI | null = null;
  private readonly platformAccessories: Map<string, PlatformAccessory> = new Map();
  private readonly controllers: Map<string, FlumeAccessory> = new Map();

  constructor(
    readonly log: Logger,
    readonly config: PlatformConfig,
    readonly api: API,
  ) {

    const packageVersion = this.packageVersion;
    this.isBeta = this.packageVersion.includes('beta');

    // Log some environment info for debugging
    this.log.info(
      '%s v%s | System %s | Node %s | HB v%s | HAPNodeJS v%s',
      strings.initializing,
      packageVersion,
      process.platform,
      process.version,
      api.serverVersion,
      api.hap.HAPLibraryVersion(),
    );

    // Set up the Homebridge events
    this.api.on('didFinishLaunching', () => this.pluginSetup());
    this.api.on('shutdown', () => this.pluginShutdown());
  }

  async pluginSetup(): Promise<void> {

    // Log that the plugin initialisation has been successful
    this.log.info('%s', strings.initialized);

    if (this.isBeta) {
      const divide = '*'.repeat(strings.beta.length);
      this.log.warn(`\n${divide}\n${strings.beta}\n${divide}`);
    }

    // Ensure required config variables have been provided
    if (
      !this.config.username ||
      !this.config.password ||
      !this.config.clientId ||
      !this.config.clientSecret ||
      !this.config.refreshInterval
    ) {
      this.log.error(strings.badConfig);
      return;
    }

    // Set up the HTTP client if Flume username and password have been provided
    this.flumeAPI = await FlumeAPI.login(
      this.onDeviceUpdate.bind(this),
      this.config.username,
      this.config.password,
      this.config.clientId,
      this.config.clientSecret,
      this.config.refreshInterval,
      this.log,
      this.isBeta,
    );

    const devices = this.flumeAPI.devices;
    if (devices.length === 0) {
      this.platformAccessories.forEach((accessory) => this.removeAccessory(accessory));
      this.log.warn(strings.noDevices);
      this.pluginShutdown();
      return;
    }

    // Initialize each device into Homebridge
    devices.forEach((device) => {
      this.initializeDevice(device);
    });

    // Remove any stale accessories that don't appear in the device list
    this.platformAccessories.forEach((accessory) => {
      const findID = accessory.context.deviceId;
      if (!devices.find((test) => findID === test.id)) {
        this.removeAccessory(accessory);
      }
    });

    // Log that the plugin setup has been successful with a welcome message
    this.log.info(strings.complete);

    const randIndex = Math.floor(Math.random() * strings.welcomeMessages.length);
    this.log.info(strings.welcomeMessages[randIndex]);
  }

  pluginShutdown(): void {
    this.flumeAPI?.teardown();
  }

  initializeDevice(device: Device): void {
    if (!device.bridge_id) {
      return;
    }

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
      const accessory = this.platformAccessories.get(uuid) || this.addAccessory(device);

      // Final check the accessory now exists in Homebridge
      if (!accessory) {
        throw new Error(strings.accNotFound);
      }

      // Create the instance for this device type
      this.controllers.set(device.id, new FlumeAccessory(this, accessory));

      // Log the device initialisation
      this.log.info('[%s] %s [%s].', accessory.displayName, strings.devInit, device.id);
    } catch (err) {
      // Catch any errors during device initialisation
      this.log.warn('[%s] %s %s.', device.id, strings.devNotInit, parseError(err, [
        strings.accNotFound,
      ]));
    }
  }

  addAccessory(device: Device): PlatformAccessory | false {

    // Add an accessory to Homebridge
    try {
      const uuid = this.api.hap.uuid.generate(device.id);
      const accessory = new this.api.platformAccessory(strings.brand, uuid);
      accessory
        .getService(this.api.hap.Service.AccessoryInformation)
        ?.setCharacteristic(this.api.hap.Characteristic.Name, strings.brand)
        .setCharacteristic(this.api.hap.Characteristic.ConfiguredName, strings.brand)
        .setCharacteristic(this.api.hap.Characteristic.Manufacturer, strings.brand)
        .setCharacteristic(this.api.hap.Characteristic.SerialNumber, device.id)
        .setCharacteristic(this.api.hap.Characteristic.Model, device.product)
        .setCharacteristic(this.api.hap.Characteristic.Identify, true);
      accessory.context.deviceId = device.id;
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.platformAccessories.set(accessory.UUID, accessory);
      this.log.info('[%s] %s.', accessory.displayName, strings.devAdd);
      return accessory;
    } catch (err) {
      // Catch any errors during add
      this.log.warn('[%s] %s %s.', strings.brand, strings.devNotAdd, parseError(err));
      return false;
    }
  }

  removeAccessory(accessory: PlatformAccessory): void {
    // Remove an accessory from Homebridge
    try {
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.platformAccessories.delete(accessory.UUID);
      this.log.info('[%s] %s.', accessory.displayName, strings.devRemove);
    } catch (err) {
      // Catch any errors during remove
      this.log.warn('[%s] %s %s.', accessory.displayName, strings.devNotRemove, parseError(err));
    }
  }

  private onDeviceUpdate(update: DeviceUpdate) {
    this.controllers.get(update.device.id)?.externalUpdate(update);
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
}
