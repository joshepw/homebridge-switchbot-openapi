import { Service, PlatformAccessory } from 'homebridge';
import { SwitchBotPlatform } from '../platform';
import { DeviceURL } from '../settings';
import { irdevices as deviceTypeIR, device as deviceType } from '../configTypes';

export class BaseDevice {
	protected service: Service;
	protected isBusy: boolean = false;
	protected powerState: boolean = false;

	constructor(
		protected readonly platform: SwitchBotPlatform,
		protected accessory: PlatformAccessory,
		public device: deviceTypeIR | deviceType,
		serviceType: any
	) {
		this.service = this.accessory.getService(serviceType) || this.accessory.addService(serviceType);

		this.service.setCharacteristic(
			this.platform.Characteristic.Name,
			this.device.deviceName,
		);
	}

	handleOnGet(callback) {
		this.platform.log.debug(`Handle get status 'On' from ${this.device.deviceName}`);

		callback(null, this.powerState);
	}

	async handleOnSet(value, callback) {
		this.platform.log.debug(`Handle set status 'On' from ${this.device.deviceName} with value: ${value}`);

		try {
			await this.pushChanges(value ? 'turnOn' : 'turnOff');
			this.powerState = value;
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

		const push = await this.platform.axios.post(`${DeviceURL}/${this.device.deviceId}/commands`, payload);
		this.platform.log.debug('Fan %s Changes pushed -', this.accessory.displayName, push.data);

		this.isBusy = false;
	}
}