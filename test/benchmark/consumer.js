const HFXBus = require('../../index.js');

const consumerBus = new HFXBus({}, {
	maxParallel: 100,
	blockTimeout: 60000
});
consumerBus.setClientFactory(HFXBus.factories.ioredis);
consumerBus.on('error', (error) => console.log(error));

const execute = async () => {
	await consumerBus.onAwait(
		'healthz:ping:pending',
		async (message) => {
			await message.resolve();
		}
	).consume('healthz', ['ping']);
};

execute();