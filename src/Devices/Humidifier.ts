import { Service, PlatformAccessory } from 'homebridge';
import { SwitchBotPlatform } from '../platform';
import { interval, Subject } from 'rxjs';
import { debounceTime, skipWhile, tap } from 'rxjs/operators';
import { DeviceURL } from '../settings';
import { devices } from '../configTypes';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Humidifier {
  private service: Service;

  CurrentRelativeHumidity!: number;
  TargetHumidifierDehumidifierState;
  CurrentHumidifierDehumidifierState;
  Active;
  switchbotCommand: string[];
  switchbotParameter: string[];
  switchbotCommandType: string[];

  humidifierUpdateInProgress!: boolean;
  doHumidifierUpdate!: any;
  hdCurrentModes: {
    INACTIVE: number;
    IDLE: number;
    HUMIDIFYING: number;
    DEHUMIDIFYING: number;
  };

  hdTargetModes: {
    AUTO: number;
    HUMIDIFIER_OR_DEHUMIDIFIER: number;
    HUMIDIFIER: number;
    DEHUMIDIFIER: number;
  };

  hdActive: {
    INACTIVE: number;
    ACTIVE: number;
  };

  constructor(
    private readonly platform: SwitchBotPlatform,
    private accessory: PlatformAccessory,
    public device: devices,
  ) {
    // Map SwitchBot Modes to HomeKit Modes
    this.hdCurrentModes = {
      INACTIVE: platform.Characteristic.CurrentHumidifierDehumidifierState.INACTIVE, // ( 0 )
      IDLE: platform.Characteristic.CurrentHumidifierDehumidifierState.IDLE, // ( 1 )
      HUMIDIFYING: platform.Characteristic.CurrentHumidifierDehumidifierState.HUMIDIFYING, // ( 2 )
      DEHUMIDIFYING: platform.Characteristic.CurrentHumidifierDehumidifierState.DEHUMIDIFYING, // ( 3 )
    };
    this.hdTargetModes = {
      AUTO: platform.Characteristic.TargetHumidifierDehumidifierState.AUTO, // ( 0 )
      HUMIDIFIER_OR_DEHUMIDIFIER: platform.Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER_OR_DEHUMIDIFIER, // ( 0 )
      HUMIDIFIER: platform.Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER, // ( 1 )
      DEHUMIDIFIER: platform.Characteristic.TargetHumidifierDehumidifierState.DEHUMIDIFIER, // ( 2 )
    };
    this.hdActive = {
      INACTIVE: platform.Characteristic.Active.INACTIVE, // ( 0 )
      ACTIVE: platform.Characteristic.Active.ACTIVE, // ( 1 )
    };

    // Map HomeKit Modes to SwitchBot Command, Parameter, CommandType
    this.switchbotCommand = ['turnOff', 'turnOn', 'setMode'];
    this.switchbotParameter = ['default', 'auto', '101', '102', '103', '{0~100}'];
    this.switchbotCommandType = ['command'];

    // default placeholders
    this.CurrentRelativeHumidity;
    this.TargetHumidifierDehumidifierState;
    this.CurrentHumidifierDehumidifierState;
    this.Active;

    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doHumidifierUpdate = new Subject();
    this.humidifierUpdateInProgress = false;

    // set accessory information
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'SwitchBot')
      .setCharacteristic(this.platform.Characteristic.Model, this.device.deviceType)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.device.deviceId);

    // get the LightBulb service if it exists, otherwise create a new LightBulb service
    // you can create multiple services for each accessory
    (this.service =
      this.accessory.getService(this.platform.Service.HumidifierDehumidifier) ||
      this.accessory.addService(this.platform.Service.HumidifierDehumidifier)),
    `${this.device.deviceName} ${this.device.deviceType}`;

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // this.accessory.getService('NAME') ?? this.accessory.addService(this.platform.Service.Lightbulb, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(this.platform.Characteristic.Name, `${this.device.deviceName} ${this.device.deviceType}`);

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/HumidifierDehumidifier

    // Do initial device parse
    this.parseStatus();

    // create handlers for required characteristics
    this.service
      .getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
      .on('get', this.handleCurrentRelativeHumidityGet.bind(this));

    this.service
      .getCharacteristic(this.platform.Characteristic.CurrentHumidifierDehumidifierState)
      .on('get', this.handleCurrentHumidifierDehumidifierStateGet.bind(this));

    this.service
      .getCharacteristic(this.platform.Characteristic.TargetHumidifierDehumidifierState)
      .on('get', this.handleTargetHumidifierDehumidifierStateGet.bind(this))
      .on('set', this.handleTargetHumidifierDehumidifierStateSet.bind(this));

    this.service
      .getCharacteristic(this.platform.Characteristic.Active)
      .on('get', this.handleActiveGet.bind(this))
      .on('set', this.handleActiveSet.bind(this));

    // Retrieve initial values and updateHomekit
    // this.refreshStatus();
    this.updateHomeKitCharacteristics();

    // Start an update interval
    interval(this.platform.config.options!.ttl! * 1000)
      .pipe(skipWhile(() => this.humidifierUpdateInProgress))
      .subscribe(() => {
        this.refreshStatus();
      });

    // Watch for Humidifier change events
    // We put in a debounce of 100ms so we don't make duplicate calls
    this.doHumidifierUpdate
      .pipe(
        tap(() => {
          this.humidifierUpdateInProgress = true;
        }),
        debounceTime(100),
      )
      .subscribe(async () => {
        try {
          await this.pushChanges();
        } catch (e) {
          this.platform.log.error(JSON.stringify(e.message));
          this.platform.log.debug('Humidifier %s -', this.accessory.displayName, JSON.stringify(e));
        }
        this.humidifierUpdateInProgress = false;
      });
  }

  /**
   * Parse the device status from the honeywell api
   */
  parseStatus() {
    /*this.TemperatureDisplayUnits = this.device.units === 'Fahrenheit' ? this.platform.Characteristic.TemperatureDisplayUnits.FAHRENHEIT :
      this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS;
    this.TemperatureDisplayUnits = this.device.units === 'Fahrenheit' ? this.platform.Characteristic.TemperatureDisplayUnits.FAHRENHEIT :
      this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS;*/
  }

  /**
   * Asks the SwitchBot API for the latest device information
   */
  async refreshStatus() {
    try {
      // this.platform.log.error('Humidifier - Reading', `${DeviceURL}/thermostats/${this.device.deviceID}`);
      this.device = (
        await this.platform.axios.get(`${DeviceURL}/thermostats/${this.device.deviceId}`, {
          params: {

          },
        })
      ).data;
      this.platform.log.debug('Humidifier %s Heat -', this.accessory.displayName,
        `Fetched update for ${this.device.deviceName} from SwitchBot API: ${JSON.stringify(this.device)}`,
      );
      this.platform.log.debug('Humidifier %s refreshStatus -', this.accessory.displayName, JSON.stringify(this.device));

      this.parseStatus();
      this.updateHomeKitCharacteristics();
    } catch (e) {
      this.platform.log.error(
        `Humidifier - Failed to update status of ${this.device.deviceName}`,
        JSON.stringify(e.message),
        this.platform.log.debug('Humidifier %s -', this.accessory.displayName, JSON.stringify(e)),
      );
    }
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   */
  async pushChanges() {
    const payload = {
      command: this.switchbotCommand,
      parameter: this.switchbotParameter,
      commandType: this.switchbotCommandType,
    } as any;

    this.platform.log.info(
      'Sending request to SwitchBot API. mode:',
      `${payload.command}, command:`,
      `${payload.parameter}, parameter:`,
      `${payload.commandType}, commandType:`,
    );
    this.platform.log.error('Humidifier %s pushChanges -', this.accessory.displayName, JSON.stringify(payload));

    // Make the API request
    await this.platform.axios.post(`${DeviceURL}/${this.device.deviceId}/commands`, payload, {
      params: {

      },
    });
    // Refresh the status from the API
    await this.refreshStatus();
  }

  /**
   * Updates the status for each of the HomeKit Characteristics
   */
  updateHomeKitCharacteristics() {
    this.service.updateCharacteristic(
      this.platform.Characteristic.CurrentRelativeHumidity,
      this.CurrentRelativeHumidity,
    );
    this.service.updateCharacteristic(
      this.platform.Characteristic.CurrentHumidifierDehumidifierState,
      this.CurrentHumidifierDehumidifierState,
    );
    this.service.updateCharacteristic(
      this.platform.Characteristic.TargetHumidifierDehumidifierState,
      this.TargetHumidifierDehumidifierState,
    );
    this.service.updateCharacteristic(
      this.platform.Characteristic.Active,
      this.Active,
    );
  }

  /**
   * Handle requests to get the current value of the "Current Relative Humidity" characteristic
   */
  handleCurrentRelativeHumidityGet(callback) {
    this.platform.log.debug('Triggered GET CurrentRelativeHumidity');

    // set this to a valid value for CurrentRelativeHumidity
    const currentValue = 1;

    callback(null, currentValue);
  }


  /**
   * Handle requests to get the current value of the "Current Humidifier Dehumidifier State" characteristic
   */
  handleCurrentHumidifierDehumidifierStateGet(callback) {
    this.platform.log.debug('Triggered GET CurrentHumidifierDehumidifierState');

    // set this to a valid value for CurrentHumidifierDehumidifierState
    const currentValue = 1;

    callback(null, currentValue);
  }


  /**
   * Handle requests to get the current value of the "Target Humidifier Dehumidifier State" characteristic
   */
  handleTargetHumidifierDehumidifierStateGet(callback) {
    this.platform.log.debug('Triggered GET TargetHumidifierDehumidifierState');

    // set this to a valid value for TargetHumidifierDehumidifierState
    const currentValue = 1;

    callback(null, currentValue);
  }

  /**
   * Handle requests to set the "Target Humidifier Dehumidifier State" characteristic
   */
  handleTargetHumidifierDehumidifierStateSet(value, callback) {
    this.platform.log.debug('Triggered SET TargetHumidifierDehumidifierState:', value);

    callback(null);
  }

  /**
   * Handle requests to get the current value of the "Active" characteristic
   */
  handleActiveGet(callback) {
    this.platform.log.debug('Triggered GET Active');

    // set this to a valid value for Active
    const currentValue = 1;

    callback(null, currentValue);
  }

  /**
   * Handle requests to set the "Active" characteristic
   */
  handleActiveSet(value, callback) {
    this.platform.log.debug('Triggered SET Active:', value);

    callback(null);
  }

}
