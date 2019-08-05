const mock = require('mock-require');

global.restoreModule = (modulePath) => {
	delete require.cache[require.resolve(modulePath)];
	const exportedModule = require(modulePath);
	mock(require.resolve(modulePath), exportedModule);
};

global.requireUncached = (modulePath) => {
	delete require.cache[require.resolve(modulePath)];
	return require(modulePath);
};

global.mockUncached = (modulePath, exportedModule) => {
	delete require.cache[require.resolve(modulePath)];
	mock(require.resolve(modulePath), exportedModule);
};