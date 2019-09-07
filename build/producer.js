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
    }
    async listen(...streams) {
        if (streams.length === 0) {
            const clients = this.connection.getClients('channels');
            await Promise.all(clients.map((client) => {
                this.bindClient(client);
                return client.psubscribe(`${this.connection.getKeyPrefix()}:chn:*:${this.id}`);
            }));
            return;
        }
        await Promise.all(streams.map((stream) => {
            if (stream.includes('*')) {
                const clients = this.connection.getClients('channels');
                return Promise.all(clients.map((nodeClient) => {
                    this.bindClient(nodeClient);
                    return nodeClient.psubscribe(`${this.connection.getKeyPrefix()}:chn:${stream}:*`);
                }));
            }
            const client = this.connection.getClientByRoute('channels', stream);
            this.bindClient(client);
            return client.psubscribe(`${this.connection.getKeyPrefix()}:chn:${stream}:*`);
        }));
    }
    job(id) {
        id = id || nanoid_1.default(helpers_1.HFXBUS_ID_SIZE);
        return new job_1.Job(this.connection.getClientByRoute('jobs', id), id);
    }
    async send({ stream, route, job, capped, waitFor, rejectOnError, }) {
        const clientRoute = route === helpers_1.DISTRIBUTED_ROUTING ? job.id : (route || stream).toString();
        const client = this.connection.getClientByRoute('streams', clientRoute);
        let cappedOptions = [];
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
                    const stopListening = () => {
                        this.removeAllListeners(event);
                        if (timeoutId) {
                            clearTimeout(timeoutId);
                        }
                    };
                    const completions = {};
                    waitFor.forEach((group) => completions[group] = null);
                    let completionsCount = 0;
                    this.on(event, (error, group) => {
                        if (group in completions) {
                            completionsCount++;
                        }
                        completions[group] = error || new Date();
                        if (error && rejectOnError) {
                            stopListening();
                            reject(completions);
                        }
                        else if (completionsCount === waitFor.length) {
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
    bindClient(client) {
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
}
exports.Producer = Producer;
