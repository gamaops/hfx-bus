const { expect } = require('chai');
const errors = require('../../lib/errors.js');

describe('errors', function () {

	it('export errors', function () {

		expect(errors).to.be.an('object');
		expect(errors).to.have.property('MessageListenerError').that.is.a('function');
		expect(errors).to.have.property('ConsumerError').that.is.a('function');
		expect(errors).to.have.property('ClaimerVerifyError').that.is.a('function');
		expect(errors).to.have.property('MessageTimeoutError').that.is.a('function');

	});

	it('MessageListenerError to have data', function () {

		const data = {k1:true};
		const error = new errors.MessageListenerError(
			'hello',
			data
		);
		expect(error).to.be.instanceOf(errors.MessageListenerError);
		expect(error.message).to.be.equal('hello');
		expect(error.data).to.be.equal(data);

	});

	it('MessageListenerError to have default data', function () {

		const error = new errors.MessageListenerError(
			'hello'
		);
		expect(error).to.be.instanceOf(errors.MessageListenerError);
		expect(error.message).to.be.equal('hello');
		expect(error.data).to.be.an('object');

	});

	it('ConsumerError to have data', function () {

		const data = {k1:true};
		const error = new errors.ConsumerError(
			'hello',
			data
		);
		expect(error).to.be.instanceOf(errors.ConsumerError);
		expect(error.message).to.be.equal('hello');
		expect(error.data).to.be.equal(data);

	});

	it('ConsumerError to have default data', function () {

		const error = new errors.ConsumerError(
			'hello'
		);
		expect(error).to.be.instanceOf(errors.ConsumerError);
		expect(error.message).to.be.equal('hello');
		expect(error.data).to.be.an('object');

	});

	it('ClaimerVerifyError to have data', function () {

		const data = {k1:true};
		const error = new errors.ClaimerVerifyError(
			'hello',
			data
		);
		expect(error).to.be.instanceOf(errors.ClaimerVerifyError);
		expect(error.message).to.be.equal('hello');
		expect(error.data).to.be.equal(data);

	});

	it('ClaimerVerifyError to have default data', function () {

		const error = new errors.ClaimerVerifyError(
			'hello'
		);
		expect(error).to.be.instanceOf(errors.ClaimerVerifyError);
		expect(error.message).to.be.equal('hello');
		expect(error.data).to.be.an('object');

	});

	it('MessageTimeoutError to have data', function () {

		const data = {k1:true};
		const error = new errors.MessageTimeoutError(
			'hello',
			data
		);
		expect(error).to.be.instanceOf(errors.MessageTimeoutError);
		expect(error.message).to.be.equal('hello');
		expect(error.data).to.be.equal(data);

	});

	it('MessageTimeoutError to have default data', function () {

		const error = new errors.MessageTimeoutError(
			'hello'
		);
		expect(error).to.be.instanceOf(errors.MessageTimeoutError);
		expect(error.message).to.be.equal('hello');
		expect(error.data).to.be.an('object');

	});

});