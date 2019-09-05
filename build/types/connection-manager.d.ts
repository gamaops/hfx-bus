import Redis, { Cluster, ClusterNode, ClusterOptions, RedisOptions } from 'ioredis';
export interface IRedisClientOptions {
    keyPrefix?: string;
    enablePipelining?: boolean;
}
export interface IRedisClient extends IRedisClientOptions {
    usedBy?: number;
    stopped?: boolean;
    boundProducers?: Set<string>;
}
export interface IRedisNodes extends IRedisClientOptions {
    nodes: Array<RedisOptions & IRedisClientOptions>;
}
export declare type RedisClient = Cluster & IRedisClient | Redis.Redis & IRedisClient;
export declare class ConnectionManager {
    static cluster(startupNodes: Array<ClusterNode>, cluster: ClusterOptions & IRedisClientOptions): ConnectionManager;
    static standalone(standalone: RedisOptions & IRedisClientOptions): ConnectionManager;
    static nodes(nodes: IRedisNodes): ConnectionManager;
    private nodes;
    private standalone;
    private cluster;
    private startupNodes;
    private clients;
    private keyPrefix;
    constructor({ standalone, cluster, startupNodes, nodes, }: {
        standalone?: RedisOptions & IRedisClientOptions;
        cluster?: ClusterOptions & IRedisClientOptions;
        startupNodes?: Array<ClusterNode>;
        nodes?: IRedisNodes;
    });
    getClientByRoute(key: string, route: string): RedisClient;
    getClients(key: string): Array<RedisClient>;
    getClient(key: string): RedisClient;
    getKeyPrefix(): string;
    stop({ maxWait, force, }?: {
        maxWait?: number;
        force?: boolean;
    }): Promise<void>;
    private addClient;
}
