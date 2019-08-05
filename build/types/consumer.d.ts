import EventEmitter from 'eventemitter3';
import { ConnectionManager } from './connection-manager';
import { IReceivedJob } from './job';
export declare type IStreamProcessor = (job: IReceivedJob) => Promise<any>;
export interface IConsumerOptions {
    group: string;
    concurrency?: number;
    blockTimeout?: number;
    claimInterval?: number;
    retryLimit?: number;
    claimPageSize?: number;
    claimDeadline?: number;
}
export declare class Consumer extends EventEmitter {
    readonly id: string;
    private connection;
    private processingCount;
    private streams;
    private streamsIdMap;
    private group;
    private consuming;
    private claimScheduled;
    private claimer;
    private options;
    private processors;
    constructor(connection: ConnectionManager, options: IConsumerOptions);
    process({ stream, processor, fromId, deadline, }: {
        stream: string;
        processor: IStreamProcessor;
        fromId?: string;
        deadline?: number;
    }): Consumer;
    play(): Promise<void>;
    pause(timeout?: number): Promise<unknown>;
    private receive;
    private retry;
    private consume;
    private ensureStreamGroups;
}
