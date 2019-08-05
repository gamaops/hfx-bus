"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const eventemitter3_1 = __importDefault(require("eventemitter3"));
const nanoid_1 = __importDefault(require("nanoid"));
const helpers_1 = require("./helpers");
const job_1 = require("./job");
class Producer extends eventemitter3_1.default {
    constructor(connection) {
        super();
        this.connection = connection;
        this.id = nanoid_1.default(helpers_1.HFXBUS_ID_SIZE);
        const client = this.connection.getClient('channels');
        client.on('pmessage', (pattern, channel, message) => {
            try {
                message = JSON.parse(message);
                this.emit(`${message.job}:${message.str}`, message.err);
                this.emit(message.str, message.job, message.err);
            }
            catch (error) {
                error.pubsub = { message, channel };
                this.emit('error', helpers_1.setErrorKind(error, 'MESSAGE_PARSING'));
            }
        }).once('stopped', () => {
            client.punsubscribe().finally(() => {
                client.emit('release');
            });
        }).emit('use');
    }
    async listen(...streams) {
        const client = this.connection.getClient('channels');
        const patterns = streams.map((stream) => `${this.connection.getKeyPrefix()}:chn:${stream}:*`);
        if (streams.length === 0) {
            patterns.push(`${this.connection.getKeyPrefix()}:chn:*:${this.id}`);
        }
        await client.psubscribe(...patterns);
    }
    job(id) {
        return new job_1.Job(this.connection.getClient('jobs'), id);
    }
    async send({ stream, job, capped, }) {
        job.finished = async (timeout) => {
            return new Promise((resolve, reject) => {
                const event = `${job.id}:${stream}`;
                let timeoutId = null;
                if (timeout) {
                    timeoutId = setTimeout(() => {
                        this.removeAllListeners(event);
                        reject(helpers_1.setErrorKind(new Error(`Timeouted while waiting to be finished: ${timeout}ms`), 'FINISH_TIMEOUT'));
                    }, timeout);
                }
                this.once(event, (error) => {
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                    }
                    if (error) {
                        reject(error);
                    }
                    else {
                        resolve(job);
                    }
                });
            });
        };
        const client = this.connection.getClient('streams');
        let cappedOptions = [];
        if (capped) {
            cappedOptions = [
                'MAXLEN',
                '~',
                capped,
            ];
        }
        await client.xadd(stream, ...cappedOptions, '*', 'prd', this.id, 'job', job.id);
        return job;
    }
}
exports.Producer = Producer;
