const { expect } = require('chai');
const HFXBus = require('../../index.js');

describe('Claimer', function () {
	this.timeout(15000);

	var bus = null;
	var consumerBus = null;
	var deadBus = null;
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
		if (deadBus)
			await deadBus.stop(false);
		if (committerBus)
			await committerBus.stop(false);
	});

	it('claim a message', async function () {

		consumerBus = new HFXBus();
		consumerBus.setClientFactory(HFXBus.factories.ioredis);
		consumerBus.on('error', (error) => console.log(error));
		deadBus = new HFXBus();
		deadBus.setClientFactory(HFXBus.factories.ioredis);
		deadBus.on('error', (error) => console.log(error));
		committerBus = new HFXBus();
		committerBus.setClientFactory(HFXBus.factories.ioredis);

		consumerBus.onAwait(
			'healthz:ping:pending',
			async (message) => {
				await message.resolve();
			}
		);

		await deadBus.onAwait(
			'healthz:ping:pending',
			async (message) => {
				await HFXBus.Claimer.attachTo(consumerBus, {
					verifyInterval: 1500,
					pendingTimeout: 1000
				}).consume('healthz', ['ping']);
			}
		).consume('healthz', ['ping']);

		let message = committerBus.message({
			groupName: 'healthz',
			streamName: 'ping'
		});
		message = await committerBus.commit(message);
		expect(message.isResolved).to.be.equal(true);


	});

	it('delete a message (maximum retries)', async function () {

		consumerBus = new HFXBus();
		consumerBus.setClientFactory(HFXBus.factories.ioredis);
		consumerBus.on('error', (error) => console.log(error));
		deadBus = new HFXBus();
		deadBus.setClientFactory(HFXBus.factories.ioredis);
		deadBus.on('error', (error) => console.log(error));
		committerBus = new HFXBus();
		committerBus.setClientFactory(HFXBus.factories.ioredis);

		consumerBus.onAwait(
			'healthz:ping:pending',
			async (message) => {
			}
		);
		await HFXBus.Claimer.attachTo(consumerBus, {
			verifyInterval: 1500,
			pendingTimeout: 1000
		}).consume('healthz', ['ping']);
	
		deadBus.onAwait(
			'healthz:ping:pending',
			async (message) => {
			}
		);

		await HFXBus.Claimer.attachTo(deadBus, {
			verifyInterval: 1500,
			pendingTimeout: 1000
		}).consume('healthz', ['ping']);

		let message = committerBus.message({
			groupName: 'healthz',
			streamName: 'ping'
		});

		try {
			await committerBus.commit(message);
			throw new Error();
		} catch (error) {
			message = error.data.message;
			expect(message.isDead).to.be.equal(true);
			expect(message.isResolved).to.be.equal(null);
			expect(error).to.be.instanceOf(HFXBus.errors.DeadMessageError);
		}

	});

});