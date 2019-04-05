
const errors = require('./errors.js');

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_PENDING_COUNT = 500;
const DEFAULT_PENDING_TIMEOUT = 15000;

class Claimer {
	constructor(hfxbus, {
		groupName,
		streamsNames,
	}, options = {}) {
		this._hfxbus = hfxbus;
		this._groupName = groupName;
		this._streamsNames = streamsNames;
		this._options = options;
		this._verifyScheduled = false;
		this._verifyRunning = false;
		this._startId = {};
		this._interval = null;
		for (const streamName of streamsNames) this._startId[streamName] = '-';
	}

	async _verify() {
		if (this._verifyRunning) return undefined;
		this._verifyRunning = true;
		const client = this._hfxbus.getClient('claimer');
		for (const streamName of this._streamsNames) {
			let pendingMessages = await client.xpending(
				streamName,
				this._groupName,
				this._startId[streamName],
				'+',
				this._options.pendingCount,
			);
			pendingMessages = pendingMessages.filter(
				pendingMessage => pendingMessage.elapsedMilliseconds > this._options.pendingTimeout,
			);
			if (pendingMessages.length === 0) {
				this._startId[streamName] = '-';
				continue;
			}
			this._startId[streamName] = pendingMessages[
				pendingMessages.length - 1
			].id;
			for (const pendingMessage of pendingMessages) {
				if (pendingMessage.deliveryCount >= this._options.maxRetries) {
					await client.xdel(
						streamName,
						pendingMessage.id,
					);
					this._hfxbus.emit('claimer:drop', {
						groupName: this._groupName,
						streamName,
						message: pendingMessage,
					});
					continue;
				}
				const [claimedMessage] = await client.xclaim(
					streamName,
					this._groupName,
					this._hfxbus.id,
					this._options.pendingTimeout,
					pendingMessage.id,
					'RETRYCOUNT',
					pendingMessage.deliveryCount + 1,
				);
				if (claimedMessage) {
					this._hfxbus.hookConsumeMessage({
						streamId: pendingMessage.id,
						data: pendingMessage.data,
						groupName: this._groupName,
						streamName,
					});
				}
			}
		}
	}

	_scheduleVerify() {
		if (this._verifyScheduled) return this;
		this._verifyScheduled = true;
		process.nextTick(() => {
			this._verifyScheduled = false;
			this._verify().catch(
				(error) => {
					this._hfxbus.emit(
						'error',
						new errors.ClaimerVerifyError(
							error.message,
							{
								groupName: this._groupName,
							},
						),
					);
				},
			).finally(
				() => {
					this._verifyRunning = false;
				},
			);
		});
		return this;
	}

	start() {
		if (this._interval === null) {
			this._interval = setInterval(() => {
				this._scheduleVerify();
			}, this._options.verifyInterval);
		}
		return this;
	}

	stop() {
		if (this._interval !== null) {
			clearInterval(this._interval);
			this._interval = null;
		}
		return this;
	}

	static attachTo(hfxbus, options = {}) {
		if ('_claimerListener' in hfxbus) hfxbus.removeListener('consuming:started', hfxbus._claimerListener);
		hfxbus._claimerListener = (parameters) => {
			if (!('claimers' in hfxbus)) {
				hfxbus.claimers = {};
				hfxbus.on('stop', () => {
					for (const groupName in hfxbus.claimers) hfxbus.claimers[groupName].stop();
				});
			}
			if (parameters.groupName in hfxbus.claimers) hfxbus.claimers[parameters.groupName].stop();
			hfxbus.claimers[parameters.groupName] = new Claimer(
				hfxbus,
				parameters,
				{
					verifyInterval: DEFAULT_PENDING_TIMEOUT,
					maxRetries: DEFAULT_MAX_RETRIES,
					pendingCount: DEFAULT_PENDING_COUNT,
					pendingTimeout: DEFAULT_PENDING_TIMEOUT,
					...options,
				},
			);
			hfxbus.claimers[parameters.groupName].start();
		};
		hfxbus.on('consuming:started', hfxbus._claimerListener);
		return hfxbus;
	}
}

module.exports = Claimer;
