import { Service, PlatformAccessory } from 'homebridge';
import { SwitchBotPlatform } from '../platform';
import { DeviceURL } from '../settings';
import { irdevices as deviceTypeIR, SwitchBotPlatformConfig } from '../configTypes';

export class Speaker {
	private service: Service;
	private serviceSwitch: Service;
	private isBusy: boolean = false;

	muted: boolean = false;

	constructor(
		private readonly platform: SwitchBotPlatform,
		private accessory: PlatformAccessory,
		public device: deviceTypeIR,
	) {
		this.service = this.accessory.getService(this.platform.Service.TelevisionSpeaker) || this.accessory.addService(this.platform.Service.TelevisionSpeaker);
		this.serviceSwitch = this.accessory.getService(this.platform.Service.StatelessProgrammableSwitch) || this.accessory.addService(this.platform.Service.StatelessProgrammableSwitch);

		this.service.setCharacteristic(
			this.platform.Characteristic.Name,
			`${this.device.deviceName} ${this.device.remoteType}`,
		);

		// create handlers for required characteristics
		this.service.getCharacteristic(this.platform.Characteristic.Mute)
			.on('get', this.handleMuteGet.bind(this))
			.on('set', this.handleMuteSet.bind(this));

		this.service.getCharacteristic(this.platform.Characteristic.VolumeSelector)
			.on('set', this.handleSetVolume.bind(this));
	}

	async handleSetVolume(value, callback) {
		this.platform.log.debug('Triggered SET Volume:' + value);

		try {
			if (this.platform.Characteristic.VolumeSelector.INCREMENT === value) {
				await this.pushChanges('volumeAdd');
			}

			if (this.platform.Characteristic.VolumeSelector.DECREMENT === value) {
				await this.pushChanges('volumeSub');
			}
		} catch (error) {
			this.platform.log.error(error);
		}

		callback(null);
	}

	/**
	 * Handle requests to get the current value of the "Mute" characteristic
	 */
	handleMuteGet(callback) {
		this.platform.log.debug('Triggered GET Mute');

		callback(null, this.muted ? 1 : 0);
	}

	/**
	 * Handle requests to set the "Mute" characteristic
	 */
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