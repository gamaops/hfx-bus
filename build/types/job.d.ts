import { Redis } from 'ioredis';
import { RedisClient } from './connection-manager';
export interface ISentJob extends Job {
    finished(timeout?: number): Promise<Job>;
}
export interface IReceivedJob extends Job {
    release(): IReceivedJob;
    resolve(): Promise<void>;
    reject<T extends Error>(error: T): Promise<void>;
}
export declare class Job {
    readonly id: string;
    finished: any;
    private client;
    private stacks;
    constructor(client: RedisClient & Redis, id?: string);
    prefix(key: string): string;
    del(key: string): Job;
    set(key: string, value: any, timeout?: number): Job;
    push(): Promise<void>;
    get(key: string, asBuffer?: boolean): Job;
    pull<T = {
        [key: string]: any;
    }>(): Promise<T>;
    private exec;
}
