const { expect } = require('chai');
const proxyquire = require('proxyquire');
const ioredisMock = class {};
ioredisMock.Cluster = class {};
const stubs = {
	'./add-streams-to-ioredis.js':() => {},
	ioredis: ioredisMock
};
var redisFactories = proxyquire('../../lib/redis-factories.js', stubs);

describe('redisFactories', function () {

	it('export known factories', function () {

		expect(redisFactories).to.be.an('object');
		expect(redisFactories).to.have.property('ioredis').that.is.a('function');

	});

	describe('ioredis', function () {

		it('create an instance of ioredis', function () {

			expect(redisFactories.ioredis()).to.be.instanceOf(ioredisMock);
			expect(redisFactories.ioredis({})).to.be.instanceOf(ioredisMock);

		});

		it('create an instance of ioredis cluster', function () {

			expect(redisFactories.ioredis({
				nodes:[
					{host:'127.0.0.1'}
				]
			})).to.be.instanceOf(ioredisMock.Cluster);

		});

		it('thrown an error if ioredis not installed', function () {

			const {
				ioredis
			} = proxyquire('../../lib/redis-factories.js', {
				...stubs,
				ioredis: null
			});

			expect(ioredis).to.throw();

		});
		

	});

});