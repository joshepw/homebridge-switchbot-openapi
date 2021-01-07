import { Service, PlatformAccessory } from 'homebridge';
import { SwitchBotPlatform } from '../platform';
import { interval, Subject } from 'rxjs';
import { debounceTime, skipWhile, tap } from 'rxjs/operators';
import { DeviceURL } from '../settings';
import { irdevices as deviceTypeIR, deviceStatusResponse, SwitchBotPlatformConfig } from '../configTypes';

export class Fan {
	private service: Service;

	private powerState: boolean;
	private currentRotateState: number;
	private isBusy: boolean;

	constructor(
		private readonly platform: SwitchBotPlatform,
		private accessory: PlatformAccessory,
		public device: deviceTypeIR,
		public readonly config: SwitchBotPlatformConfig
	) {
		this.powerState = false;
		this.isBusy = false;
		this.currentRotateState = 0;

		this.service = this.accessory.getService(this.platform.Service.Fanv2) || this.accessory.addService(this.platform.Service.Fanv2);

		this.service.setCharacteristic(
			this.platform.Characteristic.Name,
			`${this.device.deviceName} ${this.device.remoteType}`,
		);

		this.service.getCharacteristic(this.platform.Characteristic.Active)
			.on('get', this.handleActiveGet.bind(this))
			.on('set', this.handleActiveSet.bind(this));

		this.service.getCharacteristic(this.platform.Characteristic.SwingMode)
			.on('get', this.handleSwingModeGet.bind(this))
			.on('set', this.handleSwingModeSet.bind(this));
	}

	/**
   * Handle requests to get the current value of the "Active" characteristic
   */
	handleSwingModeGet(callback) {
		this.platform.log.debug('Triggered GET Active');

		callback(null, this.platform.Characteristic.SwingMode.SWING_ENABLED);
	}

	/**
	 * Handle requests to set the "Active" characteristic
	 */
	async handleSwingModeSet(value, callback) {
		this.platform.log.debug('Triggered SET Active:' + value);

		try {
			await this.pushChanges('turnOn');
		} catch (error) {
			this.platform.log.error(error);
		}

		callback(null);
	}

	/**
   * Handle requests to get the current value of the "Active" characteristic
   */
	handleActiveGet(callback) {
		this.platform.log.debug('Triggered GET Active');

		callback(null, this.powerState ? this.platform.Characteristic.Active.ACTIVE : this.platform.Characteristic.Active.INACTIVE;
	}

	/**
	 * Handle requests to set the "Active" characteristic
	 */
	async handleActiveSet(value, callback) {
		this.platform.log.debug('Triggered SET Active:' + value);

		try {
			if (value === this.platform.Characteristic.Active.ACTIVE) {
				await this.pushChanges('turnOn');
			} else {
				await this.pushChanges('turnOff');
			}
		} catch (error) {
			this.platform.log.error(error);
		}

		callback(null);
	}

	async pushChanges(command: string, parameter: string = 'default') {
		if (this.isBusy) {
			return;
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