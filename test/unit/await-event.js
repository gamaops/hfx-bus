module.exports = {
	async: async (event, emitter, trigger) => {
		return new Promise((resolve, reject) => {
			try {
				emitter.once(event, (...args) => resolve(args));
				trigger().catch(reject);
			} catch (error) {
				reject(error);
			}
		})
	}
};