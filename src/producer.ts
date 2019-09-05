import EventEmitter from 'eventemitter3';
import { Redis } from 'ioredis';
import nanoid from 'nanoid';
import { ConnectionManager, RedisClient } from './connection-manager';
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

	}

	public async listen(...streams: Array<string>) {
		if (streams.length === 0) {
			const clients = this.connection.getClients('channels');
			await Promise.all(clients.map((client) => {
				this.bindClient(client);
				return (client as Redis).psubscribe(`${this.connection.getKeyPrefix()}:chn:*:${this.id}`);
			}));
			return;
		}
		await Promise.all(streams.map((stream) => {
			if (stream.includes('*')) {
				const clients = this.connection.getClients('channels');
				return Promise.all(clients.map((nodeClient) => {
					this.bindClient(nodeClient);
					return (nodeClient as Redis).psubscribe(`${this.connection.getKeyPrefix()}:chn:${stream}:*`);
				}));
			}
			const client = this.connection.getClientByRoute('channels', stream);
			this.bindClient(client);
			return (client as Redis).psubscribe(`${this.connection.getKeyPrefix()}:chn:${stream}:*`);
		}));
	}

	public job(id?: string): Job {
		id = id || nanoid(HFXBUS_ID_SIZE);
		return new Job(
			this.connection.getClientByRoute('jobs', id) as Redis,
			id,
		);
	}

	public async send({
		stream,
		route,
		job,
		capped,
		waitFor,
		rejectOnError,
	}: {
		stream: string,
		route?: string,
		job: Job,
		capped?: number,
		waitFor?: Array<string> | null,
		rejectOnError?: boolean,
	}): Promise<ISentJob> {

		const client = this.connection.getClientByRoute('streams', route || stream) as Redis & { xadd: any };
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

	private bindClient(client: RedisClient) {
		if (!client.boundProducers) {
			client.boundProducers = new Set();
		}

		if (client.boundProducers.has(this.id)) {
			return;
		}

		client.boundProducers.add(this.id);

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
			(client as Redis).punsubscribe().finally(() => {
				client.emit('release');
			});
		}).emit('use');
	}

}
