import { ConnectionManager, Consumer, DISTRIBUTED_ROUTING, Producer } from '../../src';

const connection = ConnectionManager.nodes({
	nodes: [
		{
			port: 6379,
			host: '127.0.0.1',
		},
		{
			port: 6479,
			host: '127.0.0.1',
		},
	],
});

const producer = new Producer(connection);
const consumer = new Consumer(connection, { group: 'worldConcat', route: DISTRIBUTED_ROUTING, concurrency: 2 });

consumer.process({
	stream: 'concatDistributing',
	processor: async (job) => {

		console.log(`[Distributing] Received job: ${job.id}`);

		const {
			inbound,
		} = await job.get('inbound', false).del('inbound').pull();

		console.log(`[Distributing] Received inbound: ${inbound}`);

		await job.set('outbound', `${inbound} world!`).push();

		console.log('Job consumed');

	},
});

const execute = async (count: number) => {

	await producer.listen();

	console.log(`[Distributing] Producer is listening for messages (producer id is ${producer.id})`);

	const job = producer.job();

	console.log(`[Distributing] Created job: ${job.id}`);

	await job.set('inbound', 'Hello').push();

	await producer.send({
		stream: 'concatDistributing',
		route: DISTRIBUTED_ROUTING,
		waitFor: [
			'worldConcat',
		],
		job,
	});

	console.log(`[Distributing] Sent job: ${job.id}`);

	await job.finished();

	console.log(`[Distributing] Finished job: ${job.id}`);

	const {
		outbound,
	} = await job.get('outbound', false).del('outbound').pull();

	console.log(`[Distributing] Outbound is (${count}): ${outbound}`);

};

console.log(`[Distributing] Consumer id is: ${consumer.id}`);

consumer.play().then(() => {
	console.log(`[Distributing] Consumer is waiting for jobs (consumer id is ${consumer.id})`);
	const array = new Array(10).fill(0);
	let count = 0;
	return Promise.all(array.map(() => {
		return execute(count++);
	}));
}).then(() => {
	console.log('[Distributing] Paused');
	return consumer.pause();
}).then(() => {
	return connection.stop();
}).catch((error) => console.error(error));
