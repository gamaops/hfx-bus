import EventEmitter from 'eventemitter3';
import { Redis } from 'ioredis';
import nanoid from 'nanoid';
import { ConnectionManager } from './connection-manager';
import { HFXBUS_ID_SIZE, setErrorKind } from './helpers';
import { ISentJob, Job } from './job';

export interface IJobCompletion {
	[key: string]: null | Date | any;
}

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
				this.emit(`${message.job}:${message.str}`, message.err, message.grp);
				this.emit(message.str, message.err || null, message.job, message.grp);
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
		waitFor,
		rejectOnError,
	}: {
		stream: string,
		job: Job,
		capped?: number,
		waitFor?: Array<string> | null,
		rejectOnError?: boolean,
	}): Promise<ISentJob> {

		const client = this.connection.getClient('streams') as Redis & { xadd: any };
		let cappedOptions: Array<any> = [];
		if (capped) {
			cappedOptions = [
				'MAXLEN',
				'~',
				capped,
			];
		}

		const xaddArgs = [
			`${this.connection.getKeyPrefix()}:str:${stream}`,
			...cappedOptions,
			'*',
			'prd',
			this.id,
			'job',
			job.id,
		];

		if (waitFor) {
			job.finished = async (timeout?: number): Promise<IJobCompletion> => {
				return new Promise((resolve, reject) => {
					const event =  `${job.id}:${stream}`;
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
					const stopListening = () => {
						this.removeAllListeners(event);
						if (timeoutId) {
							clearTimeout(timeoutId);
						}
					};
					const completions: IJobCompletion = {};
					waitFor.forEach((group) => completions[group] = null);
					let completionsCount: number = 0;
					this.on(event, (error, group) => {
						if (group in completions) {
							completionsCount++;
						}
						completions[group] = error || new Date();
						if (error && rejectOnError) {
							stopListening();
							reject(completions);
						} else if (completionsCount === waitFor.length) {
							stopListening();
							resolve(completions);
						}
					});
					client.xadd(...xaddArgs).catch(reject);
				});
			};
		}

		if (!waitFor) {
			await client.xadd(...xaddArgs);
		}

		return job;

	}

}
