import { BaseDevice } from './BaseDevice';
import { PlatformAccessory, Service } from 'homebridge';
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

		this.service.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
			.on('set', this.handleTargetHeatingCoolingStateSet.bind(this));

		this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
			.setProps({
				minValue: 0,
				maxValue: 100,
				minStep: 0.01
			});

		this.service.getCharacteristic(this.platform.Characteristic.TargetTemperature)
			.setProps({
				minValue: 16,
				maxValue: 30,
				minStep: 1
			})
			.on('set', this.handleTargetTemperatureSet.bind(this));
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

	getTemperatureValue(temp) {
		if (this.currentTempUnit === this.platform.Characteristic.TemperatureDisplayUnits.FAHRENHEIT) {
			return Math.round((temp - 32) * 5 / 9);
		} else {
			return Math.round(temp);
		}
	}

	getCommandValuesForPush() {
		return `${this.getTemperatureValue(this.currentTemperature)},${this.currentMode},1,${this.currentState === this.platform.Characteristic.TargetHeatingCoolingState.OFF ? 'off' : 'on'}`;
	}
}