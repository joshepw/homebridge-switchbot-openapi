import { Service, PlatformAccessory } from 'homebridge';
import { SwitchBotPlatform } from '../platform';
import { interval, Subject } from 'rxjs';
import { debounceTime, skipWhile, tap } from 'rxjs/operators';
import { DeviceURL } from '../settings';
import { device, deviceStatusResponse } from '../configTypes';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Bot {
  private service: Service;


  botUpdateInProgress!: boolean;
  doBotUpdate!: any;
  On!: boolean;
  OutletInUse!: boolean;
  deviceStatus!: deviceStatusResponse;

  constructor(
    private readonly platform: SwitchBotPlatform,
    private accessory: PlatformAccessory,
    public device: device,
  ) {
    // default placeholders
    this.On;
    this.OutletInUse;

    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doBotUpdate = new Subject();
    this.botUpdateInProgress = false;

    // Retrieve initial values and updateHomekit
    this.refreshStatus();

    // set accessory information
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'SwitchBot')
      .setCharacteristic(this.platform.Characteristic.Model, this.device.deviceType)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.device.deviceId);

    // get the LightBulb service if it exists, otherwise create a new LightBulb service
    // you can create multiple services for each accessory
    (this.service =
      this.accessory.getService(this.platform.Service.Outlet) ||
      this.accessory.addService(this.platform.Service.Outlet)),
    `${this.device.deviceName} ${this.device.deviceType}`;

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // this.accessory.getService('NAME') ?? this.accessory.addService(this.platform.Service.Lightbulb, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(
      this.platform.Characteristic.Name,
      `${this.device.deviceName} ${this.device.deviceType}`,
    );

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/Outlet

    this.service.getCharacteristic(this.platform.Characteristic.On)
      .on('set', this.handleOnSet.bind(this));

    this.service.setCharacteristic(
      this.platform.Characteristic.OutletInUse,
      this.OutletInUse,
    );

    // Retrieve initial values and updateHomekit
    //this.refreshStatus();
    this.updateHomeKitCharacteristics();

    // Start an update interval
    interval(this.platform.config.options!.refreshRate! * 1000)
      .pipe(skipWhile(() => this.botUpdateInProgress))
      .subscribe(() => {
        this.refreshStatus();
      });

    // Watch for Bot change events
    // We put in a debounce of 100ms so we don't make duplicate calls
    this.doBotUpdate
      .pipe(
        tap(() => {
          this.botUpdateInProgress = true;
        }),
        debounceTime(100),
      )
      .subscribe(async () => {
        try {
          await this.pushChanges();
        } catch (e) {
          this.platform.log.error(JSON.stringify(e.message));
          this.platform.log.debug('Bot %s -', this.accessory.displayName, JSON.stringify(e));
        }
        this.botUpdateInProgress = false;
      });
  }

  /**
   * Parse the device status from the SwitchBot api
   */
  parseStatus() {
    // Current Relative Humidity
    if (this.deviceStatus.body.power) {
      this.On = true;
    }
    this.platform.log.debug(
      'Bot %s CurrentRelativeHumidity -',
      this.accessory.displayName,
      'Device is Currently: ',
      this.On,
    );
  }

  /**
   * Asks the SwitchBot API for the latest device information
   */
  async refreshStatus() {
    try {
      // this.platform.log.error('Bot - Reading', `${DeviceURL}/${this.device.deviceID}/devices`);
      const deviceStatus: deviceStatusResponse = (
        await this.platform.axios.get(`${DeviceURL}/${this.device.deviceId}/status`)
      ).data;
      if (deviceStatus.message === 'success') {
        this.deviceStatus = deviceStatus;
        this.platform.log.debug(
          'Bot %s refreshStatus -',
          this.accessory.displayName,
          JSON.stringify(this.deviceStatus),
        );

        this.parseStatus();
        this.updateHomeKitCharacteristics();
      }
    } catch (e) {
      this.platform.log.error(
        `Bot - Failed to update status of ${this.device.deviceName}`,
        JSON.stringify(e.message),
        this.platform.log.debug('Bot %s -', this.accessory.displayName, JSON.stringify(e)),
      );
    }
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   */
  async pushChanges() {
    this.platform.log.debug(`Pushing On: ${this.On}!`);
    const payload = {
      commandType: 'command',
      parameter: 'default',
    } as any;

    if (this.On) {
      payload.commmand = 'turnOn';
    } else if (!this.On) {
      payload.commmand = 'turnOff';
    } else {
      payload.commmand = 'press';
    }

    this.platform.log.info(
      'Sending request to SwitchBot API. command:',
      `${payload.command}, parameter:`,
      `${payload.parameter}, commandType:`,
      `${payload.commandType}`,
    );
    this.platform.log.debug('Bot %s pushChanges -', this.accessory.displayName, JSON.stringify(payload));

    // Make the API request
    const push = await this.platform.axios.post(`${DeviceURL}/${this.device.deviceId}/commands`, payload);
    this.platform.log.debug('Bot %s Changes pushed -', this.accessory.displayName, push.data);
  }

  /**
   * Updates the status for each of the HomeKit Characteristics
   */
  updateHomeKitCharacteristics() {
    this.service.updateCharacteristic(
      this.platform.Characteristic.On,
      this.On,
    );
    this.service.updateCharacteristic(
      this.platform.Characteristic.OutletInUse,
      this.OutletInUse,
    );
  }

  /**
   * Handle requests to set the "On" characteristic
   */
  handleOnSet(value, callback) {
    this.platform.log.debug('Triggered SET On:', value);

    callback(null);
  }
}
