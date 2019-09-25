import EventEmitter from 'eventemitter3';
import { Redis } from 'ioredis';
import nanoid from 'nanoid';
import serializeError from 'serialize-error';
import { ConnectionManager } from './connection-manager';
import { DISTRIBUTED_ROUTING, HFXBUS_ID_SIZE, setErrorKind } from './helpers';
import { IReceivedJob, Job } from './job';

export type IStreamProcessor = (job: IReceivedJob) => Promise<any>;

export interface IConsumerOptions {
	group: string;
	id?: string;
	concurrency?: number;
	blockTimeout?: number;
	claimInterval?: number;
	retryLimit?: number;
	claimPageSize?: number;
	claimDeadline?: number;
	route?: string | symbol;
}

export interface IRedisClientPair {
	blocking: Redis & {
		xretry: any;
	};
	aux: Redis;
}

const CONSUME_EVENT = Symbol('consume');

export class Consumer extends EventEmitter {

	public readonly id: string;

	private clients: Array<IRedisClientPair> = [];
	private connection: ConnectionManager;
	private processingCount: number = 0;
	private streams: Array<string> = [];
	private streamsIdMap: Array<string> = [];
	private group: string;
	private claimScheduled: boolean = false;
	private consuming: boolean = false;
	private claimer: any = null;
	private options: IConsumerOptions;
	private processors: {
		[key: string]: {
			processor: IStreamProcessor,
			readFrom: string,
			fromId: string,
			deadline: number,
			stream: string,
			setId: boolean,
		},
	} = {};

	constructor(connection: ConnectionManager, options: IConsumerOptions) {
		super();
		this.connection = connection;
		this.id = options.id || nanoid(HFXBUS_ID_SIZE);
		this.options = {
			concurrency: 1,
			blockTimeout: 5000,
			claimDeadline: 30000,
			retryLimit: 3,
			claimPageSize: 100,
			route: options.route || options.group,
			...options,
		};
		if (this.options.route !== DISTRIBUTED_ROUTING && typeof this.options.route !== 'string') {
			throw new Error(`Invalid route: ${this.options.route!.toString()}`);
		}
		this.group = `${this.connection.getKeyPrefix()}:csr:${this.options.group}`;
	}

	public process({
		stream,
		processor,
		readFrom = '>',
		fromId = '$',
		deadline = 30000,
		setId = false,
	}: {
		stream: string,
		processor: IStreamProcessor,
		readFrom?: string,
		fromId?: string,
		deadline?: number,
		setId?: boolean,
	}): Consumer {
		this.processors[`${this.connection.getKeyPrefix()}:str:${stream}`] = {
			processor,
			fromId,
			readFrom,
			deadline,
			stream,
			setId,
		};
		return this;
	}

	public async play() {

		await this.ensureStreamGroups();

		this.streams = Object.keys(this.processors);
		this.streamsIdMap = this.streams.map((stream) => this.processors[stream].readFrom);
		this.consuming = true;

		if (this.options.claimInterval) {
			this.claimer = setInterval(() => {
				this.claimScheduled = true;
			}, this.options.claimInterval);
		}

		this.removeAllListeners(CONSUME_EVENT);

		this.on(CONSUME_EVENT, async () => {
			if (!this.consuming || this.processingCount >= this.options.concurrency!) {
				return;
			}
			this.clients.push(this.clients.shift()!);
			const freeSlots = this.options.concurrency! - this.processingCount;
			let countPerClient = freeSlots / this.clients.length;
			let modulo = countPerClient % 1;
			if (countPerClient < 1) {
				countPerClient = 0;
				modulo = freeSlots;
			} else if (modulo > 0) {
				countPerClient = Math.floor(countPerClient);
				modulo = Math.round(modulo * this.clients.length);
			}
			let blockedCount = 0;
			await Promise.all(this.clients.map((clients, index) => {
				const client = clients.blocking as Redis & { xretry: any, isBlocked: boolean };
				if (client.isBlocked) {
					blockedCount++;
					return Promise.resolve();
				}
				let count = countPerClient;
				if (modulo > 0) {
					count++;
					modulo--;
				}
				if (count === 0) {
					return Promise.resolve();
				}
				client.isBlocked = true;
				return this.execute(clients, count).then(() => {
					client.isBlocked = false;
				}).catch((error) => {
					client.isBlocked = false;
					return Promise.reject(error);
				});
			}));
			if (blockedCount !== this.clients.length) {
				process.nextTick(() => this.emit(CONSUME_EVENT));
			}
		}).emit(CONSUME_EVENT);

	}

	public async pause(timeout?: number) {

		this.consuming = false;

		this.removeAllListeners(CONSUME_EVENT);

		if (this.claimer) {
			clearInterval(this.claimer);
			this.claimer = null;
		}

		return new Promise((resolve, reject) => {
			if (this.processingCount === 0) {
				resolve();
				return;
			}
			let timeoutId: any = null;
			const resolved = () => {
				if (timeoutId) {
					clearTimeout(timeoutId);
				}
				this.clients = [];
				resolve();
			};
			if (timeout) {
				timeoutId = setTimeout(() => {
					this.removeListener('drained', resolved);
					reject(setErrorKind(
						new Error(`Timeouted while waiting to be drained: ${timeout}ms`),
						'PAUSE_TIMEOUT',
					));
				}, timeout);
			}
			this.once('drained', resolved);
		});

	}

