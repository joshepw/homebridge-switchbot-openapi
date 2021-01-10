import { BaseDevice } from './BaseDevice';
import { PlatformAccessory } from 'homebridge';
import { SwitchBotPlatform } from '../platform';
import { irdevices as deviceTypeIR } from '../configTypes';

export class AirConditioner extends BaseDevice {
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
		protected readonly platform: SwitchBotPlatform,
		protected accessory: PlatformAccessory,
		public device: deviceTypeIR,
	) {
		super(platform, accessory, device, platform.Service.Thermostat);

		this.currentMode = AirConditioner.MODE_AUTO;
		this.currentState = this.platform.Characteristic.TargetHeatingCoolingState.AUTO;

		this.currentTemperature = 26;
		this.currentTempUnit = this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS;

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

	handleCurrentHeatingCoolingStateGet(callback) {
		this.platform.log.debug('Triggered GET CurrentHeatingCoolingState');

		callback(null, this.currentMode);
	}

	handleTargetHeatingCoolingStateGet(callback) {
		this.platform.log.info('Get TargetHeatingCoolingState');

		callback(null, this.platform.Characteristic.TargetHeatingCoolingState.AUTO);
	}

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

	handleCurrentTemperatureGet(callback) {
		this.platform.log.debug(`Get CurrentTemperature ${this.getTemperatureValue(this.currentTemperature)}˚C`);

		callback(null,this.getTemperatureValue(this.currentTemperature));
	}

	handleTargetTemperatureGet(callback) {
		this.platform.log.debug(`Get Temperature: ${this.getTemperatureValue(this.currentTemperature)}˚C`);

		callback(null, this.getTemperatureValue(this.currentTemperature));
	}

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

	handleTemperatureDisplayUnitsGet(callback) {
		callback(null, this.currentTempUnit);
	}

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
		return `${this.getTemperatureValue(this.currentTemperature)},${this.currentMode},1,${this.currentMode === this.platform.Characteristic.TargetHeatingCoolingState.OFF ? 'off' : 'on'}`;
	}
}