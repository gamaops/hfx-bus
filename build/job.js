"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const nanoid_1 = __importDefault(require("nanoid"));
const helpers_1 = require("./helpers");
class Job {
    constructor(client, id) {
        this.stacks = {
            set: [],
            get: [],
            del: [],
            getMap: {},
        };
        this.id = id || nanoid_1.default(helpers_1.HFXBUS_ID_SIZE);
        this.client = client;
    }
    prefix(key) {
        return `${this.client.keyPrefix}:job:${this.id}:${key}`;
    }
    del(key) {
        this.stacks.del.push(['del', this.prefix(key)]);
        return this;
    }
    set(key, value, timeout) {
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
    async push() {
        if (this.stacks.set.length > 0) {
            await this.exec(this.stacks.set);
            this.stacks.set = [];
        }
    }
    get(key, asBuffer = true) {
        const prefixedKey = this.prefix(key);
        this.stacks.getMap[prefixedKey] = key;
        this.stacks.get.push([asBuffer ? 'getBuffer' : 'get', prefixedKey]);
        return this;
    }
    async pull() {
        const values = {};
        if (this.stacks.get.length > 0 || this.stacks.del.length > 0) {
            const results = await this.exec([
                ...this.stacks.get,
                ...this.stacks.del,
            ]);
            for (let i = 0; i < this.stacks.get.length; i++) {
                if (results[i][0]) {
                    continue;
                }
                const result = results[i].pop();
                const [command, prefixedKey] = this.stacks.get[i];
                const key = this.stacks.getMap[prefixedKey];
                if (!result) {
                    values[key] = null;
                    continue;
                }
                else if (command === 'get') {
                    try {
                        values[key] = JSON.parse(result);
                    }
                    catch (error) {
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
    async exec(commands) {
        if (this.client.enablePipelining) {
            return await this.client.pipeline(commands).exec();
        }
        const results = [];
        const client = this.client;
        for (const command of commands) {
            const [key, ...args] = command;
            try {
                const result = await client[key](...args);
                results.push([null, result]);
            }
            catch (error) {
                results.push([error]);
            }
        }
        return results;
    }
}
exports.Job = Job;
