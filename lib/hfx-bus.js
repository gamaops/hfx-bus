const EventEmitter = require('eventemitter3');
const generateId = require('./generate-id.js');
const errors = require('./errors.js');

const STATUS_RESOLVED = 1;
const STATUS_REJECTED = -1;
const HFXBUS_ID_SIZE = 16;
const DEFAULT_TRIM_LENGTH = 1000;
const DEFAULT_BLOCK_TIMEOUT = 1000;
const DEFAULT_EXPIRATION_TIME = 10000;
const DEFAULT_MAX_PARALLEL = 10;

class HFXBus extends EventEmitter {
	constructor(redis, options = {}) {
		super();
		this._redis = redis;
		this._options = {
			namespace: 'hfxbus',
			maxParallel: DEFAULT_MAX_PARALLEL,
			blockTimeout: DEFAULT_BLOCK_TIMEOUT,
			trimLength: DEFAULT_TRIM_LENGTH,
			expirationTime: DEFAULT_EXPIRATION_TIME,
			commitTimeout: null,
			...options,
		};
		this._getClient = null;
		this._id = generateId.sync(HFXBUS_ID_SIZE);

		this._cappedStreamOptions = [];
		if (this._options.trimLength) {
			this._cappedStreamOptions = [
				'MAXLEN',
				'~',
				this._options.trimLength,
			];
		}

		this._saveKeyOptions = [];
		if (this._options.expirationTime) {
			this._saveKeyOptions = [
				'PX',
				this._options.expirationTime,
			];
		}

		this.clients = {};
		this._consumingCount = {};
		this._consumeRunning = {};
		this._groupsStreams = {};
		this._scheduledGroups = {};
		this._listeningChannels = new Set();
		this._listenerEmitter = null;
	}

	get id() {
		return this._id;
	}

	get listenerId() {
		return this.prefix(this._id);
	}

	prefix(string) {
		return `${this._options.namespace}:${string}`;
	}

	setListenerEmitter(listenerEmitter) {
		this._listenerEmitter = listenerEmitter;
		return this;
	}

	setClientFactory(factory, options = {}) {
		this._getClient = () => factory(options);
		return this;
	}

	getClient(name = 'hfxbus') {
		if (!(name in this.clients)) {
			this.clients[name] = this._getClient();
			this.clients[name].once('close', () => {
				delete this.clients[name];
			});
		}
		return this.clients[name];
	}

	isClientReady(name) {
		const client = this.getClient(name);
		return client.status === 'ready';
	}

	bindProcessorClientEvents(name, groupName) {
		const client = this.getClient(name);
		if (client._hfxType) return client;
		client._hfxType = 'processor';
		client._hfxGroupName = groupName;
		client.once('close', () => {
			if (groupName in this._groupsStreams) delete this._groupsStreams[groupName];
			if (groupName in this._consumingCount) delete this._consumingCount[groupName];
		});
		return client;
	}

	bindListenerClientEvents(name) {
		const client = this.getClient(name);
		if (client._hfxType) return client;
		client._hfxType = 'listener';
		client.once('close', () => {
			this._listeningChannels = new Set();
		});
		client.on('pmessage', (pattern, channel, event) => {
			try {
				event = JSON.parse(event);
				const eventName = channel.split(':').pop();
				const messageId = event.mid;
				const trackerId = event.tid;
				const streamName = event.stn;
				const groupName = event.gpn;
				const isDead = Boolean(event.ded);
				const message = {
					messageId,
					trackerId,
					streamName,
					groupName,
					isDead,
					isResolved: null,
				};
				if ('sts' in event) message.isResolved = event.sts === STATUS_RESOLVED;
				this._decorateMessage(message);
				if (this._listenerEmitter) this._listenerEmitter(message);
				this.emit(`${trackerId}:${eventName}`, message);
			} catch (error) {
				this.emit(
					'error',
					new errors.MessageListenerError(
						error.message,
						{
							channel,
							event,
						},
					),
				);
			}
		});
		return client;
	}

