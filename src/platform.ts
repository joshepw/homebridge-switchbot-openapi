import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, Service, Characteristic } from 'homebridge';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import * as qs from 'querystring';
import { readFileSync, writeFileSync } from 'fs';
import { PLATFORM_NAME, PLUGIN_NAME, AuthURL, DeviceURL } from './settings';
import { Humidifier } from './Devices/Humidifier';
import {
  irdevices,
  devices,
  SwitchBotPlatformConfig,
} from './configTypes';

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class SwitchBotPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  public axios: AxiosInstance = axios.create({
    responseType: 'json',
  });

  public sensorData = [];
  private refreshInterval;

  constructor(public readonly log: Logger, public readonly config: SwitchBotPlatformConfig, public readonly api: API) {
    this.log.debug('Finished initializing platform:', this.config.name);
    // only load if configured
    if (!this.config) {
      return;
    }

    // verify the config
    try {
      this.verifyConfig();
      this.log.debug('Config OK');
    } catch (e) {
      this.log.error(JSON.stringify(e.message));
      this.log.debug(JSON.stringify(e));
      return;
    }

    // setup axios interceptor to add headers / api key to each request
    this.axios.interceptors.request.use((request: AxiosRequestConfig) => {
      request.headers.Authorization = `Bearer ${this.config.credentials ?.accessToken}`;
      request.params = request.params || {};
      request.params.apikey = this.config.credentials ?.consumerKey;
      request.headers['Content-Type'] = 'application/json';
      return request;
    });

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', async () => {
      log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      await this.refreshAccessToken();
      try {
        this.discoverDevices();
      } catch (e) {
        this.log.error('Failed to Discover Devices.', JSON.stringify(e.message));
        this.log.debug(JSON.stringify(e));
      }
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  /**
   * Verify the config passed to the plugin is valid
   */
  verifyConfig() {
    /**
     * Hidden Device Discovery Option
     * This will disable adding any device and will just output info.
     */
    this.config.devicediscovery;

    this.config.options = this.config.options || {};

    if (this.config.options) {
      this.config.options.ttl = this.config.options!.ttl || 300; // default 300 seconds
    }

    if (!this.config.credentials ?.consumerSecret && this.config.options!.ttl! < 300) {
      this.log.debug('TTL must be set to 300 or higher unless you setup your own consumerSecret.');
      this.config.options!.ttl! = 300;
    }

    if (!this.config.credentials) {
      throw new Error('Missing Credentials');
    }
    if (!this.config.credentials.consumerKey) {
      throw new Error('Missing consumerKey');
    }
    if (!this.config.credentials.refreshToken) {
      throw new Error('Missing refreshToken');
    }
  }

  async refreshAccessToken() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
    this.refreshInterval = setInterval(() => this.getAccessToken(), (1800 / 3) * 1000);
    await this.getAccessToken();
  }

  /**
   * Exchange the refresh token for an access token
   */
  async getAccessToken() {
    try {
      let result;

      if (this.config.credentials!.consumerSecret) {
        // this.log.debug('Logging into honeywell', new Error());
        result = (
          await axios({
            url: AuthURL,
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            auth: {
              username: this.config.credentials!.consumerKey,
              password: this.config.credentials!.consumerSecret,
            },
            data: qs.stringify({
              grant_type: 'refresh_token',
              refresh_token: this.config.credentials!.refreshToken,
            }),
            responseType: 'json',
          })
        ).data;
      }

      this.config.credentials!.accessToken = result.access_token;
      this.log.warn('Got access token:', this.config.credentials!.accessToken);

      // check if the refresh token has changed
      if (result.refresh_token !== this.config.credentials!.refreshToken) {
        this.log.warn('New refresh token:', result.refresh_token);
        await this.updateRefreshToken(result.refresh_token);
      }

      this.config.credentials!.refreshToken = result.refresh_token;
    } catch (e) {
      this.log.error('Failed to refresh access token.', JSON.stringify(e.message));
      this.log.debug(JSON.stringify(e));
    }
  }

  /**
   * The refresh token will periodically change.
   * This method saves the updated refresh token in the config.json file
   * @param newRefreshToken
   */
  async updateRefreshToken(newRefreshToken: string) {
    try {
      // check the new token was provided
      if (!newRefreshToken) {
        throw new Error('New token not provided');
      }

      // load in the current config
      const currentConfig = JSON.parse(readFileSync(this.api.user.configPath(), 'utf8'));

      // check the platforms section is an array before we do array things on it
      if (!Array.isArray(currentConfig.platforms)) {
        throw new Error('Cannot find platforms array in config');
      }

      // find this plugins current config
      const pluginConfig = currentConfig.platforms.find((x: { platform: string }) => x.platform === PLATFORM_NAME);

      if (!pluginConfig) {
        throw new Error(`Cannot find config for ${PLATFORM_NAME} in platforms array`);
      }

      // check the .credentials is an object before doing object things with it
      if (typeof pluginConfig.credentials !== 'object') {
        throw new Error('pluginConfig.credentials is not an object');
      }

      // set the refresh token
      pluginConfig.credentials.refreshToken = newRefreshToken;

      // save the config, ensuring we maintain pretty json
      writeFileSync(this.api.user.configPath(), JSON.stringify(currentConfig, null, 4));

      this.log.warn('Homebridge config.json has been updated with new refresh token.');
    } catch (e) {
      this.log.error('Failed to update refresh token in config:', JSON.stringify(e.message));
      this.log.debug(JSON.stringify(e));
    }
  }

  /**
   * this method discovers the Locations
   */
  async discoverDevices() {
    const devices = (await this.axios.get(DeviceURL)).data;
    for (const device of devices.body.deviceList) {
      this.log.info(`Total Devices Found: ${device.length}`);
      this.log.debug(JSON.stringify(device));
      if (device.deviceModel.startsWith('D6')) {
        // this.deviceinfo(device);
        // this.log.debug(JSON.stringify(device));
        this.log.info('Discovered %s %s - %s', device.deviceType, device.deviceModel, device.userDefinedDeviceName);
        this.createHumidifier(device, devices);
      } else if (!device.DeviceModel) {
        this.log.info('A LLC Device has been discovered with a deviceModel that does not start with T5, D6 or T9');
      }
    }
  }

  private async createHumidifier(device, devices) {
    const uuid = this.api.hap.uuid.generate(`${device.name}-${device.deviceID}-${device.deviceModel}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (devices.statusCode === 100) {
        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        //existingAccessory.context.firmwareRevision = firmware;
        await this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        await new Humidifier(this, existingAccessory, device);
        this.log.debug(`T9 UDID: ${device.name}-${device.deviceID}-${device.deviceModel}`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else {
      // the accessory does not yet exist, so we need to create it
      this.log.info('Adding new accessory:', `${device.name} ${device.deviceModel} ${device.deviceType}`);
      this.log.debug(
        `Registering new device: ${device.name} ${device.deviceModel} ${device.deviceType} - ${device.deviceID}`,
      );

      // create a new accessory
      const accessory = new this.api.platformAccessory(`${device.name} ${device.deviceType}`, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      //accessory.context.firmwareRevision = firmware;
      accessory.context.device = device;
      // accessory.context.firmwareRevision = findaccessories.accessoryAttribute.softwareRevision;
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Humidifier(this, accessory, device);
      this.log.debug(`T9 UDID: ${device.name}-${device.deviceID}-${device.deviceModel}`);

      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.accessories.push(accessory);
    }
  }

  public unregisterPlatformAccessories(existingAccessory: PlatformAccessory) {
    // remove platform accessories when no longer present
    this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
    this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
  }

  public deviceinfo(device: irdevices | devices) {
    if (this.config.devicediscovery) {
      this.log.warn(JSON.stringify(device));
    }
  }
}
