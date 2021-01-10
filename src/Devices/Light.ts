import { BaseDevice } from './BaseDevice';
import { PlatformAccessory } from 'homebridge';
import { SwitchBotPlatform } from '../platform';
import { irdevices as deviceTypeIR } from '../configTypes';

export class Light extends BaseDevice {
	constructor(
		protected readonly platform: SwitchBotPlatform,
		protected accessory: PlatformAccessory,
		public device: deviceTypeIR
	) {
		super(platform, accessory, device, platform.Service.Lightbulb);
		this.service = this.accessory.getService(this.platform.Service.TelevisionSpeaker) || this.accessory.addService(this.platform.Service.TelevisionSpeaker);

		this.service.setCharacteristic(
			this.platform.Characteristic.Name,
			`${this.device.deviceName} ${this.device.remoteType}`,
		);

		this.service.getCharacteristic(this.platform.Characteristic.On)
			.on('get', this.handleOnGet.bind(this))
			.on('set', this.handleOnSet.bind(this));
	}
}