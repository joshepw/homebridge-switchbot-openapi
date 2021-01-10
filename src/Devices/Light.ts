import { Service, PlatformAccessory } from 'homebridge';
import { SwitchBotPlatform } from '../platform';
import { DeviceURL } from '../settings';
import { irdevices as deviceTypeIR, SwitchBotPlatformConfig } from '../configTypes';

export class Light {
	private service: Service;
	private isBusy: boolean = false;

	constructor(
		private readonly platform: SwitchBotPlatform,
		private accessory: PlatformAccessory,
		public device: deviceTypeIR,
	) {
		this.service = this.accessory.getService(this.platform.Service.TelevisionSpeaker) || this.accessory.addService(this.platform.Service.TelevisionSpeaker);

		this.service.setCharacteristic(
			this.platform.Characteristic.Name,
			`${this.device.deviceName} ${this.device.remoteType}`,
		);

		// create handlers for required characteristics
		this.service.getCharacteristic(this.platform.Characteristic.On)
			.on('get', this.handleOnGet.bind(this))
			.on('set', this.handleOnSet.bind(this));
	}

	/**
	 * Handle requests to get the current value of the "On" characteristic
	 */
	handleOnGet(callback) {
		this.platform.log.debug('Triggered GET On');

		// set this to a valid value for On
		const currentValue = 1;

		callback(null, currentValue);
	}

	/**
	 * Handle requests to set the "On" characteristic
	 */
	async handleOnSet(value, callback) {
		this.platform.log.debug('Triggered SET On:' + value);

		try {
			await this.pushChanges('turnOn');
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