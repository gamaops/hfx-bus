const addStreamsToIORedis = require('./add-streams-to-ioredis.js');

let IORedis = null;

try {
	IORedis = require('ioredis');
	addStreamsToIORedis(IORedis);
// eslint-disable-next-line no-empty
} catch (error) {}

function ioredis({
	host = 'localhost',
	port = 6379,
	nodes = [],
	...options
} = {}) {
	if (IORedis === null) throw new Error('Missing "ioredis" to build HFXBus');
	if (nodes.length > 0) return new IORedis.Cluster(nodes, options);
	return new IORedis(port, host, options);
}

module.exports = {
	ioredis,
};
