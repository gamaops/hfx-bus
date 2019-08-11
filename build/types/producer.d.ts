import EventEmitter from 'eventemitter3';
import { ConnectionManager } from './connection-manager';
import { ISentJob, Job } from './job';
export declare class Producer extends EventEmitter {
    readonly id: string;
    private connection;
    constructor(connection: ConnectionManager);
    listen(...streams: Array<string>): Promise<void>;
    job(id?: string): Job;
    send({ stream, job, capped, }: {
        stream: string;
        job: Job;
        capped?: number;
    }): Promise<ISentJob>;
}
