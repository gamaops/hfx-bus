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
        this.processingCount = 0;
        this.streams = [];
        this.streamsIdMap = [];
        this.consuming = false;
        this.claimScheduled = false;
        this.claimer = null;
        this.processors = {};
        this.connection = connection;
        this.id = options.id || nanoid_1.default(helpers_1.HFXBUS_ID_SIZE);
        this.consuming = false;
        this.options = {
            concurrency: 1,
            blockTimeout: 5000,
            claimDeadline: 30000,
            retryLimit: 3,
            claimPageSize: 100,
            ...options,
        };
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
        if (this.options.claimInterval) {
            this.claimer = setInterval(() => {
                this.claimScheduled = true;
            }, this.options.claimInterval);
        }
        this.removeAllListeners(CONSUME_EVENT);
        this.on(CONSUME_EVENT, async () => {
            if (this.consuming || this.processingCount >= this.options.concurrency) {
                return;
            }
            const client = this.connection.getClient(this.id);
            this.consuming = true;
            client.emit('use');
            try {
                if (client.stopped) {
                    await this.pause();
                }
                else {
                    this.streams.push(this.streams.shift());
                    if (this.claimScheduled) {
                        await this.retry(client);
                        this.claimScheduled = false;
                    }
                    if (this.processingCount < this.options.concurrency) {
                        await this.consume(client);
                    }
                }
            }
            catch (error) {
                this.emit('error', helpers_1.setErrorKind(error, 'CONSUME_ERROR'));
            }
            client.emit('release');
            this.consuming = false;
            this.emit(CONSUME_EVENT);
        }).emit(CONSUME_EVENT);
    }
    async pause(timeout) {
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
                this.consuming = false;
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
    receive({ stream, id, data, }) {
        this.processingCount++;
        const job = new job_1.Job(this.connection.getClient('jobs'), data.job);
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
        const client = this.connection.getClient('streams');
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
            await client.publish(channel, `{"str":"${streamName}","grp":"${this.options.group}","job":"${data.job}"}`);
            finish();
        };
        job.reject = async (error) => {
            const serialized = serialize_error_1.default(error);
            await client.publish(channel, `{"str":"${streamName}","grp":"${this.options.group}","job":"${data.job}","err":${JSON.stringify(serialized)}}`);
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
    async retry(client) {
        const jobs = await client.xretry(this.group, this.id, this.options.retryLimit, this.options.concurrency - this.processingCount, this.options.claimPageSize, this.options.claimDeadline);
        if (jobs && jobs.length > 0) {
            for (const job of jobs) {
                const { data, id, stream, } = job;
                this.receive({
                    data,
                    id,
                    stream,
                });
                this.emit('claimed', job);
            }
        }
    }
    async consume(client) {
        const jobs = await client.xreadgroup('group', this.group, this.id, 'count', this.options.concurrency - this.processingCount, 'block', this.options.blockTimeout, 'streams', ...this.streams, ...this.streamsIdMap);
        if (jobs) {
            for (const stream in jobs) {
                for (const { id, data } of jobs[stream]) {
                    this.receive({
                        data,
                        id,
                        stream,
                    });
                }
            }
        }
    }
    async ensureStreamGroups() {
        const client = this.connection.getClient(this.id);
        for (const stream in this.processors) {
            const processor = this.processors[stream];
            const { fromId, } = this.processors[stream];
            try {
                await client.xgroup('create', stream, this.group, fromId, 'mkstream');
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
                    continue;
                }
                throw error;
            }
        }
    }
}
exports.Consumer = Consumer;
