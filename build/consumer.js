"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const eventemitter3_1 = __importDefault(require("eventemitter3"));
const nanoid_1 = __importDefault(require("nanoid"));
const serialize_error_1 = __importDefault(require("serialize-error"));
const helpers_1 = require("./helpers");
const job_1 = require("./job");
const CONSUME_EVENT = Symbol('consume');
class Consumer extends eventemitter3_1.default {
    constructor(connection, options) {
        super();
        this.clients = [];
        this.processingCount = 0;
        this.streams = [];
        this.streamsIdMap = [];
        this.claimScheduled = false;
        this.consuming = false;
        this.claimer = null;
        this.processors = {};
        this.connection = connection;
        this.id = options.id || nanoid_1.default(helpers_1.HFXBUS_ID_SIZE);
        this.options = {
            concurrency: 1,
            blockTimeout: 5000,
            claimDeadline: 30000,
            retryLimit: 3,
            claimPageSize: 100,
            route: options.route || options.group,
            ...options,
        };
        if (this.options.route !== helpers_1.DISTRIBUTED_ROUTING && typeof this.options.route !== 'string') {
            throw new Error(`Invalid route: ${this.options.route.toString()}`);
        }
        this.group = `${this.connection.getKeyPrefix()}:csr:${this.options.group}`;
    }
    process({ stream, processor, readFrom = '>', fromId = '$', deadline = 30000, setId = false, }) {
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
    async play() {
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
            if (!this.consuming || this.processingCount >= this.options.concurrency) {
                return;
            }
            this.clients.push(this.clients.shift());
            const freeSlots = this.options.concurrency - this.processingCount;
            let countPerClient = freeSlots / this.clients.length;
            let modulo = countPerClient % 1;
            if (countPerClient < 1) {
                countPerClient = 0;
                modulo = freeSlots;
            }
            else if (modulo > 0) {
                countPerClient = Math.floor(countPerClient);
                modulo = Math.round(modulo * this.clients.length);
            }
            let blockedCount = 0;
            await Promise.all(this.clients.map((clients, index) => {
                const client = clients.blocking;
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
    async pause(timeout) {
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
            let timeoutId = null;
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
                    reject(helpers_1.setErrorKind(new Error(`Timeouted while waiting to be drained: ${timeout}ms`), 'PAUSE_TIMEOUT'));
                }, timeout);
            }
            this.once('drained', resolved);
        });
    }
    async execute(clients, count) {
        const client = clients.blocking;
        client.emit('use');
        try {
            if (client.stopped) {
                await this.pause();
            }
            else {
                this.streams.push(this.streams.shift());
                if (this.claimScheduled) {
                    count -= await this.retry(clients, count);
                    this.claimScheduled = false;
                }
                if (count > 0) {
                    await this.consume(clients, count);
                }
            }
        }
        catch (error) {
            this.emit('error', helpers_1.setErrorKind(error, 'CONSUME_ERROR'));
        }
        client.emit('release');
    }
    receive({ stream, id, data, client, }) {
        this.processingCount++;
        const job = new job_1.Job(this.connection.getClientByRoute('jobs', data.job), data.job);
        job.release = () => {
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
        const streamClient = this.connection.getClientByRoute('streams', streamName);
        const deadlineTimespan = this.processors[stream].deadline;
        let deadline = null;
        if (deadlineTimespan && deadlineTimespan !== Infinity) {
            deadline = setTimeout(() => {
                if (job.reject) {
                    job.reject(helpers_1.setErrorKind(new Error(`The job was running for too long (${deadlineTimespan}ms)`), 'DEADLINE_TIMEOUT'));
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
            await client.xack(stream, this.group, id);
            await streamClient.publish(channel, `{"str":"${streamName}","grp":"${this.options.group}","job":"${data.job}"}`);
            finish();
        };
        job.reject = async (error) => {
            const serialized = serialize_error_1.default(error);
            await streamClient.publish(channel, `{"str":"${streamName}","grp":"${this.options.group}","job":"${data.job}","err":${JSON.stringify(serialized)}}`);
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
            this.emit('error', helpers_1.setErrorKind(error, 'UNHANDLED_JOB_ERROR'));
            return Promise.resolve();
        }).catch((error) => {
            error.job = job;
            this.emit('error', helpers_1.setErrorKind(error, 'REJECT_JOB_ERROR'));
        });
    }
    async retry(clients, count) {
        const jobs = await clients.blocking.xretry(this.group, this.id, this.options.retryLimit, count, this.options.claimPageSize, this.options.claimDeadline);
        if (jobs && jobs.length > 0) {
            for (const job of jobs) {
                const { data, id, stream, } = job;
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
    async consume(clients, count) {
        const jobs = await clients.blocking.xreadgroup('group', this.group, this.id, 'count', count, 'block', this.options.blockTimeout, 'streams', ...this.streams, ...this.streamsIdMap);
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
    async ensureStreamGroups() {
        this.clients = [];
        if (typeof this.options.route === 'string') {
            await this.ensureStreamGroupsOnClient(this.connection.getClientByRoute(this.id, this.options.route), this.connection.getClientByRoute(this.id + '-aux', this.options.route));
            return;
        }
        else if (this.options.route === helpers_1.DISTRIBUTED_ROUTING) {
            const clients = this.connection.getClients(this.id);
            const clientsAux = this.connection.getClients(this.id + '-aux');
            await Promise.all(clients.map((client, index) => {
                return this.ensureStreamGroupsOnClient(client, clientsAux[index]);
            }));
            return;
        }
    }
    async ensureStreamGroupsOnClient(client, clientAux) {
        for (const stream in this.processors) {
            const processor = this.processors[stream];
            const { fromId, } = this.processors[stream];
            try {
                await client.xgroup('create', stream, this.group, fromId, 'mkstream');
                this.clients.push({
                    blocking: client,
                    aux: clientAux,
                });
            }
            catch (error) {
                if (error.message.includes('BUSYGROUP')) {
                    if (processor.setId) {
                        try {
                            await client.xgroup('setid', stream, this.group, fromId);
                        }
                        catch (error) {
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
exports.Consumer = Consumer;
