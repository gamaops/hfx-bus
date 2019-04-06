# HFXBus

**HFXBus** is a bus implementation for NodeJS backed by Redis Streams and PubSub.

* Focused on performance for asynchronous communication between endpoints
* Replaces Kafka, RabbitMQ and other brokers
* Support Redis Standalone or Cluster
* Support for message acknowledgement, resolution and rejection states
* Message's payload can be raw Buffer or JSON
* Claiming logic to retry and collect dead messages
* Architecture, driver and payload agnostic
* Limit the number of parallel processing done by your microservices
* Unit and integration tested

It's simple and effective to achieve high performance event-sourcing environment and microservice communication.

```bash
npm install --save hfxbus
```

----------------------

## How it works

HFXBus uses [Redis Streams](https://redis.io/topics/streams-intro) to enqueue messages and groups to consume messages, but these streams only controls the flow of messages to make the processing lighweight in networking and memory/CPU aspects. All payload is stored as regular Redis keys and it's up to your endpoints decide which keys need to be loaded/created.

[Redis PubSub](https://redis.io/topics/pubsub) is used to emit events happening to messages like when a message is **forwarded** or **consumed**, so your endpoints have feedback about messages events.

And finally, with [XTRIM](https://redis.io/commands/xtrim) you can keep your Redis server memory utilization low and with [XCLAIM](https://redis.io/commands/xclaim) improve your (micro)services redundancy/resilience.

----------------------

## Quick Start

First, setup a Redis running at `127.0.0.1:6379` (you can use [docker](https://hub.docker.com/_/redis)). And then create a **consumer.js** file with the following content:

```javascript
const HFXBus = require('hfxbus');
const bus = new HFXBus();
bus
  .setClientFactory(HFXBus.factories.ioredis)
  .on('error', (error) => console.log(error))
  .on('async:error', (error) => console.log(error))
  .onAwait(
  'healthz:ping:pending',
    async (message) => {
      await message.load('ping', { decodeJson: true, drop: true });
      console.log(`Ping received: ${message.ping.timestamp}`);
      message.pong = { timestamp: Date.now() };
      await message.save('pong', { encodeJson: true });
      await message.resolve();
    }
  );
HFXBus.Claimer
  .attachTo(
    bus
  ).consume(
    'healthz',
    ['ping']
  ).then(
    () => console.log(`Bus ${bus.id} started!`)
  ).catch(
    (error) => console.log(error)
  );
```

And another file as **committer.js**:

```javascript
const HFXBus = require('hfxbus');
const bus = new HFXBus();
bus
  .on('error', (error) => console.log(error))
  .setClientFactory(HFXBus.factories.ioredis);
setInterval(async () => {
  let message = bus.message({
    streamName: 'ping',
    ping: { timestamp: Date.now() }
  });
  await message.save('ping', { encodeJson: true });
  message = await bus.commit(message);
  await message.load('pong', { decodeJson: true, drop: true });
  console.log(`Pong received: ${message.pong.timestamp}`);
}, 5000);
```

Install [ioredis](https://github.com/luin/ioredis) to be the HFXBus Redis driver. Now just run **consumer.js** and **committer.js** and see HFXBus running.

----------------------

## API Documentation

Your can learn more about HFXBus API [clicking here](https://github.com/exocet-engineering/hfx-bus/blob/master/API.md).

----------------------

## The dream

I really would like to see HFXBus implementation in other languages (Go, Python, Java...), so if you want to contribute to this dream, we can code together, please contact me.