	private async execute(
		clients: IRedisClientPair,
		count: number,
	) {
		const client = clients.blocking as Redis & {
			stopped: any,
			xretry: any,
		};
		client.emit('use');
		try {
			if (client.stopped) {
				await this.pause();
			} else {
				this.streams.push(this.streams.shift()!);
				if (this.claimScheduled) {
					count -= await this.retry(clients, count);
					this.claimScheduled = false;
				}
				if (count > 0) {
					await this.consume(clients, count);
				}
			}
		} catch (error) {
			this.emit('error', setErrorKind(error, 'CONSUME_ERROR'));
		}
		client.emit('release');
	}

	private receive({
		stream,
		id,
		data,
		client,
	}: {
		stream: string,
		id: string,
		client: Redis,
		data: {
			prd: string,
			job: string,
		},
	}) {

		this.processingCount++;

		const job = new Job(
			this.connection.getClientByRoute('jobs', data.job) as Redis,
			data.job,
		) as IReceivedJob;

		job.release = (): IReceivedJob => {
			this.processingCount--;
			if (this.processingCount === 0) {
				this.emit('drained');
			}
			this.emit(CONSUME_EVENT);
			delete job.release;
			return job;
		};

		const streamName = this.processors[stream].stream;
		const channel = `${this.connection.getKeyPrefix()}:chn:${streamName}:${data.prd}`;
		const streamClient = this.connection.getClientByRoute('streams', streamName) as Redis;
		const deadlineTimespan = this.processors[stream].deadline;

		let deadline: any = null;

		if (deadlineTimespan && deadlineTimespan !== Infinity) {
			deadline = setTimeout(() => {
				if (job.reject) {
					job.reject(setErrorKind(
						new Error(`The job was running for too long (${deadlineTimespan}ms)`),
						'DEADLINE_TIMEOUT',
					));
				}
			}, deadlineTimespan);
		}

		const finish = () => {
			delete job.resolve;
			delete job.reject;
			if (deadline) {
				clearTimeout(deadline);
				deadline = null;
			}
			if (job.release) {
				job.release();
			}
		};

		job.resolve = async () => {
			await client.xack(
				stream,
				this.group,
				id,
			);
			await streamClient.publish(channel, `{"str":"${streamName}","grp":"${this.options.group}","job":"${data.job}"}`);
			finish();
		};

		job.reject = async (error) => {
			const serialized = serializeError(error);
			await streamClient.publish(
				channel,
				`{"str":"${streamName}","grp":"${this.options.group}","job":"${data.job}","err":${JSON.stringify(serialized)}}`,
			);
			finish();
		};

		this.processors[stream].processor(job).then(() => {
			if (job.resolve) {
				return job.resolve();
			}
			return Promise.resolve();
		}).catch((error) => {
			if (job.reject) {
				return job.reject(error);
			}
			error.job = job;
			this.emit('error', setErrorKind(error, 'UNHANDLED_JOB_ERROR'));
			return Promise.resolve();
		}).catch((error) => {
			error.job = job;
			this.emit('error', setErrorKind(error, 'REJECT_JOB_ERROR'));
		});

	}

	private async retry(clients: IRedisClientPair, count: number): Promise<number> {
		const jobs = await clients.blocking.xretry(
			this.group,
			this.id,
			this.options.retryLimit,
			count,
			this.options.claimPageSize,
			this.options.claimDeadline,
		);
		if (jobs && jobs.length > 0) {
			for (const job of jobs) {
				const {
					data,
					id,
					stream,
				} = job;
				this.receive({
					data,
					id,
					stream,
					client: clients.aux,
				});
				this.emit('claimed', job);
			}
			return jobs.length;
		}
		return 0;
	}

	private async consume(clients: IRedisClientPair, count: number): Promise<number> {
		const jobs = await clients.blocking.xreadgroup(
			'group',
			this.group,
			this.id,
			'count',
			count,
			'block',
			this.options.blockTimeout,
			'streams',
			...this.streams,
			...this.streamsIdMap,
		);
		if (jobs) {
			for (const stream in jobs) {
				for (const { id, data } of jobs[stream]) {
					this.receive({
						data,
						id,
						stream,
						client: clients.aux,
					});
				}
			}
			return jobs.length;
		}
		return 0;
	}

	private async ensureStreamGroups() {

		this.clients = [];

		if (typeof this.options.route === 'string') {
			await this.ensureStreamGroupsOnClient(
				this.connection.getClientByRoute(this.id, this.options.route!) as Redis & { xretry: any },
				this.connection.getClientByRoute(this.id + '-aux', this.options.route!) as Redis,
			);
			return;
		} else if (this.options.route === DISTRIBUTED_ROUTING) {
			const clients = this.connection.getClients(this.id);
			const clientsAux = this.connection.getClients(this.id + '-aux') as Array<Redis>;
			await Promise.all(clients.map((client, index) => {
				return this.ensureStreamGroupsOnClient(client as Redis & { xretry: any }, clientsAux[index]);
			}));
			return;
		}

	}

	private async ensureStreamGroupsOnClient(client: Redis & { xretry: any }, clientAux: Redis) {

		for (const stream in this.processors) {
			const processor = this.processors[stream];
			const {
				fromId,
			} = this.processors[stream];
			try {
				await client.xgroup(
					'create',
					stream,
					this.group,
					fromId,
					'mkstream',
				);
				this.clients.push({
					blocking: client,
					aux: clientAux,
				});
			} catch (error) {
				if (error.message.includes('BUSYGROUP')) {
					if (processor.setId) {
						try {
							await client.xgroup(
								'setid',
								stream,
								this.group,
								fromId,
							);
						} catch (error) {
							throw error;
						}
					}
					this.clients.push({
						blocking: client,
						aux: clientAux,
					});
					continue;
				}
				throw error;
			}
		}
	}

}
