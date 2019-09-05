import fs from 'fs';
import Redis, { Cluster, ClusterNode, ClusterOptions, RedisOptions } from 'ioredis';
import path from 'path';
const { crc16 } = require('crc');

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
	boundProducers?: Set<string>;
}

export interface IRedisNodes extends IRedisClientOptions {
	nodes: Array<RedisOptions & IRedisClientOptions>;
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
				...cluster,
			},
		});
	}

	public static standalone(standalone: RedisOptions & IRedisClientOptions): ConnectionManager {
		return new ConnectionManager({
			standalone: {
				enablePipelining: true,
				...standalone,
			},
		});
	}

	public static nodes(nodes: IRedisNodes): ConnectionManager {
		return new ConnectionManager({
			nodes: {
				enablePipelining: true,
				...nodes,
			},
		});
	}

	private nodes: IRedisNodes | undefined;
	private standalone: RedisOptions & IRedisClientOptions | undefined;
	private cluster: ClusterOptions & IRedisClientOptions | undefined;
	private startupNodes: Array<ClusterNode> | undefined;
	private clients: { [key: string]: RedisClient } = {};
	private keyPrefix: string = 'hfxbus';

	constructor({
		standalone,
		cluster,
		startupNodes,
		nodes,
	}: {
		standalone?: RedisOptions & IRedisClientOptions,
		cluster?: ClusterOptions & IRedisClientOptions,
		startupNodes?: Array<ClusterNode>,
		nodes?: IRedisNodes,
	}) {
		this.standalone = standalone;
		this.cluster = cluster;
		this.startupNodes = startupNodes;
		this.nodes = nodes;
		if (this.standalone) {
			this.keyPrefix = this.standalone!.keyPrefix || 'hfxbus';
			Reflect.deleteProperty(this.standalone!, 'keyPrefix');
		} else if (this.nodes) {
			this.keyPrefix = this.nodes!.keyPrefix || 'hfxbus';
			Reflect.deleteProperty(this.nodes!, 'keyPrefix');
		} else {
			this.keyPrefix = this.cluster!.keyPrefix || 'hfxbus';
			Reflect.deleteProperty(this.cluster!, 'keyPrefix');
		}
	}

	public getClientByRoute(key: string, route: string): RedisClient {
		if (!this.nodes) {
			return this.getClient(key);
		}

		const index = crc16(route) % this.nodes.nodes.length;
		const clientKey = `${key}-${index}`;

		if (!(clientKey in this.clients)) {

			const client = new Redis(this.nodes.nodes[index]) as unknown as RedisClient;
			client.enablePipelining = this.nodes.enablePipelining;

			this.addClient(clientKey, client);

		}

		return this.clients[clientKey];
	}

	public getClients(key: string): Array<RedisClient> {
		if (!this.nodes) {
			return [this.getClient(key)];
		}

		return this.nodes.nodes.map((node, index) => {
			const clientKey = `${key}-${index}`;

			if (!(clientKey in this.clients)) {

				const client = new Redis(node) as unknown as RedisClient;
				client.enablePipelining = this.nodes!.enablePipelining;

				this.addClient(clientKey, client);

			}
			return this.clients[clientKey];
		});
	}

	public getClient(key: string): RedisClient {
		if (!(key in this.clients)) {

			let client: RedisClient;

			if (this.standalone) {
				client = new Redis(this.standalone) as unknown as RedisClient;
				client.enablePipelining = this.standalone!.enablePipelining;
			} else {
				client = new Cluster(this.startupNodes!, this.cluster) as unknown as RedisClient;
				client.enablePipelining = this.cluster!.enablePipelining;
			}

			this.addClient(key, client);

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
	} = {}) {

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

		this.clients = {};

	}

	private addClient(key: string, client: RedisClient) {

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

}
