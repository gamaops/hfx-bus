import { Redis } from 'ioredis';
import nanoid from 'nanoid';
import { RedisClient } from './connection-manager';
import { HFXBUS_ID_SIZE } from './helpers';

export interface ISentJob extends Job {
	finished(timeout?: number): Promise<Job>;
}

export interface IReceivedJob extends Job {
	release(): IReceivedJob;
	resolve(): Promise<void>;
	reject<T extends Error>(error: T): Promise<void>;
}

export class Job {

	public readonly id: string;
	public finished: any;

	private client: RedisClient & Redis;
	private stacks: {
		set: Array<any>,
		get: Array<any>,
		del: Array<any>,
		getMap: any,
	} = {
		set: [],
		get: [],
		del: [],
		getMap: {},
	};

	constructor(client: RedisClient & Redis, id?: string) {
		this.id = id || nanoid(HFXBUS_ID_SIZE);
		this.client = client;
	}

	public prefix(key: string): string {
		return `${this.client.keyPrefix}:job:${this.id}:${key}`;
	}

	public del(key: string): Job {
		this.stacks.del.push(['del', this.prefix(key)]);
		return this;
	}

	public set(key: string, value: any, timeout?: number): Job {
		if (!Buffer.isBuffer(value)) {
			value = JSON.stringify(value);
		}
		key = this.prefix(key);
		if (timeout) {
			this.stacks.set.push(['psetex', key, timeout, value]);
			return this;
		}
		this.stacks.set.push(['set', key, value]);
		return this;
	}

	public async push() {
		if (this.stacks.set.length > 0) {
			await this.exec(this.stacks.set);
			this.stacks.set = [];
		}
	}

	public get(key: string, asBuffer: boolean = true): Job {
		const prefixedKey = this.prefix(key);
		this.stacks.getMap[prefixedKey] = key;
		this.stacks.get.push([asBuffer ? 'getBuffer' : 'get', prefixedKey]);
		return this;
	}

	public async pull<T = { [key: string]: any }>(): Promise<T> {
		const values: any = {};
		if (this.stacks.get.length > 0 || this.stacks.del.length > 0) {
			const results = await this.exec([
				...this.stacks.get,
				...this.stacks.del,
			]);
			for (let i = 0; i < this.stacks.get.length; i++) {
				if (results[i][0]) { // TODO: Is right to ignore error?
					continue;
				}
				const result = results[i].pop();
				const [command, prefixedKey] = this.stacks.get[i];
				const key = this.stacks.getMap[prefixedKey];
				if (!result) {
					values[key] = null;
					continue;
				} else if (command === 'get') {
					try {
						values[key] = JSON.parse(result);
					} catch (error) {
						values[key] = error;
					}
					continue;
				}
				values[key] = result;
			}
			this.stacks.get = [];
			this.stacks.getMap = {};
			this.stacks.del = [];
		}
		return values;
	}

	private async exec(commands: Array<Array<any>>): Promise<Array<any>> {
		if (this.client.enablePipelining) {
			return await this.client.pipeline(commands).exec();
		}
		const results: Array<any> = [];
		const client: any = this.client as any;
		for (const command of commands) {
			const [key, ...args] = command;
			try {
				const result = await client[key](...args);
				results.push([null, result]);
			} catch (error) {
				results.push([error]);
			}
		}
		return results;
	}

}
