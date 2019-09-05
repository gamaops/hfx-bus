import EventEmitter from 'eventemitter3';
import { ConnectionManager } from './connection-manager';
import { ISentJob, Job } from './job';
export interface IJobCompletion {
    [key: string]: null | Date | any;
}
export declare class Producer extends EventEmitter {
    readonly id: string;
    private connection;
    constructor(connection: ConnectionManager);
    listen(...streams: Array<string>): Promise<void>;
    job(id?: string): Job;
    send({ stream, route, job, capped, waitFor, rejectOnError, }: {
        stream: string;
        route?: string;
        job: Job;
        capped?: number;
        waitFor?: Array<string> | null;
        rejectOnError?: boolean;
    }): Promise<ISentJob>;
    private bindClient;
}
