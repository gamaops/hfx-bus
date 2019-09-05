"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const ioredis_1 = __importStar(require("ioredis"));
const path_1 = __importDefault(require("path"));
const crc16 = require('crc');
require('../lib/add-streams-to-ioredis')(ioredis_1.default);
const XRETRY_LUA = fs_1.default.readFileSync(path_1.default.join(__dirname, '../lib/scripts/xretry.lua')).toString();
class ConnectionManager {
    constructor({ standalone, cluster, startupNodes, nodes, }) {
        this.clients = {};
        this.keyPrefix = 'hfxbus';
        this.standalone = standalone;
        this.cluster = cluster;
        this.startupNodes = startupNodes;
        this.nodes = nodes;
        if (this.standalone) {
            this.keyPrefix = this.standalone.keyPrefix || 'hfxbus';
            Reflect.deleteProperty(this.standalone, 'keyPrefix');
        }
        else if (this.nodes) {
            this.keyPrefix = this.nodes.keyPrefix || 'hfxbus';
            Reflect.deleteProperty(this.nodes, 'keyPrefix');
        }
        else {
            this.keyPrefix = this.cluster.keyPrefix || 'hfxbus';
            Reflect.deleteProperty(this.cluster, 'keyPrefix');
        }
    }
    static cluster(startupNodes, cluster) {
        return new ConnectionManager({
            startupNodes,
            cluster: {
                enablePipelining: false,
                ...cluster,
            },
        });
    }
    static standalone(standalone) {
        return new ConnectionManager({
            standalone: {
                enablePipelining: true,
                ...standalone,
            },
        });
    }
    static nodes(nodes) {
        return new ConnectionManager({
            nodes: {
                enablePipelining: true,
                ...nodes,
            },
        });
    }
    getClientByRoute(key, route) {
        if (!this.nodes) {
            return this.getClient(key);
        }
        const index = crc16(route) % this.nodes.nodes.length;
        const clientKey = `${key}-${index}`;
        if (!(clientKey in this.clients)) {
            const client = new ioredis_1.default(this.nodes.nodes[index]);
            client.enablePipelining = this.nodes.enablePipelining;
            this.addClient(clientKey, client);
        }
        return this.clients[clientKey];
    }
    getClients(key) {
        if (!this.nodes) {
            return [this.getClient(key)];
        }
        return this.nodes.nodes.map((node, index) => {
            const clientKey = `${key}-${index}`;
            if (!(clientKey in this.clients)) {
                const client = new ioredis_1.default(node);
                client.enablePipelining = this.nodes.enablePipelining;
                this.addClient(clientKey, client);
            }
            return this.clients[clientKey];
        });
    }
    getClient(key) {
        if (!(key in this.clients)) {
            let client;
            if (this.standalone) {
                client = new ioredis_1.default(this.standalone);
                client.enablePipelining = this.standalone.enablePipelining;
            }
            else {
                client = new ioredis_1.Cluster(this.startupNodes, this.cluster);
                client.enablePipelining = this.cluster.enablePipelining;
            }
            this.addClient(key, client);
        }
        return this.clients[key];
    }
    getKeyPrefix() {
        return this.keyPrefix;
    }
    async stop({ maxWait, force, } = {}) {
        const promises = [];
        for (const key in this.clients) {
            const client = this.clients[key];
            if (client.stopped && !force) {
                continue;
            }
            client.stopped = true;
            if (force) {
                client.disconnect();
                continue;
            }
            promises.push(new Promise((resolve, reject) => {
                if (client.usedBy === 0) {
                    client.quit().then(() => resolve()).catch(reject);
                    return undefined;
                }
                let timeout = null;
                if (maxWait) {
                    timeout = setTimeout(() => {
                        client.disconnect();
                    }, maxWait);
                }
                client.once('free', () => {
                    client.quit().then(() => {
                        if (timeout) {
                            clearTimeout(timeout);
                        }
                        resolve();
                    }).catch(reject);
                }).emit('stopped');
                return undefined;
            }));
        }
        if (!force) {
            await Promise.all(promises);
        }
        this.clients = {};
    }
    addClient(key, client) {
        this.clients[key] = client;
        client.keyPrefix = this.keyPrefix;
        client.setMaxListeners(Infinity);
        client.usedBy = 0;
        client.stopped = false;
        client.defineCommand('xretry', {
            lua: XRETRY_LUA,
            numberOfKeys: 6,
        });
        client.once('close', () => {
            delete this.clients[key];
        }).on('use', () => {
            client.usedBy++;
        }).on('release', () => {
            client.usedBy--;
            if (client.usedBy === 0) {
                client.emit('free');
            }
        });
    }
}
exports.ConnectionManager = ConnectionManager;