	_wrapAsyncListener(event, asyncListener) {
		return async (...args) => {
			try {
				await asyncListener(...args);
			} catch (error) {
				this.emit('async:error', {
					event,
					asyncListener,
					error,
					args,
				});
			}
		};
	}

	onAwait(event, asyncListener) {
		this.on(event, this._wrapAsyncListener(event, asyncListener));
		return this;
	}

	onceAwait(event, asyncListener) {
		this.once(event, this._wrapAsyncListener(event, asyncListener));
		return this;
	}

	async listen(...events) {
		const client = this.getClient('listener');
		this.bindListenerClientEvents('listener');
		await client.psubscribe(
			...events.map(({
				groupName,
				streamName,
				listenerId,
				eventName = 'consumed',
			}) => {
				let channel = ['*', '*', 'events', '*'];
				if (groupName) channel[0] = groupName;
				if (groupName) channel[1] = streamName;
				if (listenerId) {
					channel.shift();
					channel[0] = listenerId;
				}
				if (eventName) channel[channel.length - 1] = eventName;
				channel = channel.join(':');
				if (listenerId) return channel;
				return this.prefix(channel);
			}).filter((channel) => {
				if (this._listeningChannels.has(channel)) return false;
				this._listeningChannels.add(channel);
				return true;
			}),
		);
	}

	async commit(message, timeout = null) {
		const commitTimeout = timeout || this._options.commitTimeout;
		const {
			trackerId,
		} = message;
		const eventName = `${trackerId}:consumed`;
		let {
			replyTo = [],
		} = message;
		/* istanbul ignore next */
		if (!replyTo) replyTo = [];
		const listenerId = this.listenerId;
		if (!replyTo.includes(listenerId)) replyTo.push(listenerId);
		message.replyTo = replyTo;
		const channel = `${listenerId}:events:consumed`;
		if (!this._listeningChannels.has(channel)) {
			await this.listen({
				listenerId,
				eventName: 'consumed',
			});
		}
		return new Promise((resolve, reject) => {
			let timedOut = false;
			let timeoutTimer = null;
			if (commitTimeout) {
				timeoutTimer = setTimeout(() => {
					timedOut = true;
					this.removeAllListeners(eventName);
					reject(new errors.MessageTimeoutError(
						'Commit timeout',
						{
							message,
						},
					));
				}, commitTimeout);
			}
			this.once(eventName, (consumedMessage) => {
				/* istanbul ignore if  */
				if (timedOut) return undefined;
				if (timeoutTimer) clearTimeout(timeoutTimer);
				if (consumedMessage.isDead) {
					return reject(new errors.DeadMessageError(
						`This message is dead`,
						{
							message: consumedMessage
						}
					));
				}
				resolve(consumedMessage);
			});
			this.forward(message).catch(reject);
		});
	}

	async forward(message) {
		message.messageId = await generateId.async();
		const {
			messageId,
			trackerId,
			streamName,
			replyTo,
		} = message;
		const client = this.getClient();
		const data = [
			'mid', messageId,
			'tid', trackerId,
		];
		if (replyTo) {
			data.push(
				'rpt',
				replyTo.join('/'),
			);
		}
		await client.xadd(
			streamName,
			...this._cappedStreamOptions,
			'*',
			...data,
		);
		await this.publishMessageEvent(message, 'forwarded');
		return message;
	}

	async publishMessageEvent(message, event, source = {}) {
		const {
			messageId,
			trackerId,
			groupName,
			streamName,
		} = message;
		const client = this.getClient();
		const data = JSON.stringify({
			...source,
			gpn: groupName,
			stn: streamName,
			mid: messageId,
			tid: trackerId,
		});
		let channels = message.replyTo || [
			`${this.prefix(groupName)}:${streamName}`,
		];
		channels = channels.map(channel => `${channel}:events:${event}`);
		for (const channel of channels) await client.publish(channel, data);
	}

