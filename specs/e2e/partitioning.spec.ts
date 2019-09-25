import { ConnectionManager, Consumer, Producer } from '../../src';

const connection = ConnectionManager.nodes({
	nodes: [
		{
			port: 6379,
			host: '127.0.0.1',
		},
		{
			port: 6479,
			host: '127.0.0.1',
			staticRoutes: [
				'myRoute',
			],
		},
	],
});

const producer = new Producer(connection);
const consumer = new Consumer(connection, { group: 'worldConcat', route: 'myRoute' });

consumer.process({
	stream: 'concatPartitioning',
	processor: async (job) => {

		console.log(`[Partitioning] Received job: ${job.id}`);

		const {
			inbound,
		} = await job.get('inbound', false).del('inbound').pull();

		console.log(`[Partitioning] Received inbound: ${inbound}`);

		await job.set('outbound', `${inbound} world!`).push();

		console.log('Job consumed');

	},
});

const execute = async () => {

	await producer.listen();

	console.log(`[Partitioning] Producer is listening for messages (producer id is ${producer.id})`);

	const job = producer.job();

	console.log(`[Partitioning] Created job: ${job.id}`);

	await job.set('inbound', 'Hello').push();

	await producer.send({
		stream: 'concatPartitioning',
		route: 'myRoute',
		waitFor: [
			'worldConcat',
		],
		job,
	});

	console.log(`[Partitioning] Sent job: ${job.id}`);

	await job.finished();

	console.log(`[Partitioning] Finished job: ${job.id}`);

	const {
		outbound,
	} = await job.get('outbound', false).del('outbound').pull();

	console.log(`[Partitioning] Outbound is: ${outbound}`);

};

console.log(`[Partitioning] Consumer id is: ${consumer.id}`);

consumer.play().then(() => {
	console.log(`[Partitioning] Consumer is waiting for jobs (consumer id is ${consumer.id})`);
	const array = new Array(10).fill(0);
	return Promise.all(array.map(() => {
		return execute();
	}));
}).then(() => {
	return consumer.pause();
}).then(() => {
	return connection.stop();
}).catch((error) => console.error(error));
