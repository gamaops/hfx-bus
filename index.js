const HFXBus = require('./lib/hfx-bus.js');
const Claimer = require('./lib/claimer.js');
const redisFactories = require('./lib/redis-factories.js');

HFXBus.factories = redisFactories;
HFXBus.Claimer = Claimer;

module.exports = HFXBus;