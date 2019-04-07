class MessageListenerError extends Error {
	constructor(message, data = {}) {
		super(message);
		this.data = data;
	}
}

class ConsumerError extends Error {
	constructor(message, data = {}) {
		super(message);
		this.data = data;
	}
}

class ClaimerVerifyError extends Error {
	constructor(message, data = {}) {
		super(message);
		this.data = data;
	}
}

class MessageTimeoutError extends Error {
	constructor(message, data = {}) {
		super(message);
		this.data = data;
	}
}

class DeadMessageError extends Error {
	constructor(message, data = {}) {
		super(message);
		this.data = data;
	}
}

class UndefinedPayloadError extends Error {
	constructor(message, data = {}) {
		super(message);
		this.data = data;
	}
}

module.exports = {
	MessageListenerError,
	ConsumerError,
	ClaimerVerifyError,
	MessageTimeoutError,
	DeadMessageError,
	UndefinedPayloadError
};
