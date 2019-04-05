const crypto = require('crypto');
const util = require('util');

const randomBytes = util.promisify(crypto.randomBytes.bind(crypto));

module.exports = {
	async: async (size = 8) => {
		const buffer = await randomBytes(size);
		return buffer.toString('hex');
	},
	sync: (size = 8) => crypto.randomBytes(size).toString('hex'),
};