	message(message = {}) {
		if (!('trackerId' in message)) message.trackerId = generateId.sync();
		return this._decorateMessage(message);
	}

	_decorateMessage(message) {
		const {
			trackerId,
		} = message;
		message.load = async (key = 'payload', { decodeJson = false, drop = false } = {}) => {
			const client = this.getClient();
			message[key] = await client.getBuffer(
				this.prefix(`msg:${trackerId}:${key}`),
			);
			if (decodeJson) {
				if (message[key].length === 0) message[key] = null;
				else message[key] = JSON.parse(message[key].toString('utf8'));
			}
			if (drop) await message.drop(key);
			return message[key];
		};
		message.save = async (key = 'payload', { encodeJson = false, expirationTime = null } = {}) => {
			const client = this.getClient();
			let value = message[key];
			if (encodeJson) value = JSON.stringify(value);
			let saveKeyOptions = this._saveKeyOptions;
			if (expirationTime)
				saveKeyOptions = ['PX', expirationTime];
			message[key] = await client.set(
				this.prefix(`msg:${trackerId}:${key}`),
				value,
				...saveKeyOptions
			);
		};
		message.drop = async (...keys) => {
			if (keys.length === 0) keys.push('payload');
			const client = this.getClient();
			await client.del(...keys.map(key => this.prefix(`msg:${trackerId}:${key}`)));
		};
		message.purge = async ({ individually = false } = {}) => {
			const client = this.getClient();
			const keys = await client.keys(`msg:${trackerId}:*`);
			if (!keys || keys.length === 0)
				return undefined;
			if (!individually) {
				await client.del(...keys);
				return undefined;
			}
			for (const key of keys)
				await client.del(key);
		};
		return message;
	}

	hookConsumeMessage({
		streamId, data, groupName, streamName,
	}) {
		if (!(groupName in this._consumingCount)) this._consumingCount[groupName] = 0;
		this._consumingCount[groupName]++;
		const messageId = data.mid;
		const trackerId = data.tid;
		/* istanbul ignore next */
		const replyTo = data.rpt ? data.rpt.split('/') : null;
		const message = {
			messageId,
			trackerId,
			streamId,
			replyTo,
			groupName,
			streamName,
			isAcknowledged: false,
			isResolved: null,
			_release: () => {
				message.isAcknowledged = true;
			},
			ack: async (unsafe = false) => {
				if (message.isAcknowledged) throw new Error(`Message ${trackerId}:${messageId} is already acknowledged`);
				const client = this.getClient();
				if (unsafe) message._release();
				await client.xack(
					streamName,
					this.prefix(groupName),
					streamId,
				);
				if (!unsafe) message._release();
			},
		};
		this._decorateMessage(message);
		const consume = async (status, unsafe) => {
			if (message.isResolved !== null) {
				throw new Error(`Message ${trackerId}:${messageId} is already consumed`);
			}
			message.isResolved = status === STATUS_RESOLVED;
			if (!message.isAcknowledged) await message.ack(unsafe);
			await this.publishMessageEvent(
				message,
				'consumed',
				{
					sts: status,
				},
			);
			this._consumingCount[groupName]--;
			if (this._consumingCount[groupName] === 0) this.emit(`empty:${groupName}`);
			this._scheduleConsume(groupName);
		};
		message.resolve = async (unsafe = false) => {
			await consume(STATUS_RESOLVED, unsafe);
		};
		message.reject = async (unsafe = false) => {
			await consume(STATUS_REJECTED, unsafe);
		};
		this.emit(`${groupName}:${streamName}:pending`, message);
	}

	_scheduleConsume(groupName) {
		if (this._scheduleConsume[groupName]) return this;
		this._scheduleConsume[groupName] = true;
		/* istanbul ignore next */
		process.nextTick(() => {
			this._scheduleConsume[groupName] = false;
			if (this._consumeRunning[groupName]) return undefined;
			if (this._groupsStreams[groupName]) {
				this._consumeRunning[groupName] = true;
				this._consume(groupName).catch(
					error => this.emit(
						'error',
						new errors.ConsumerError(
							error.message,
							{ groupName },
						),
					),
				).finally(
					() => {
						this._consumeRunning[groupName] = false;
					},
				);
			}
		});
		return this;
	}

