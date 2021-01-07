import { Service, PlatformAccessory } from 'homebridge';
import { SwitchBotPlatform } from '../platform';
import { DeviceURL } from '../settings';
import { irdevices as deviceTypeIR, SwitchBotPlatformConfig } from '../configTypes';

export class AirConditioner {
	private service: Service;
	private isBusy: boolean;

	static readonly MODE_AUTO = 1;
	static readonly MODE_COOL = 2;
	static readonly MODE_DRY = 3;
	static readonly MODE_FAN = 4;
	static readonly MODE_HEAT = 5;
	
	currentTempUnit: number;
	currentTemperature: number;
	currentMode: number;
	currentState: number;

	constructor(
		private readonly platform: SwitchBotPlatform,
		private accessory: PlatformAccessory,
		public device: deviceTypeIR,
	) {
		this.isBusy = false;
		this.currentMode = AirConditioner.MODE_AUTO;
		this.currentState = this.platform.Characteristic.TargetHeatingCoolingState.AUTO;

		this.currentTemperature = 26;
		this.currentTempUnit = this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS;

		this.service = this.service = this.accessory.getService(this.platform.Service.Thermostat) || this.accessory.addService(this.platform.Service.Thermostat);

		this.service.setCharacteristic(
			this.platform.Characteristic.Name,
			`${this.device.deviceName} ${this.device.remoteType}`,
		);

		this.service.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState)
			.on('get', this.handleCurrentHeatingCoolingStateGet.bind(this));

		this.service.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
			.on('get', this.handleTargetHeatingCoolingStateGet.bind(this))
			.on('set', this.handleTargetHeatingCoolingStateSet.bind(this));

		this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
			.on('get', this.handleCurrentTemperatureGet.bind(this));

		this.service.getCharacteristic(this.platform.Characteristic.TargetTemperature)
			.on('get', this.handleTargetTemperatureGet.bind(this))
			.on('set', this.handleTargetTemperatureSet.bind(this));

		this.service.getCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits)
			.on('get', this.handleTemperatureDisplayUnitsGet.bind(this))
			.on('set', this.handleTemperatureDisplayUnitsSet.bind(this));
	}

	/**
   * Handle requests to get the current value of the "Current Heating Cooling State" characteristic
   */
	handleCurrentHeatingCoolingStateGet(callback) {
		this.platform.log.debug('Triggered GET CurrentHeatingCoolingState');

		callback(null, this.currentMode);
	}


	/**
	 * Handle requests to get the current value of the "Target Heating Cooling State" characteristic
	 */
	handleTargetHeatingCoolingStateGet(callback) {
		this.platform.log.info('Get TargetHeatingCoolingState');

		callback(null, this.platform.Characteristic.TargetHeatingCoolingState.AUTO);
	}

	/**
	 * Handle requests to set the "Target Heating Cooling State" characteristic
	 */
	async handleTargetHeatingCoolingStateSet(value, callback) {
		this.platform.log.info('Change TargetHeatingCoolingState to:' + value);

		try {
			if(value === this.platform.Characteristic.TargetHeatingCoolingState.OFF) {
				await this.pushChanges('turnOff');
				this.currentMode = AirConditioner.MODE_AUTO;
				this.currentState = value;
			} else {
				switch (value) {				
					case this.platform.Characteristic.TargetHeatingCoolingState.AUTO:
						this.currentMode = AirConditioner.MODE_AUTO;
						break;
		
					case this.platform.Characteristic.TargetHeatingCoolingState.COOL:
						this.currentMode = AirConditioner.MODE_COOL;
						break;
		
					case this.platform.Characteristic.TargetHeatingCoolingState.HEAT:
						this.currentMode = AirConditioner.MODE_HEAT;
						break;
				
					default:
						this.currentMode = AirConditioner.MODE_AUTO;
						break;
				}
				
				await this.pushChanges('setAll', this.getCommandValuesForPush());
				this.currentState = value;
			}
		} catch (error) {
			this.platform.log.error(error);
		}

		callback(null);
	}

	/**
	 * Handle requests to get the current value of the "Current Temperature" characteristic
	 */
	handleCurrentTemperatureGet(callback) {
		this.platform.log.debug(`Get CurrentTemperature ${this.getTemperatureValue(this.currentTemperature)}˚C`);

		callback(null,this.getTemperatureValue(this.currentTemperature));
	}


	/**
	 * Handle requests to get the current value of the "Target Temperature" characteristic
	 */
	handleTargetTemperatureGet(callback) {
		this.platform.log.debug(`Get Temperature: ${this.getTemperatureValue(this.currentTemperature)}˚C`);

		callback(null, this.getTemperatureValue(this.currentTemperature));
	}

	/**
	 * Handle requests to set the "Target Temperature" characteristic
	 */
	async handleTargetTemperatureSet(value, callback) {
		this.platform.log.debug(`Setting Temperature: ${this.getTemperatureValue(value)}˚C`);

		const oldValue = this.currentTemperature;

		try {
			this.currentTemperature = this.getTemperatureValue(value);
			await this.pushChanges('command', this.getCommandValuesForPush());
		} catch (error) {
			this.currentTemperature = oldValue;
			this.platform.log.error('Error on change details');
		}

		callback(null);
	}

	/**
	 * Handle requests to get the current value of the "Temperature Display Units" characteristic
	 */
	handleTemperatureDisplayUnitsGet(callback) {
		callback(null, this.currentTempUnit);
	}

	/**
	 * Handle requests to set the "Temperature Display Units" characteristic
	 */
	handleTemperatureDisplayUnitsSet(value, callback) {
		this.platform.log.debug('Triggered SET TemperatureDisplayUnits:' + value);

		callback(null);
	}

	getTemperatureValue(temp) {
		if (this.currentTempUnit === this.platform.Characteristic.TemperatureDisplayUnits.FAHRENHEIT) {
			return Math.round((temp - 32) * 5 / 9);
		} else {
			return Math.round(temp);
		}
	}

	getCommandValuesForPush() {
		return `${this.getTemperatureValue(this.currentTemperature)},${this.currentMode},1,on`;
	}

	async pushChanges(command: string, parameter: string = 'default') {
		if (this.isBusy) {
			throw new Error("The pushing service is busy");
		}

		this.isBusy = true;

		const payload = {
			commandType: 'command',
			command,
			parameter,
		} as any;

		this.platform.log.info(
			`Sending request to SwitchBot API.${this.device.deviceName} command:`,
			`${payload.command}, parameter:`,
			`${payload.parameter}, commandType:`,
			`${payload.commandType}`,
		);
		this.platform.log.debug('Fan %s pushChanges -', this.accessory.displayName, JSON.stringify(payload));

		// Make the API request
		const push = await this.platform.axios.post(`${DeviceURL}/${this.device.deviceId}/commands`, payload);
		this.platform.log.debug('Fan %s Changes pushed -', this.accessory.displayName, push.data);

		this.isBusy = false;
	}
}