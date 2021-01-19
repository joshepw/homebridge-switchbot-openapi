import { BaseDevice } from './BaseDevice';
import { PlatformAccessory } from 'homebridge';
import { SwitchBotPlatform } from '../platform';
import { irdevices as deviceTypeIR } from '../configTypes';

export class Fan extends BaseDevice {
	private currentRotateState: number;

	constructor(
		protected readonly platform: SwitchBotPlatform,
		protected accessory: PlatformAccessory,
		public device: deviceTypeIR,
	) {
		super(platform, accessory, device, platform.Service.Fanv2);

		this.powerState = false;
		this.currentRotateState = this.platform.Characteristic.SwingMode.SWING_DISABLED;

		this.service.getCharacteristic(this.platform.Characteristic.Active)
			.on('get', this.handleOnGet.bind(this))
			.on('set', this.handleOnSet.bind(this));

		this.service.getCharacteristic(this.platform.Characteristic.SwingMode)
			.on('get', this.handleSwingModeGet.bind(this))
			.on('set', this.handleSwingModeSet.bind(this));
	}

	handleSwingModeGet(callback) {
		this.platform.log.debug('Triggered GET Active');

		callback(null, this.currentRotateState);
	}

	async handleSwingModeSet(value, callback) {
		this.platform.log.debug('Triggered SET Active:' + value);

		try {
			await this.pushChanges('swing');
		} catch (error) {
			this.platform.log.error(error);
		}

		callback(null);
	}
}