	async _consume(groupName) {
		if (!(groupName in this._groupsStreams)) return undefined;
		const processorName = `${groupName}:processor`;
		if (
			this._consumingCount[groupName] >= this._options.maxParallel
			|| !this.isClientReady(processorName)
		) {
			this._scheduleConsume(groupName);
			return undefined;
		}
		const client = this.getClient(processorName);
		const streamsNames = this._groupsStreams[groupName];
		const messages = await client.xreadgroup(
			'group',
			this.prefix(groupName),
			this._id,
			'count',
			this._options.maxParallel - this._consumingCount[groupName],
			'block',
			this._options.blockTimeout,
			'streams',
			...streamsNames,
			...streamsNames.map(() => '>'),
		);
		if (messages) {
			for (const streamName in messages) {
				for (const { id, data } of messages[streamName]) {
					this.hookConsumeMessage({
						streamId: id,
						data,
						groupName,
						streamName,
					});
				}
			}
			return undefined;
		}
		this._scheduleConsume(groupName);
	}

	async consume(groupName, streamsNames, {
		fromId = '$',
	} = {}) {
		const processorClient = this.getClient(`${groupName}:processor`);
		this.bindProcessorClientEvents(processorClient);
		for (const streamName of streamsNames) {
			try {
				await processorClient.xgroup(
					'create',
					streamName,
					this.prefix(groupName),
					fromId,
					'mkstream',
				);
			} catch (error) {
				/* istanbul ignore next */
				if (error.message.includes('BUSYGROUP')) continue;
				/* istanbul ignore next */
				throw error;
			}
		}
		this._groupsStreams[groupName] = streamsNames;
		this._consumingCount[groupName] = 0;
		this._scheduleConsume(groupName);
		this.emit('consuming:started', {
			groupName,
			streamsNames,
		});
	}

	_isProcessorClientDone(client) {
		return !(client._hfxGroupName in this._consumingCount)
			|| this._consumingCount[client._hfxGroupName] === 0;
	}

	async stop(force = false) {
		this.emit('stop', force);
		this._groupsStreams = {};
		const awaitPending = [];
		for (const name in this.clients) {
			const client = this.clients[name];
			if (force) {
				client.disconnect();
				continue;
			}
			switch (client._hfxType) {
			case 'listener':
				await client.punsubscribe(
					...(Array.from(this._listeningChannels)),
				);
				await client.quit();
				break;
			case 'processor':
				/* istanbul ignore else */
				if (this._isProcessorClientDone(client)) {
					await client.quit();
					break;
				}
				/* istanbul ignore next */
				awaitPending.push(new Promise((resolve, reject) => {
					if (this._isProcessorClientDone(client)) {
						client.quit().then(() => resolve()).catch(reject);
						return undefined;
					}
					this.once(`empty:${client._hfxGroupName}`, () => {
						client.quit().then(() => resolve()).catch(reject);
					});
				}));
				/* istanbul ignore next */
				break;
			default:
				if (name !== 'hfxbus') await client.quit();
				break;
			}
		}
		/* istanbul ignore next */
		if (awaitPending.length > 0) await Promise.all(awaitPending);
		if ('hfxbus' in this.clients) await this.clients.hfxbus.quit();
		this._listeningChannels = new Set();
		this._consumeRunning = {};
		this._scheduledGroups = {};
		this.clients = {};
		this.emit('stopped', force);
	}
}

HFXBus.STATUS_REJECTED = STATUS_REJECTED;
HFXBus.STATUS_RESOLVED = STATUS_RESOLVED;
HFXBus.errors = errors;

module.exports = HFXBus;
