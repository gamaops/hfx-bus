import EventEmitter from 'eventemitter3';
import { Redis } from 'ioredis';
import { ConnectionManager } from './connection-manager';
import { IReceivedJob } from './job';
export declare type IStreamProcessor = (job: IReceivedJob) => Promise<any>;
export interface IConsumerOptions {
    group: string;
    id?: string;
    concurrency?: number;
    blockTimeout?: number;
    claimInterval?: number;
    retryLimit?: number;
    claimPageSize?: number;
    claimDeadline?: number;
    route?: string | symbol;
}
export interface IRedisClientPair {
    blocking: Redis & {
        xretry: any;
    };
    aux: Redis;
}
export declare class Consumer extends EventEmitter {
    readonly id: string;
    private clients;
    private connection;
    private processingCount;
    private streams;
    private streamsIdMap;
    private group;
    private claimScheduled;
    private consuming;
    private claimer;
    private options;
    private processors;
    constructor(connection: ConnectionManager, options: IConsumerOptions);
    process({ stream, processor, readFrom, fromId, deadline, setId, }: {
        stream: string;
        processor: IStreamProcessor;
        readFrom?: string;
        fromId?: string;
        deadline?: number;
        setId?: boolean;
    }): Consumer;
    play(): Promise<void>;
    pause(timeout?: number): Promise<unknown>;
    private execute;
    private receive;
    private retry;
    private consume;
    private ensureStreamGroups;
    private ensureStreamGroupsOnClient;
}
