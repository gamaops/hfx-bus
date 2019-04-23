const Benchmark = require('benchmark');
const suite = new Benchmark.Suite;

const HFXBus = require('../../index.js');

const execute = async () => {
	const committerBus = new HFXBus();
	committerBus.setClientFactory(HFXBus.factories.ioredis);
	committerBus.on('error', (error) => console.log(error));

	suite
		.add('commit message', {
			defer: true,
			minSamples: 200,
			fn: async (deferred) => {
				const message = committerBus.message({
					groupName: 'healthz',
					streamName: 'ping'
				});
				await committerBus.commit(message);
				deferred.resolve();
			}
		})
		.add('forward message', {
			defer: true,
			minSamples: 200,
			fn: async (deferred) => {
				const message = committerBus.message({
					groupName: 'healthz',
					streamName: 'ping'
				});
				await committerBus.forward(message);
				deferred.resolve();
			}
		})
		.on('cycle', (event) => {
			console.log(String(event.target));
		})
		.on('complete', async () => {
			await committerBus.stop(false);
		})
		.run({
			async: false
		});

};

execute();