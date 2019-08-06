import { expect } from 'chai';
import sinon from 'sinon';

declare const requireUncached: any;
declare const mockUncached: any;

describe(
	'StateRepository',
	() => {

		let Job: any;
		let State: any;
		let state: any;
		let idGenerator: any;
		let generatedId: any;

		beforeEach(
			() => {

				generatedId = Symbol();
				idGenerator = sinon.stub().returns(generatedId);

				state = {};
				state.assets = sinon.stub().returns(state);
				state.inbound = sinon.stub().returns(state);

				State = sinon.stub().returns(state);

				mockUncached('@src/state.ts', State);

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
			'create',
			() => {

				it(
					'Should create a new state',
					async () => {

						const repository = new StateRepository({idGenerator});
						const assets = Symbol();
						const inbound = Symbol();

						await repository.create(
							assets,
							inbound,
						);

						let callArgs: any;

						sinon.assert.calledOnce(idGenerator);
						callArgs = idGenerator.getCall(0).args;
						expect(callArgs[0]).to.be.equal(assets);
						expect(callArgs[1]).to.be.equal(inbound);

						sinon.assert.calledOnce(State);
						callArgs = State.getCall(0).args;
						expect(callArgs[0]).to.be.equal(generatedId);
						expect(callArgs[1]).to.be.equal(repository);

						sinon.assert.calledOnce(state.assets);
						callArgs = state.assets.getCall(0).args;
						expect(callArgs[0]).to.be.equal(assets);

						sinon.assert.calledOnce(state.inbound);
						callArgs = state.inbound.getCall(0).args;
						expect(callArgs[0]).to.be.equal(inbound);
						expect(callArgs[1]).to.be.false;

					},
				);

				it(
					'Should create a new state (with default id generator)',
					async () => {

						const repository = new StateRepository();
						const assets = Symbol();
						const inbound = Symbol();

						await repository.create(
							assets,
							inbound,
						);

						let callArgs: any;

						sinon.assert.calledOnce(State);
						callArgs = State.getCall(0).args;
						expect(callArgs[0]).to.be.a('string');
						expect(callArgs[1]).to.be.equal(repository);

						sinon.assert.calledOnce(state.assets);
						callArgs = state.assets.getCall(0).args;
						expect(callArgs[0]).to.be.equal(assets);

						sinon.assert.calledOnce(state.inbound);
						callArgs = state.inbound.getCall(0).args;
						expect(callArgs[0]).to.be.equal(inbound);
						expect(callArgs[1]).to.be.false;

					},
				);

			},
		);

		describe(
			'persist',
			() => {

				it(
					'Should persist a state',
					async () => {

						const repository = new StateRepository();
						const stateMock = {
							id: Symbol(),
						};

						expect(await repository.persist(stateMock)).to.be.equal(stateMock);

					},
				);

			},
		);

		describe(
			'retrieve',
			() => {

				it(
					'Should return undefined for unknown state id',
					async () => {

						const repository = new StateRepository();
						const stateMock = {
							id: Symbol(),
						};

						await repository.persist(stateMock);
						expect(await repository.retrieve(Symbol())).to.be.undefined;

					},
				);

				it(
					'Should return state for known state id',
					async () => {

						const repository = new StateRepository();
						const stateMock = {
							id: Symbol(),
						};

						await repository.persist(stateMock);
						expect(await repository.retrieve(stateMock.id)).to.be.equal(stateMock);

					},
				);

			},
		);

		describe(
			'exists',
			() => {

				it(
					'Should return false for unknown state id',
					async () => {

						const repository = new StateRepository();
						const stateMock = {
							id: Symbol(),
						};

						await repository.persist(stateMock);
						expect(await repository.exists(Symbol())).to.be.false;

					},
				);

				it(
					'Should return true for known state id',
					async () => {

						const repository = new StateRepository();
						const stateMock = {
							id: Symbol(),
						};

						await repository.persist(stateMock);
						expect(await repository.exists(stateMock.id)).to.be.true;

					},
				);

			},
		);

	},
);
