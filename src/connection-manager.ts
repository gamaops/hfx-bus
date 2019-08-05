import fs from 'fs';
import Redis, { Cluster, ClusterNode, ClusterOptions, RedisOptions } from 'ioredis';
import path from 'path';

require('../lib/add-streams-to-ioredis')(Redis);

const XRETRY_LUA = fs.readFileSync(
	path.join(__dirname, '../lib/scripts/xretry.lua'),
).toString();

export interface IRedisClientOptions {
	keyPrefix?: string;
	enablePipelining?: boolean;
}

export interface IRedisClient extends IRedisClientOptions {
	usedBy?: number;
	stopped?: boolean;
}

export type RedisClient = Cluster & IRedisClient | Redis.Redis & IRedisClient;

export class ConnectionManager {

	public static cluster(
		startupNodes: Array<ClusterNode>,
		cluster: ClusterOptions & IRedisClientOptions,
	): ConnectionManager {
		return new ConnectionManager({
			startupNodes,
			cluster: {
				enablePipelining: false,
				...cluster
			},
		});
	}

	public static standalone(standalone: RedisOptions & IRedisClientOptions): ConnectionManager {
		return new ConnectionManager({
			standalone: {
				enablePipelining: true,
				...standalone
			},
		});
	}

	private standalone: RedisOptions & IRedisClientOptions | undefined;
	private cluster: ClusterOptions & IRedisClientOptions | undefined;
	private startupNodes: Array<ClusterNode> | undefined;
	private clients: { [key: string]: RedisClient } = {};
	private keyPrefix: string = 'hfxbus';

	constructor({
		standalone,
		cluster,
		startupNodes,
	}: {
		standalone?: RedisOptions & IRedisClientOptions,
		cluster?: ClusterOptions & IRedisClientOptions,
		startupNodes?: Array<ClusterNode>,
	}) {
		this.standalone = standalone;
		this.cluster = cluster;
		this.startupNodes = startupNodes;
		if (this.standalone) {
			this.keyPrefix = this.standalone!.keyPrefix || 'hfxbus';
			Reflect.deleteProperty(this.standalone!, 'keyPrefix');
		} else {
			this.keyPrefix = this.cluster!.keyPrefix || 'hfxbus';
			Reflect.deleteProperty(this.cluster!, 'keyPrefix');
		}
	}

	public getClient(key: string): RedisClient {
		if (!(key in this.clients)) {

			let client: RedisClient;

			if (this.standalone) {
				client = new Redis(this.standalone);
				client.enablePipelining = this.standalone!.enablePipelining;
			} else {
				client = new Cluster(this.startupNodes!, this.cluster);
				client.enablePipelining = this.cluster!.enablePipelining;
			}

			this.clients[key] = client;

			client.keyPrefix = this.keyPrefix;
			client.setMaxListeners(Infinity);
			client.usedBy = 0;
			client.stopped = false;

			client.defineCommand('xretry', {
				lua: XRETRY_LUA,
				numberOfKeys: 6,
			});

			client.once('close', () => {
				delete this.clients[key];
			}).on('use', () => {
				client.usedBy!++;
			}).on('release', () => {
				client.usedBy!--;
				if (client.usedBy === 0) {
					client.emit('free');
				}
			});
		}
		return this.clients[key];
	}

	public getKeyPrefix(): string {
		return this.keyPrefix;
	}

	public async stop({
		maxWait,
		force,
	}: {
		maxWait?: number,
		force?: boolean,
	}) {

		const promises: Array<Promise<any>> = [];

		for (const key in this.clients) {

			const client = this.clients[key];

			if (client.stopped && !force) {
				continue;
			}

			client.stopped = true;

			if (force) {
				client.disconnect();
				continue;
			}

			promises.push(new Promise((resolve, reject) => {
				if (client.usedBy === 0) {
					client.quit().then(() => resolve()).catch(reject);
					return undefined;
				}

				let timeout: any = null;

				if (maxWait) {
					timeout = setTimeout(() => {
						client.disconnect();
					}, maxWait);
				}

				client.once('free', () => {
					client.quit().then(() => {
						if (timeout) {
							clearTimeout(timeout);
						}
						resolve();
					}).catch(reject);
				}).emit('stopped');

				return undefined;
			}));

		}

		if (!force) {
			await Promise.all(promises);
		}

	}

}
