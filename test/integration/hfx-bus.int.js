const { expect } = require('chai');
const HFXBus = require('../../index.js');

describe('HFXBus', function () {
	this.timeout(15000);

	var bus = null;
	var consumerBus = null;
	var committerBus = null;

	beforeEach(async function () {
		cleaner = new HFXBus();
		cleaner.setClientFactory(HFXBus.factories.ioredis);
		const client = cleaner.getClient();
		await client.flushdb();
		await cleaner.stop(true);
	});

	afterEach(async function () {
		if (bus)
			await bus.stop(true);
		if (consumerBus)
			await consumerBus.stop(false);
		if (committerBus)
			await committerBus.stop(false);
	});

	it('create an ioredis client', async function () {

		bus = new HFXBus();
		bus.setClientFactory(HFXBus.factories.ioredis);
		const client = bus.getClient();
		await client.set('testKey', 'testValue');
		const testKey = await client.get('testKey');
		expect(testKey).to.be.equal('testValue');
		await client.del('testKey');

	});

	it('consume message (resolve)', async function () {

		consumerBus = new HFXBus();
		consumerBus.setClientFactory(HFXBus.factories.ioredis);
		consumerBus.on('error', (error) => console.log(error));
		committerBus = new HFXBus();
		committerBus.setClientFactory(HFXBus.factories.ioredis);

		await consumerBus.onAwait(
			'healthz:ping:pending',
			async (message) => {
				await message.resolve();
			}
		).consume('healthz', ['ping']);

		let message = committerBus.message({
			groupName:'healthz',
			streamName:'ping'
		});
		message = await committerBus.commit(message);
		expect(message.isResolved).to.be.equal(true);


	});

	it('consume message (reject)', async function () {

		consumerBus = new HFXBus();
		consumerBus.setClientFactory(HFXBus.factories.ioredis);
		consumerBus.on('error', (error) => console.log(error));
		committerBus = new HFXBus();
		committerBus.setClientFactory(HFXBus.factories.ioredis);

		await consumerBus.onAwait(
			'healthz:ping:pending',
			async (message) => {
				await message.reject();
			}
		).consume('healthz', ['ping']);

		let message = committerBus.message({
			groupName:'healthz',
			streamName:'ping'
		});
		message = await committerBus.commit(message);
		expect(message.isResolved).to.be.equal(false);


	});

	it('consume message and send payload', async function () {

		consumerBus = new HFXBus();
		consumerBus.setClientFactory(HFXBus.factories.ioredis);
		consumerBus.on('error', (error) => console.log(error));
		committerBus = new HFXBus();
		committerBus.setClientFactory(HFXBus.factories.ioredis);

		await consumerBus.onAwait(
			'healthz:ping:pending',
			async (message) => {
				message.payload = {timestamp:Date.now()};
				await message.save('payload', { encodeJson: true });
				await message.resolve();
			}
		).consume('healthz', ['ping']);

		let message = committerBus.message({
			groupName:'healthz',
			streamName:'ping'
		});
		message = await committerBus.commit(message);
		await message.load('payload', { decodeJson: true, drop: true });
		expect(message.payload).to.be.an('object');
		expect(message.payload.timestamp).to.be.a('number');


	});

	it('consume message and send payload (buffer)', async function () {

		consumerBus = new HFXBus();
		consumerBus.setClientFactory(HFXBus.factories.ioredis);
		consumerBus.on('error', (error) => console.log(error));
		committerBus = new HFXBus();
		committerBus.setClientFactory(HFXBus.factories.ioredis);

		await consumerBus.onAwait(
			'healthz:ping:pending',
			async (message) => {
				message.payload = Buffer.from('pong');
				await message.save('payload');
				await message.resolve();
			}
		).consume('healthz', ['ping']);

		let message = committerBus.message({
			groupName: 'healthz',
			streamName: 'ping'
		});
		message = await committerBus.commit(message);
		await message.load('payload', { drop: true });
		expect(message.payload).to.be.instanceOf(Buffer);
		expect(message.payload.toString('utf8')).to.be.equal('pong');


	});

	it('send payload to consume', async function () {

		consumerBus = new HFXBus();
		consumerBus.setClientFactory(HFXBus.factories.ioredis);
		consumerBus.on('error', (error) => console.log(error));
		committerBus = new HFXBus();
		committerBus.setClientFactory(HFXBus.factories.ioredis);

		await consumerBus.onAwait(
			'healthz:ping:pending',
			async (message) => {
				await message.load('payload', { decodeJson: true });
				message.payload.receiveTimestamp = message.payload.sendTimestamp;
				await message.save('payload', { encodeJson: true });
				await message.resolve();
			}
		).consume('healthz', ['ping']);

		let message = committerBus.message({
			groupName: 'healthz',
			streamName: 'ping',
			payload: { sendTimestamp: Date.now() }
		});
		await message.save('payload', { encodeJson: true });
		message = await committerBus.commit(message);
		await message.load('payload', { decodeJson: true, drop: true });
		expect(message.payload).to.be.an('object');
		expect(message.payload.sendTimestamp).to.be.a('number');
		expect(message.payload.receiveTimestamp).to.be.equal(message.payload.sendTimestamp);

	});

	it('send payload to consume (buffer)', async function () {

		consumerBus = new HFXBus();
		consumerBus.setClientFactory(HFXBus.factories.ioredis);
		consumerBus.on('error', (error) => console.log(error));
		committerBus = new HFXBus();
		committerBus.setClientFactory(HFXBus.factories.ioredis);

		await consumerBus.onAwait(
			'healthz:ping:pending',
			async (message) => {
				await message.load('payload');
				message.payload = Buffer.from(message.payload.toString('utf8')+'pong');
				await message.save('payload');
				await message.resolve();
			}
		).consume('healthz', ['ping']);

		let message = committerBus.message({
			groupName: 'healthz',
			streamName: 'ping',
			payload: Buffer.from('ping')
		});
		await message.save('payload');
		message = await committerBus.commit(message);
		await message.load('payload', { drop: true });
		expect(message.payload).to.be.instanceOf(Buffer);
		expect(message.payload.toString('utf8')).to.be.equal('pingpong');

	});

});