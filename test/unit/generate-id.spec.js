const { expect } = require('chai');
const generateId = require('../../lib/generate-id.js');

describe('generateId', function () {

	it('export sync and async', function () {

		expect(generateId).to.be.an('object');
		expect(generateId).to.have.property('sync').that.is.a('function');
		expect(generateId).to.have.property('async').that.is.a('function');

	});

	it('sync generate id', function () {

		expect(generateId.sync()).to.be.a('string').that.lengthOf(16);
		expect(generateId.sync(16)).to.be.a('string').that.lengthOf(32);

	});

	it('async generate id', function (done) {

		generateId.async().then(
			(id) => {
				try {
					expect(id).to.be.a('string').that.lengthOf(16);
					return generateId.async(16);
				} catch (error) {
					done(error);
				}
			}
		).then(
			(id) => {
				try {
					expect(id).to.be.a('string').that.lengthOf(32);
					done()
				} catch (error) {
					done(error);
				}
			}
		).catch(done);

	});

});