const { expect } = require('chai');
const HFXBus = require('../../lib/hfx-bus.js');
const EventEmitter = require('eventemitter3');
const awaitEvent = require('./await-event.js');

const fakeClientClass = class extends EventEmitter {
	constructor () {
		super();
		this.status = 'connecting';
	}
	async psubscribe () {}
	async punsubscribe () {}
	async xgroup () {}
	async xadd () {}
	async xack () {}
	async publish () {}
	async getBuffer () {}
	async set () {}
	async del () {}
	disconnect () {}
	async quit () {}
};

const fakeClientFactory = () => {
	return new fakeClientClass;
};

describe('HFXBus', function () {

	it('HFXBus to be a class', function () {

		expect(HFXBus).to.be.an('function');

	});

	it('not parametrize capped streams', function () {

		const bus = new HFXBus({}, {
			trimLength:0
		});
		expect(bus._cappedStreamOptions).to.be.lengthOf(0);

	});

	it('generate an id', function () {

		const bus = new HFXBus();
		expect(bus.id).to.be.a('string');

	});

	it('generate a listener id', function () {

		const bus = new HFXBus();
		expect(bus.listenerId).to.be.a('string');

	});

	it('prefix a string with namespace', function () {

		var bus = new HFXBus();
		expect(bus.prefix('hello')).to.be.equal('hfxbus:hello');

		bus = new HFXBus({}, {
			namespace:'customns'
		});
		expect(bus.prefix('hello')).to.be.equal('customns:hello');

	});

	it('set a listener emitter', function () {

		const bus = new HFXBus();
		const listenerEmitter = () => {}
		expect(bus.setListenerEmitter(listenerEmitter)).to.be.equal(bus);
		expect(bus._listenerEmitter).to.be.equal(listenerEmitter);

	});

	it('set a client factory', function () {

		const bus = new HFXBus();
		expect(bus.setClientFactory(fakeClientFactory)).to.be.equal(bus);
		expect(bus._getClient).to.be.a('function');

	});

	it('get default client', function () {

		const bus = new HFXBus();
		bus.setClientFactory(fakeClientFactory);
		const client = bus.getClient();
		expect(client).to.be.instanceOf(fakeClientClass);
		expect(bus.clients).to.have.property('hfxbus');
		expect(bus.getClient()).to.be.equal(client);
		expect(client.listenerCount('close')).to.be.equal(1);
		client.emit('close');
		expect(bus.clients).to.not.have.property('hfxbus');

	});

	it('get custom client', function () {

		const bus = new HFXBus();
		bus.setClientFactory(fakeClientFactory);
		const client = bus.getClient('custom');
		expect(client).to.be.instanceOf(fakeClientClass);
		expect(bus.clients).to.have.property('custom');
		expect(bus.getClient('custom')).to.be.equal(client);
		expect(client.listenerCount('close')).to.be.equal(1);
		client.emit('close');
		expect(bus.clients).to.not.have.property('custom');
		
	});

	it('check if client is ready', function () {

		const bus = new HFXBus();
		bus.setClientFactory(fakeClientFactory);
		const client = bus.getClient();
		expect(bus.isClientReady('hfxbus')).to.be.equal(false);
		client.status = 'ready';
		expect(bus.isClientReady('hfxbus')).to.be.equal(true);

	});

	it('bind processor client events', function () {

		var bus = new HFXBus();
		bus.setClientFactory(fakeClientFactory);
		var client = bus.getClient('custom');
		expect(bus.bindProcessorClientEvents('custom', 'group')).to.be.equal(client);
		bus._groupsStreams.group = [];
		bus._consumingCount.group = 0;
		expect(client._hfxType).to.be.equal('processor');
		expect(client._hfxGroupName).to.be.equal('group');
		expect(client.listenerCount('close')).to.be.equal(2);
		expect(bus.bindProcessorClientEvents('custom', 'group')).to.be.equal(client);
		expect(client.listenerCount('close')).to.be.equal(2);
		client.emit('close');
		expect(bus._groupsStreams).to.not.have.property('group');
		expect(bus._consumingCount).to.not.have.property('group');
		bus = new HFXBus();
		bus.setClientFactory(fakeClientFactory);
		client = bus.getClient('custom');
		expect(bus.bindProcessorClientEvents('custom', 'group')).to.be.equal(client);
		bus._groupsStreams = {};
		bus._consumingCount = {};
		client.emit('close');
		expect(bus._groupsStreams).to.not.have.property('group');
		expect(bus._consumingCount).to.not.have.property('group');

	});

	it('bind listener client events', function (done) {

		let testCount = 0;
		const test = () => {
			testCount++;
			if (testCount === 4)
				done();
		};

		const bus = new HFXBus();
		bus.setClientFactory(fakeClientFactory);
		const client = bus.getClient('custom');
		expect(bus.bindListenerClientEvents('custom')).to.be.equal(client);
		expect(client._hfxType).to.be.equal('listener');
		expect(client.listenerCount('close')).to.be.equal(2);
		expect(client.listenerCount('pmessage')).to.be.equal(1);
		expect(bus.bindListenerClientEvents('custom')).to.be.equal(client);
		expect(client.listenerCount('close')).to.be.equal(2);
		expect(client.listenerCount('pmessage')).to.be.equal(1);
		bus._decorateMessage = (message) => {
			message.decorated = true;
		};
		bus.once('tid:consumed', (message) => {
			try {
				expect(message).to.be.an('object');
				expect(message.trackerId).to.be.equal('tid');
				expect(message.decorated).to.be.equal(true);
				test();
			} catch (error) {
				done(error);
			}
		});
		bus.setListenerEmitter((message) => {
			message.listenerEmitter = true;
		});
		client.emit('pmessage', null, 'channel:consumed', JSON.stringify({
			mid:'mid',
			tid:'tid',
			stn:'stn',
			gpn: 'gpn'
		}));
		bus.once('tid:consumed', (message) => {
			try {
				expect(message).to.be.an('object');
				expect(message.trackerId).to.be.equal('tid');
				expect(message.decorated).to.be.equal(true);
				expect(message.isResolved).to.be.equal(true);
				expect(message.listenerEmitter).to.be.equal(true);
				test();
			} catch (error) {
				done(error);
			}
		});
		client.emit('pmessage', null, 'channel:consumed', JSON.stringify({
			mid: 'mid',
			tid: 'tid',
			stn: 'stn',
			gpn: 'gpn',
			sts: HFXBus.STATUS_RESOLVED
		}));
		bus.setListenerEmitter(null);
		bus.once('tid:consumed', (message) => {
			try {
				expect(message).to.be.an('object');
				expect(message.trackerId).to.be.equal('tid');
				expect(message.decorated).to.be.equal(true);
				expect(message.isResolved).to.be.equal(true);
				expect(message.listenerEmitter).to.not.be.equal(true);
				test();
			} catch (error) {
				done(error);
			}
		});
		client.emit('pmessage', null, 'channel:consumed', JSON.stringify({
			mid: 'mid',
			tid: 'tid',
			stn: 'stn',
			gpn: 'gpn',
			sts: HFXBus.STATUS_RESOLVED
		}));
		bus.once('error', (error) => {
			try {
				expect(error).to.be.instanceOf(HFXBus.errors.MessageListenerError);
				test();
			} catch (error) {
				done(error);
			}
		});
		client.emit('close');
		client.emit('pmessage', null, 'channel:consumed', '{1123:""');

	});

	it('wrap async listeners', function (done) {

		const bus = new HFXBus();
		var asyncListener = bus._wrapAsyncListener(async () => {});
		expect(asyncListener).to.be.a('function');
		asyncListener().then(() => {
			asyncListener = bus._wrapAsyncListener(async () => { throw new Error(); });
			try {
				bus.once('async:error', (data) => {
					try {
						expect(data).to.be.an('object');
						done();
					} catch (error) {
						done(error);
					}
				});
				asyncListener();
			} catch (error) {
				done(error);
			}
		}).catch(done);

	});

	it('await on event', function (done) {

		const bus = new HFXBus();
		bus.onAwait('event', async () => {
			done();
		});
		bus.emit('event');

	});

	it('await once event', function (done) {

		const bus = new HFXBus();
		bus.onceAwait('event', async () => {
			done();
		});
		bus.emit('event');

	});

	it('listen for messages', function (done) {

		const bus = new HFXBus();
		bus.setClientFactory(fakeClientFactory);
		Promise.all([
			bus.listen({
				groupName:'gpn',
				streamName:'stn',
			}),
			bus.listen({
				groupName:'gpn',
				streamName:'stn',
				listenerId:'lid',
				eventName:'consumed'
			}),
			bus.listen({
				groupName:'gpn',
				streamName:'stn',
				listenerId:'lid',
				eventName:'consumed'
			}),
			bus.listen({
				groupName:'gpn',
				streamName:'stn',
				listenerId:'lid',
				eventName:null
			}),
			bus.listen({
				listenerId:'lid',
				eventName:'consumed'
			}),
			bus.listen({
				groupName:'gpn',
				listenerId:'lid',
				eventName:'consumed'
			}),
			bus.listen({
				streamName:'stn',
				listenerId:'lid',
				eventName:'consumed'
			})
		]).then(() => done()).catch(done);

	});

	it('commit a message', async function () {

		const trackerId = 'tid';

		var bus = new HFXBus();
		bus.setClientFactory(fakeClientFactory);
		bus.getClient().xadd = async () => {
			bus.emit('tid:consumed', {})
		};
		await bus.commit({
			trackerId,
			messageId:'mid',
			trackerId:'tid',
			streamName:'stn',
			replyTo:['rpt'],
		});
		await bus.commit({
			trackerId,
			messageId:'mid',
			trackerId:'tid',
			streamName:'stn',
		});
		bus = new HFXBus({}, {
			commitTimeout:1000
		});
		bus.setClientFactory(fakeClientFactory);
		bus.getClient().xadd = async () => {
			bus.emit('tid:consumed', {})
		};
		await bus.commit({
			trackerId,
			messageId:'mid',
			trackerId:'tid',
			streamName:'stn',
			replyTo:['rpt'],
		});
		bus = new HFXBus();
		bus.setClientFactory(fakeClientFactory);
		bus.getClient().xadd = async () => {
			bus.emit('tid:consumed', {})
		};
		await bus.commit({
			trackerId,
			messageId:'mid',
			trackerId:'tid',
			streamName:'stn',
			replyTo:['rpt'],
		}, 1000);
		bus = new HFXBus();
		bus.setClientFactory(fakeClientFactory);
		bus.getClient().xadd = async () => {
			bus.emit('tid:consumed', {})
		};
		await bus.commit({
			trackerId,
			messageId:'mid',
			trackerId:'tid',
			streamName:'stn',
			replyTo:[bus.listenerId],
		});
		await bus.commit({
			trackerId,
			messageId:'mid',
			trackerId:'tid',
			streamName:'stn',
			replyTo:[bus.listenerId],
		});
		bus = new HFXBus();
		bus.setClientFactory(fakeClientFactory);
		try {
			await bus.commit({
				trackerId,
				messageId: 'mid',
				trackerId: 'tid',
				streamName: 'stn',
				replyTo: [bus.listenerId],
			}, 100);
		} catch (error) {
			expect(error).to.be.instanceOf(HFXBus.errors.MessageTimeoutError);
		}
		bus = new HFXBus();
		bus.setClientFactory(fakeClientFactory);
		bus.getClient().xadd = async () => {
			setTimeout(() => {
				bus.emit('tid:consumed', {})
			}, 100);
		};
		try {
			await bus.commit({
				trackerId,
				messageId: 'mid',
				trackerId: 'tid',
				streamName: 'stn',
				replyTo: [bus.listenerId],
			}, 50);
		} catch (error) {
			expect(error).to.be.instanceOf(HFXBus.errors.MessageTimeoutError);
		}

	});

	it('forward a message', async function () {

		const trackerId = 'tid';

		var bus = new HFXBus();
		bus.setClientFactory(fakeClientFactory);
		bus.getClient().xadd = async () => {
			bus.emit('tid:consumed', {})
		};
		await bus.forward({
			trackerId,
			messageId: 'mid',
			trackerId: 'tid',
			streamName: 'stn'
		});
		await bus.forward({
			trackerId,
			messageId: 'mid',
			trackerId: 'tid',
			streamName: 'stn',
			replyTo:['rpt']
		});

	});

	it('publish message event', async function () {

		const trackerId = 'tid';

		var bus = new HFXBus();
		bus.setClientFactory(fakeClientFactory);
		await bus._publishMessageEvent({
			trackerId,
			messageId: 'mid',
			trackerId: 'tid',
			streamName: 'stn'
		}, 'consumed', {data:'test'});
		await bus._publishMessageEvent({
			trackerId,
			messageId: 'mid',
			trackerId: 'tid',
			streamName: 'stn',
			replyTo:['test']
		}, 'consumed');

	});

	it('create a message', function () {

		const trackerId = 'tid';

		var bus = new HFXBus();
		bus.setClientFactory(fakeClientFactory);
		expect(bus.message({
			trackerId,
			messageId: 'mid',
			trackerId: 'tid',
			streamName: 'stn'
		})).to.be.an('object');
		expect(bus.message({
			messageId: 'mid',
			trackerId: 'tid',
			streamName: 'stn'
		})).to.be.an('object');
		expect(bus.message()).to.be.an('object');

	});

	it('decorate a message', async function () {

		const trackerId = 'tid';

		var bus = new HFXBus();
		bus.setClientFactory(fakeClientFactory);
		const message = bus._decorateMessage({
			trackerId,
			messageId: 'mid',
			trackerId: 'tid',
			streamName: 'stn'
		});
		const client = bus.getClient();

		await message.load();
		client.getBuffer = async () => Buffer.from(JSON.stringify({data:'data'}));
		await message.load('payload', {
			decodeJson:true,
			drop:true
		});
		client.getBuffer = async () => Buffer.from('');
		await message.load('payload', {
			decodeJson:true,
			drop:true
		});
		await message.save();
		message.payload = {data:'data'};
		await message.save('payload', {encodeJson:true});
		await message.drop();

	});

	it('hook a message to consume', async function () {

		var bus = new HFXBus();
		bus.setClientFactory(fakeClientFactory);
		let [message] = await awaitEvent.async(
			'gpn:stn:pending',
			bus,
			async () => bus.hookConsumeMessage({
				groupName: 'gpn',
				streamName: 'stn',
				streamId: 'sid',
				data:{
					tid: 'tid',
					mid: 'mid',
					tid: 'tid',
					rpt: 'rpt'
				}
			})
		);

		await message.resolve(true);
		try {
			await message.resolve();
		} catch (error) {
			expect(error).to.be.instanceOf(Error);
		}

		[message] = await awaitEvent.async(
			'gpn:stn:pending',
			bus,
			async () => bus.hookConsumeMessage({
				groupName: 'gpn',
				streamName: 'stn',
				streamId: 'sid',
				data: {
					tid: 'tid',
					mid: 'mid',
					tid: 'tid',
					rpt: 'rpt'
				}
			})
		);
		
		await message.ack();
		bus._consumingCount['gpn'] = 2;
		await message.reject();
		try {
			await message.reject();
		} catch (error) {
			expect(error).to.be.instanceOf(Error);
		}

		[message] = await awaitEvent.async(
			'gpn:stn:pending',
			bus,
			async () => bus.hookConsumeMessage({
				groupName: 'gpn',
				streamName: 'stn',
				streamId: 'sid',
				data: {
					tid: 'tid',
					mid: 'mid',
					tid: 'tid',
					rpt: 'rpt'
				}
			})
		);
		
		await message.ack(true);
		try {
			await message.ack();
		} catch (error) {
			expect(error).to.be.instanceOf(Error);
		}

	});

	it('schedule consume', async function () {

		var bus = new HFXBus();
		bus._consume = async () => {};
		expect(bus._scheduleConsume('gpn')).to.be.equal(bus);

	});

	it('consume', async function () {

		var bus = new HFXBus();
		bus._scheduleConsume = () => {}
		bus.setClientFactory(fakeClientFactory);
		const client = bus.getClient('gpn:processor');
		client.status = 'ready';
		client.xreadgroup = async () => {
			return {
				stn:[
					{
						id:'sid',
						data:{
							tid: 'tid',
							mid: 'mid',
							tid: 'tid',
							rpt: 'rpt'
						}
					}
				]
			}
		};
		bus._groupsStreams['gpn'] = ['stn'];
		bus._consumingCount['gpn'] = 0;
		const [message] = await awaitEvent.async(
			'gpn:stn:pending',
			bus,
			async () => await bus._consume('gpn')
		);

		expect(message).to.be.an('object');
		bus._groupsStreams = {};
		expect(await bus._consume('gpn')).to.be.undefined;
		bus._groupsStreams['gpn'] = ['stn'];
		bus._consumingCount['gpn'] = 1000;
		expect(await bus._consume('gpn')).to.be.undefined;
		client.xreadgroup = async () => null;
		bus._groupsStreams['gpn'] = ['stn'];
		bus._consumingCount['gpn'] = 0;
		expect(await bus._consume('gpn')).to.be.undefined;

	});

	it('start consuming', async function () {

		var bus = new HFXBus();
		bus._scheduleConsume = () => { }
		bus.setClientFactory(fakeClientFactory);
		const client = bus.getClient('gpn:processor');
		client.status = 'ready';
		client.xreadgroup = async () => {
			return {
				stn: [
					{
						id: 'sid',
						data: {
							tid: 'tid',
							mid: 'mid',
							tid: 'tid',
							rpt: 'rpt'
						}
					}
				]
			}
		};
		await awaitEvent.async(
			'consuming:started',
			bus,
			async () => await bus.consume('gpn', ['stn'])
		);

	});

	it('check if processor client is done', function () {

		var bus = new HFXBus();
		bus._consumingCount['gpn'] = 0;
		expect(bus._isProcessorClientDone({
			_hfxGroupName:'gpn'
		})).to.be.equal(true);
		bus._consumingCount['gpn'] = 1;
		expect(bus._isProcessorClientDone({
			_hfxGroupName:'gpn'
		})).to.be.equal(false);

	});

	it('stop all clients', async function () {

		var bus = new HFXBus();
		bus.setClientFactory(fakeClientFactory);
		await bus.stop(true);
		bus.getClient();
		await bus.stop(true);
		bus.getClient();
		let listener = bus.getClient('listener');
		listener._hfxType = 'listener';
		let processor = bus.getClient('processor');
		processor._hfxType = 'processor';
		processor._hfxGroupName = 'gpn';
		await bus.stop(false);
		bus.getClient('test');
		processor = bus.getClient('processor');
		processor._hfxType = 'processor';
		processor._hfxGroupName = 'gpn';
		await bus.stop();

	});

});