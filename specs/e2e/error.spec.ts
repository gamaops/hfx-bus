import { expect } from 'chai';
import { ConnectionManager, Consumer, Producer } from '../../src';

const connection = ConnectionManager.standalone({
	port: 6379,
	host: '127.0.0.1',
});

const producer = new Producer(connection);
const consumer = new Consumer(connection, { group: 'throw' });

consumer.process({
	stream: 'error',
	processor: async (job) => {

		console.log(`Received job: ${job.id}`);

		throw new Error('message');

	},
});

const execute = async () => {

	await producer.listen();

	console.log(`Producer is listening for messages (producer id is ${producer.id})`);

	const job = producer.job();

	console.log(`Created job: ${job.id}`);

	await job.set('inbound', 'Hello').push();

	let error: any = null;

	await producer.send({
		stream: 'error',
		rejectOnError: true,
		waitFor: [
			'throw',
		],
		job,
	});

	console.log(`Sent job: ${job.id}`);

	try {
		await job.finished();
	} catch (err) {
		error = err;
	}

	expect(error.throw.message).to.be.equal('message');

};

consumer.play().then(() => {
	console.log(`Consumer is waiting for jobs (consumer id is ${consumer.id})`);
	return execute();
}).then(() => {
	return consumer.pause();
}).then(() => {
	return connection.stop();
}).catch((error) => console.error(error));
