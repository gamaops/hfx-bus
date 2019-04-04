var IORedis = null;

try {
	IORedis = require.main.require('ioredis');
} catch (error) {}

function ioredis ({
	host = 'localhost',
	port = 6379,
	nodes = [],
	...options
} = {}) {
	if (IORedis === null)
		throw new Error(`Missing "ioredis" to build HFXBus`);
	if (nodes.length > 0)
		return new IORedis.Cluster(nodes, options);
	return new IORedis(port, host, options);
};

module.exports = {
	ioredis
};