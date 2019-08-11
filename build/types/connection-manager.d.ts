import Redis, { Cluster, ClusterNode, ClusterOptions, RedisOptions } from 'ioredis';
export interface IRedisClientOptions {
    keyPrefix?: string;
    enablePipelining?: boolean;
}
export interface IRedisClient extends IRedisClientOptions {
    usedBy?: number;
    stopped?: boolean;
}
export declare type RedisClient = Cluster & IRedisClient | Redis.Redis & IRedisClient;
export declare class ConnectionManager {
    static cluster(startupNodes: Array<ClusterNode>, cluster: ClusterOptions & IRedisClientOptions): ConnectionManager;
    static standalone(standalone: RedisOptions & IRedisClientOptions): ConnectionManager;
    private standalone;
    private cluster;
    private startupNodes;
    private clients;
    private keyPrefix;
    constructor({ standalone, cluster, startupNodes, }: {
        standalone?: RedisOptions & IRedisClientOptions;
        cluster?: ClusterOptions & IRedisClientOptions;
        startupNodes?: Array<ClusterNode>;
    });
    getClient(key: string): RedisClient;
    getKeyPrefix(): string;
    stop({ maxWait, force, }: {
        maxWait?: number;
        force?: boolean;
    }): Promise<void>;
}
