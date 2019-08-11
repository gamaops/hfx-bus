import { expect } from 'chai';
import sinon from 'sinon';

declare const requireUncached: any;
declare const mockUncached: any;

describe(
	'connection-manager',
	() => {

		let ConnectionManager: any;
		let Redis: any;
		let redis: any;
		let cluster: any;
		let addStreamsToIoredis: any;
		let fs: any;

		beforeEach(
			() => {

				redis = {};
				redis.setMaxListener = sinon.stub();
				redis.emit = sinon.stub();
				redis.defineCommand = sinon.stub();
				redis.disconnect = sinon.stub();
				redis.quit = sinon.stub().resolves();
				redis.once = sinon.stub().returns(redis);
				redis.on = sinon.stub().returns(redis);

				cluster = {};
				cluster.setMaxListener = sinon.stub();
				cluster.emit = sinon.stub();
				cluster.defineCommand = sinon.stub();
				cluster.disconnect = sinon.stub();
				cluster.quit = sinon.stub().resolves();
				cluster.once = sinon.stub().returns(cluster);
				cluster.on = sinon.stub().returns(cluster);

				Redis = sinon.stub().returns(redis);
				Redis.Cluster = sinon.stub().returns(cluster);

				fs = {};
				fs.readFileSync = sinon.stub().returns(Buffer.from('lua script'));

				addStreamsToIoredis = sinon.stub();

				mockUncached('fs', fs);
				mockUncached('ioredis', Redis);
				mockUncached('@lib/add-streams-to-ioredis.js', addStreamsToIoredis);

				ConnectionManager = requireUncached('@src/connection-manager.ts');

			},
		);

		it(
			'Should export object',
			() => {
				expect(ConnectionManager).to.be.an('object');
				expect(ConnectionManager.ConnectionManager).to.be.a('function');
			},
		);

	},
);
