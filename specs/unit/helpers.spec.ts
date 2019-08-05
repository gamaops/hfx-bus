import { expect } from 'chai';

declare const requireUncached: any;

describe(
	'helpers',
	() => {

		let helpers: any;

		beforeEach(
			() => {

				helpers = requireUncached('@src/helpers.ts');

			},
		);

		it(
			'Should export object',
			() => {
				expect(helpers).to.be.an('object');
				expect(helpers.setErrorKind).to.be.a('function');
				expect(helpers.withValue).to.be.a('function');
				expect(helpers.HFXBUS_ID_SIZE).to.be.a('number');
			},
		);

		describe(
			'withValue',
			() => {

				it(
					'Should se a value on object',
					() => {
						
						const object: any = {};
						helpers.withValue(object, 'property', 'value');
						expect(object.property).to.be.equal('value');

					},
				);

			},
		);

		describe(
			'setErrorKind',
			() => {

				it(
					'Should set error kind',
					() => {
						
						const error: any = new Error();
						helpers.setErrorKind(error, 'MY_ERROR');
						expect(error.code).to.be.equal('MY_ERROR');
						expect(error.errno).to.be.equal('MY_ERROR');

					},
				);

			},
		);

	},
);
