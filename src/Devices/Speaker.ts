import { BaseDevice } from './BaseDevice';
import { PlatformAccessory } from 'homebridge';
import { SwitchBotPlatform } from '../platform';
import { irdevices as deviceTypeIR } from '../configTypes';

export class Speaker extends BaseDevice {
	muted: boolean = false;

	constructor(
		protected readonly platform: SwitchBotPlatform,
		protected accessory: PlatformAccessory,
		public device: deviceTypeIR,
	) {
		super(platform, accessory, device, platform.Service.Speaker);

		this.service.getCharacteristic(this.platform.Characteristic.Mute)
			.on('get', this.handleMuteGet.bind(this))
			.on('set', this.handleMuteSet.bind(this));
	}

	handleMuteGet(callback) {
		this.platform.log.debug('Triggered GET Mute');

		callback(null, this.muted ? 1 : 0);
	}

	async handleMuteSet(value, callback) {
		this.platform.log.debug('Triggered SET Mute:' + value);

		try {
			await this.pushChanges('setMute');
			this.muted = !this.muted;
		} catch (error) {
			this.platform.log.error(error);
		}

		callback(null);
	}
}