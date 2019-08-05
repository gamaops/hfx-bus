import EventEmitter from 'eventemitter3';
import { Redis } from 'ioredis';
import nanoid from 'nanoid';
import { ConnectionManager } from './connection-manager';
import { HFXBUS_ID_SIZE, setErrorKind } from './helpers';
import { ISentJob, Job } from './job';

export class Producer extends EventEmitter {
	public readonly id: string;

	private connection: ConnectionManager;

	constructor(connection: ConnectionManager) {
		super();
		this.connection = connection;
		this.id = nanoid(HFXBUS_ID_SIZE);

		const client = this.connection.getClient('channels') as Redis;
		client.on('pmessage', (pattern, channel, message) => {
			try {
				message = JSON.parse(message);
				this.emit(`${message.job}:${message.str}`, message.err);
				this.emit(message.str, message.job, message.err);
			} catch (error) {
				error.pubsub = {message, channel};
				this.emit('error', setErrorKind(error, 'MESSAGE_PARSING'));
			}
		}).once('stopped', () => {
			client.punsubscribe().finally(() => {
				client.emit('release');
			});
		}).emit('use');
	}

	public async listen(...streams: Array<string>) {
		const client = this.connection.getClient('channels') as Redis;
		const patterns: Array<string> = streams.map((stream) => `${this.connection.getKeyPrefix()}:chn:${stream}:*`);
		if (streams.length === 0) {
			patterns.push(`${this.connection.getKeyPrefix()}:chn:*:${this.id}`);
		}
		await client.psubscribe(...patterns);
	}

	public job(id?: string): Job {
		return new Job(
			this.connection.getClient('jobs') as Redis,
			id,
		);
	}

	public async send({
		stream,
		job,
		capped,
	}: {
		stream: string,
		job: Job,
		capped?: number,
	}): Promise<ISentJob> {

		job.finished = async (timeout?: number): Promise<Job> => {
			return new Promise((resolve, reject) => {
				const event = `${job.id}:${stream}`;
				let timeoutId: any = null;
				if (timeout) {
					timeoutId = setTimeout(() => {
						this.removeAllListeners(event);
						reject(setErrorKind(
							new Error(`Timeouted while waiting to be finished: ${timeout}ms`),
							'FINISH_TIMEOUT',
						));
					}, timeout);
				}
				this.once(event, (error) => {
					if (timeoutId) {
						clearTimeout(timeoutId);
					}
					if (error) {
						reject(error);
					} else {
						resolve(job);
					}
				});
			});
		};

		const client = this.connection.getClient('streams') as Redis & { xadd: any };
		let cappedOptions: Array<any> = [];
		if (capped) {
			cappedOptions = [
				'MAXLEN',
				'~',
				capped,
			];
		}

		await client.xadd(
			`${this.connection.getKeyPrefix()}:str:${stream}`,
			...cappedOptions,
			'*',
			'prd',
			this.id,
			'job',
			job.id,
		);

		return job;

	}

}
