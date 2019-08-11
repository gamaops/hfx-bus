import { expect } from 'chai';
import sinon from 'sinon';

declare const requireUncached: any;
declare const mockUncached: any;

describe(
	'job',
	() => {

		let Job: any;
		let client: any;
		let pipeline: any;
		let nanoid: any;
		let generatedId: any;

		beforeEach(
			() => {

				pipeline = {};
				pipeline.exec = sinon.stub();

				client = {};
				client.enablePipelining = true;
				client.keyPrefix = 'keyPrefix';
				client.get = sinon.stub();
				client.getBuffer = sinon.stub();
				client.set = sinon.stub();
				client.psetex = sinon.stub();
				client.del = sinon.stub();
				client.pipeline = sinon.stub().returns(pipeline);

				generatedId = 'generatedId';
				nanoid = sinon.stub().returns(generatedId);
				mockUncached('nanoid', nanoid);

				Job = requireUncached('@src/job.ts');

			},
		);

		it(
			'Should export object',
			() => {
				expect(Job).to.be.an('object');
				expect(Job.Job).to.be.a('function');
			},
		);

		describe(
			'Job',
			() => {

				it(
					'Should create a new instance',
					() => {

						let job;
						job = new Job.Job(client);

						let callArgs: any;

						sinon.assert.calledOnce(nanoid);
						callArgs = nanoid.getCall(0).args;
						expect(callArgs[0]).to.be.equal(16);

						expect(job.id).to.be.equal(generatedId);

						const localId = Symbol();

						job = new Job.Job(client, localId);

						expect(job.id).to.be.equal(localId);

					},
				);

			},
		);

		describe(
			'Job.prefix',
			() => {

				it(
					'Should create prefix a key',
					() => {

						let job;
						job = new Job.Job(client, 'id');

						expect(job.prefix('key')).to.be.equal('keyPrefix:job:id:key');

					},
				);

			},
		);

		describe(
			'Job.del',
			() => {

				it(
					'Should create add del command to stack',
					() => {

						let job;
						job = new Job.Job(client);

						expect(job.del('key')).to.be.equal(job);

					},
				);

			},
		);

		describe(
			'Job.set',
			() => {

				it(
					'Should create add set command to stack',
					() => {

						let job;
						job = new Job.Job(client);

						expect(job.set('key', 'value')).to.be.equal(job);
						expect(job.set('key', 'value', 123)).to.be.equal(job);
						expect(job.set('key', Buffer.from('value'))).to.be.equal(job);

					},
				);

			},
		);

		describe(
			'Job.get',
			() => {

				it(
					'Should create add get command to stack',
					() => {

						let job;
						job = new Job.Job(client);

						expect(job.get('key')).to.be.equal(job);
						expect(job.get('key', false)).to.be.equal(job);

					},
				);

			},
		);

		describe(
			'Job.push',
			() => {

				it(
					'Shouldn\'t push commands if the stack is empty',
					async () => {

						let job;
						job = new Job.Job(client);

						await job.push();

						sinon.assert.notCalled(client.pipeline);

					},
				);

				it(
					'Should push commands using pipeline',
					async () => {

						let job;
						job = new Job.Job(client);

						job.set('key', 'value');
						job.set('key', 'value', 123);
						job.set('key', Buffer.from('value'));

						await job.push();

						let callArgs: any;

						sinon.assert.calledOnce(client.pipeline);
						callArgs = client.pipeline.getCall(0).args;
						expect(callArgs[0]).to.be.an('array');

						expect(callArgs[0][0]).to.be.an('array');
						expect(callArgs[0][0][0]).to.be.equal('set');
						expect(callArgs[0][0][1]).to.be.equal(job.prefix('key'));
						expect(callArgs[0][0][2]).to.be.equal('"value"');

						expect(callArgs[0][1]).to.be.an('array');
						expect(callArgs[0][1][0]).to.be.equal('psetex');
						expect(callArgs[0][1][1]).to.be.equal(job.prefix('key'));
						expect(callArgs[0][1][2]).to.be.equal(123);
						expect(callArgs[0][1][3]).to.be.equal('"value"');

						expect(callArgs[0][2]).to.be.an('array');
						expect(callArgs[0][2][0]).to.be.equal('set');
						expect(callArgs[0][2][1]).to.be.equal(job.prefix('key'));
						expect(callArgs[0][2][2]).to.be.instanceOf(Buffer);

						sinon.assert.calledOnce(pipeline.exec);

					},
				);

				it(
					'Should push commands using commands',
					async () => {

						client.enablePipelining = false;

						let job;
						job = new Job.Job(client);

						job.set('key', 'value');
						job.set('key', 'value', 123);
						job.set('key', Buffer.from('value'));

						await job.push();

						let callArgs: any;

						sinon.assert.calledTwice(client.set);
						callArgs = client.set.getCall(0).args;

						expect(callArgs[0]).to.be.equal(job.prefix('key'));
						expect(callArgs[1]).to.be.equal('"value"');

						callArgs = client.set.getCall(1).args;

						expect(callArgs[0]).to.be.equal(job.prefix('key'));
						expect(callArgs[1]).to.be.instanceOf(Buffer);

						sinon.assert.calledOnce(client.psetex);
						callArgs = client.psetex.getCall(0).args;

						expect(callArgs[0]).to.be.equal(job.prefix('key'));
						expect(callArgs[1]).to.be.equal(123);
						expect(callArgs[2]).to.be.equal('"value"');

					},
				);

			},
		);

		describe(
			'Job.pull',
			() => {

				it(
					'Shouldn\'t pull data if the stack is empty',
					async () => {

						let job;
						job = new Job.Job(client);

						await job.pull();

						sinon.assert.notCalled(client.pipeline);

					},
				);

				it(
					'Should pull commands using pipeline',
					async () => {

						let job;
						job = new Job.Job(client);

						job.get('key1');
						job.get('key2', false);
						job.del('key3');

						pipeline.exec.returns([
							[null, Buffer.from('value')],
							[null, '"value"'],
						]);

						const data = await job.pull();

						expect(data.key1).to.be.instanceOf(Buffer);
						expect(data.key2).to.be.equal('value');

						let callArgs: any;

						sinon.assert.calledOnce(client.pipeline);
						callArgs = client.pipeline.getCall(0).args;

						expect(callArgs[0]).to.be.an('array');

						expect(callArgs[0][0]).to.be.an('array');
						expect(callArgs[0][0][0]).to.be.equal('getBuffer');
						expect(callArgs[0][0][1]).to.be.equal(job.prefix('key1'));

						expect(callArgs[0][1]).to.be.an('array');
						expect(callArgs[0][1][0]).to.be.equal('get');
						expect(callArgs[0][1][1]).to.be.equal(job.prefix('key2'));

						expect(callArgs[0][2]).to.be.an('array');
						expect(callArgs[0][2][0]).to.be.equal('del');
						expect(callArgs[0][2][1]).to.be.equal(job.prefix('key3'));

						sinon.assert.calledOnce(pipeline.exec);

					},
				);

				it(
					'Should pull commands using commands',
					async () => {

						client.enablePipelining = false;

						let job;
						job = new Job.Job(client);

						job.get('key1');
						job.get('key2', false);
						job.del('key3');

						client.getBuffer.returns(Buffer.from('value'));
						client.get.returns('"value"');

						const data = await job.pull();

						expect(data.key1).to.be.instanceOf(Buffer);
						expect(data.key2).to.be.equal('value');

						let callArgs: any;

						sinon.assert.calledOnce(client.getBuffer);
						callArgs = client.getBuffer.getCall(0).args;

						expect(callArgs[0]).to.be.equal(job.prefix('key1'));

						sinon.assert.calledOnce(client.get);
						callArgs = client.get.getCall(0).args;

						expect(callArgs[0]).to.be.equal(job.prefix('key2'));

						sinon.assert.calledOnce(client.del);
						callArgs = client.del.getCall(0).args;

						expect(callArgs[0]).to.be.equal(job.prefix('key3'));

					},
				);

			},
		);

	},
);
