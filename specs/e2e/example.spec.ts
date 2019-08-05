import { ConnectionManager, Producer, Consumer } from '../../src';

const connection = ConnectionManager.standalone({
	port: 6379,
	host: '127.0.0.1'
});

const producer = new Producer(connection);
const consumer = new Consumer(connection, { group: 'worldConcat' });

consumer.process({
	stream: 'concat',
	processor: async (job) => {

		console.log(`Received job: ${job.id}`);

		const {
			inbound
		} = await job.get('inbound', false).del('inbound').pull();

		console.log(`Received inbound: ${inbound}`);

		await job.set('outbound', `${inbound} world!`).push();

		console.log('Job consumed');

	}
});

const execute = async () => {

	await producer.listen();

	console.log(`Producer is listening for messages (producer id is ${producer.id})`);

	const job = producer.job();

	console.log(`Created job: ${job.id}`);

	await job.set('inbound', 'Hello').push();

	await producer.send({
		stream: 'concat',
		waitFor: true,
		job
	});

	console.log(`Sent job: ${job.id}`);

	await job.finished();

	console.log(`Finished job: ${job.id}`);

	const {
		outbound
	} = await job.get('outbound', false).del('outbound').pull();

	console.log(`Outbound is: ${outbound}`);

}

consumer.play().then(() => {
	console.log(`Consumer is waiting for jobs (consumer id is ${consumer.id})`);
	return execute();
}).then(() => {
	return consumer.pause();
}).then(() => {
	return connection.stop();
}).catch((error) => console.error(error));