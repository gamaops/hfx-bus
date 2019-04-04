const EventEmitter = require('eventemitter3');
const uuidv4 = require('uuid/v4');
const uuidv1 = require('uuid/v1');

class HFXBus extends EventEmitter {

	constructor (redis, options = {}) {
		super();
		this._redis = redis;
		this._options = {
			namespace:'hfxbus',
			maxParallel: 10,
			blockTimeout: 1000,
			...options
		};
		this._getClient = null;
		this._id = uuidv4();

		this.clients = {};
		this._pendingCount = {};
		this._groupsStreams = {};
	}

	get id () {
		return this._id;
	}

	prefix (string) {
		return this._options.namespace+':'+string;
	}

	setClientFactory (factory, options = {}) {
		this._getClient = () => factory(options);
		return this;
	}

	getClient (name) {
		if (!(name in this.clients))
			this.clients[name] = this._getClient();
		return this.clients[name];
	}

	isClientReady (name) {
		const client = this.getClient(name);
		return client.status === 'ready';
	}

	bindProcessorClientEvents(name, groupName) {
		const client = this.getClient(name);
		if (client._hfxType)
			return client;
		client._hfxType = 'processor';
		client.on('close', () => {
			if (groupName in this._pendingCount)
				delete this._pendingCount[groupName];
		});
		return client;
	}

	_wrapAsyncListener (event, asyncListener) {
		return async (...args) => {
			try {
				await asyncListener(...args)
			} catch (error) {
				this.emit('async.error', {
					event,
					asyncListener,
					error,
					args
				});
			}
		};
	}
	
	onAwait (event, asyncListener) {
		this.on(event, this._wrapAsyncListener(event, asyncListener));
		return this;
	}

	onceAwait (event, asyncListener) {
		this.once(event, this._wrapAsyncListener(event, asyncListener));
		return this;
	}

	async commit (message) {

	}

	async forward(message) {

		message.messageId = uuidv1();

		return message;

	}

	async _publishMessageEvent () {

	}

	message (message = {}) {
		if (!('trackerId' in message))
			message.trackerId = uuidv4();
		return this._decorateMessage(message);
	}

	_decorateMessage (message) {
		const {
			trackerId
		} = message;
		message.load = async (key = 'payload', {decodeJson = false, drop = false} = {}) => {
			const client = this.getClient('hfxbus');
			message[key] = await client.getBuffer(
				this.prefix(`msg:${trackerId}:${key}`)
			);
			if (decodeJson) {
				if (message[key].length === 0)
					message[key] = null;
				else
					message[key] = JSON.parse(message[key].toString('utf8'));
			}
			if (drop)
				await message.drop(key);
			return message[key];
		};
		message.save = async (key = 'payload', {encodeJson = false} = {}) => {
			let value = message[key];
			if (encodeJson)
				value = JSON.stringify(value);
			message[key] = await client.set(
				this.prefix(`msg:${trackerId}:${key}`),
				value
			);
		};
		message.drop = async (...keys = ['payload']) => {
			const client = this.getClient('hfxbus');
			await client.del(...keys.map((key) => this.prefix(`msg:${trackerId}:${key}`)));
		};
		return message;
	}

	async _hookConsumeMessage({ streamId, data, groupName, streamName}) {
		const messageId = data.mid;
		const trackerId = data.tid;
		const replyTo = data.rpt ? data.rpt.split('/') : null;
		const message = {
			messageId,
			trackerId,
			streamId,
			replyTo,
			groupName,
			streamName,
			isAcknowledged:false,
			_release: () => {
				message.isAcknowledged = true;
				this._pendingCount[groupName]--;
				this._consume(groupName);
			},
			ack: async (unsafe = false) => {
				const client = this.getClient('hfxbus');
				if (unsafe)
					message._release();
				await client.xack(
					streamName,
					this.prefix(groupName),
					streamId
				);
				if (!unsafe)
					message._release();
			}
		};
		this._decorateMessage(message);
		message.resolve = async () => {

		};
		message.reject = async () => {

		};
		return message;
	}

	_scheduleConsume(groupName) {
		process.nextTick(() => {
			if (this._pendingCount[groupName])
				this._consume(groupName);
		});
		return this;
	}

	_consume(groupName) {

		if (!(groupName in this._pendingCount))
			return undefined;

		const processorName = groupName + ':processor';

		if (
			this._pendingCount[groupName] === this._options.maxParallel
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
			this._options.maxParallel - this._pendingCount[groupName],
			'block',
			this._options.blockTimeout,
			'streams',
			...streamsNames,
			...streamsNames.map(() => '>')
		);

		if (messages) {
			for (const streamName of Object.keys(messages)) {
				this._pendingCount[groupName] += messages[streamName].length;
				for (const { id, data } of messages[streamName]) {
					this._hookConsumeMessage({
						streamId:id,
						data,
						groupName,
						streamName
					});
				}
			}
			return undefined;
		}

		this._scheduleRun(groupName);

	}

	async consume (groupName, streamsNames, {
		fromId = '$'
	} = {}) {
		const processorClient = this.getClient(groupName+':processor');
		this.bindProcessorClientEvents(processorClient);
		for (const streamName of streamsNames) {
			try {
				await processorClient.xgroup(
					'create',
					streamName,
					this.prefix(groupName),
					fromId,
					'mkstream'
				);
			} catch (error) {
				if (error.message.includes('BUSYGROUP'))
					continue;
				throw error;
			}
		}
		this._pendingCount[groupName] = 0;
		this._groupsStreams[groupName] = streamsNames;
		this._consume(groupName);
	}

	close () {

	}

}

module.exports = HFXBus;