const EventEmitter = require('eventemitter3');

class HFXBus extends EventEmitter {

	constructor (redis, options = {}) {
		super();
		this._redis = redis;
		this._options = options;
		this._getClient = null;

		this.clients = {};
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

	close () {

	}

}

module.exports = HFXBus;