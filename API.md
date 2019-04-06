# HFXBus API Documentation

### Content

* [HFXBus](#HFXBus)
	* [id](#HFXBus+id) returns the bus id
	* [listenerId](#HFXBus+listenerId) returns the listener id
	* [setListenerEmitter](#HFXBus+setListenerEmitter) set a custom event emitter for PubSub events
	* [setClientFactory](#HFXBus+setClientFactory) set the client factory (a.k.a Redis driver)
	* [getClient](#HFXBus+getClient) get a Redis client from the client factory
	* [onAwait](#HFXBus+onAwait) asynchronous listen to events
	* [onceAwait](#HFXBus+onceAwait) asynchronous listen to events
	* [listen](#HFXBus+listen) listen to PubSub events
	* [commit](#HFXBus+commit) commit a message
	* [forward](#HFXBus+forward) forward a message
	* [message](#HFXBus+message) create a new message
	* [consume](#HFXBus+consume) consume messages from streams
	* [stop](#HFXBus+stop) stop bus and clients
* [message](#message)
	* [trackerId](#message+trackerId) message's tracker id
	* [messageId](#message+messageId) message's id
	* [groupName](#message+groupName) message's group name
	* [streamName](#message+streamName) message's stream name
	* [isAcknowledged](#message+isAcknowledged) boolean indicating if the message was acknowledged
	* [isResolved](#message+isResolved) boolean indicating if the message is resolved
	* [isDead](#message+isDead) boolean indicating if the message is dead
	* [ack](#message+ack) acknowledge the message
	* [resolve](#message+resolve) resolve the message
	* [reject](#message+reject) reject the message
	* [save](#message+save) save a payload key
	* [load](#message+load) load a payload key
	* [drop](#message+drop) drop a payload key
	* [purge](#message+purge) drop all payload keys
* [Claimer](#Claimer)
	* [attachTo](#Claimer+attachTo) attach claimer to bus

----------------------

<a name="HFXBus"></a>

## HFXBus

```javascript
const HFXBus = require('hfxbus');
const bus = new HFXBus(redis, options);
```

HFXBus is an EventEmitter and represents all the bus logic implementation.

**Options**

* **redis** - This parameter is passed to Redis client factory.
* **options.namespace** - This string is used to prefix keys in Redis to avoid conflicts between applications, the default value is `'hfxbus'`.
* **options.maxParallel** - Maximum number of parallel messages being processed by consumers, the default value is `10`.
* **options.blockTimeout** - The block time for [XREADGROUP](https://redis.io/commands/xreadgroup) command, the default value is `1000`.
* **options.trimLength** - The length to trim the stream keeping the number of old messages low, the default value is `1000` you can pass `null` to keep the size of the stream unlimited.
* **options.expirationTime** - The number of milliseconds to expire message's payload keys, the default value is `10000` you can pass `null` to disable this behavior.
* **options.commitTimeout** - Number of milliseconds to time out commits, the default value is `null` (never).

----------------------

<a name="HFXBus+id"></a>

### id

This is a getter returning the unique id of the bus instance, also used as consumer name to Redis Streams.

----------------------

<a name="HFXBus+listenerId"></a>

### listenerId

This is a getter returning the unique id of the bus instance used to listen for messages, mainly used for **commit** method.

----------------------

<a name="HFXBus+setClientFactory"></a>

### setListenerEmitter

```javascript
bus.setListenerEmitter((message) => {
	// Do something with all received messages
});
```

This method sets a function to be called on every received message by **listen** and **commit** method, it's a chance to create custom bus events for example.

----------------------

<a name="HFXBus+setClientFactory"></a>

### setClientFactory

```javascript
bus.setClientFactory(HFXBus.factories.ioredis);
```

This method sets a function create Redis clients, the current implementation ships **ioredis** as optional driver, you can create your custom factory, however the interface must be the same as **ioredis**.

----------------------

<a name="HFXBus+getClient"></a>

### getClient

```javascript
const client = bus.getClient(name);
```

This method returns a Redis client identified by name. It's a simple map between client's instance name and client instance.

**Options**

* **name** - A string to identify the client instance, the default value is `'hfxbus'`.

----------------------

<a name="HFXBus+onAwait"></a>

### onAwait

```javascript
bus.onAwait('event', asyncListener);
```

This method is the async version of `on` method of EventEmitter. If the `asyncListener` fails the `'async:error'` event will be emitted.

**Options**

* **asyncListener** - An asynchronous function.

----------------------

<a name="HFXBus+onceAwait"></a>

### onceAwait

```javascript
bus.onceAwait('event', asyncListener);
```

This method is the async version of `once` method of EventEmitter. If the `asyncListener` fails the `'async:error'` event will be emitted.

**Options**

* **asyncListener** - An asynchronous function.

----------------------

<a name="HFXBus+listen"></a>

### listen

```javascript
await bus.listen(...events);
```

This method listen to events from PubSub and can be called multiple times to listen to more events as you need. When a new message is received the bus will emit an event as `${message.trackerId}:${eventName}` and will call your `listenerEmitter` (see the **setListenerEmitter** method) if it's set to any function.

**Options**

* **event.groupName** - A string to filter events by group name.
* **event.streamName** - A string to filter events by stream name.
* **event.listenerId** - A string to filter events by listener id (only events directed to this listener will be received).
* **event.eventName** - A string to filter events by event name/type, available events are: `'consumed'` and `'forwarded'`, the default value is `'consumed'`.

----------------------

<a name="HFXBus+commit"></a>

### commit

```javascript
message = await bus.commit(message, timeout);
```

This method commit a message (sends to consumer and listen for resolution or rejection). This method throws errors when the message is dead or the commit time out.

**Options**

* **message** - The message to be commited, the message **must** have all keys required by the **forward** method.
* **timeout** - An optional number of milliseconds to set the commit time out timer overriding the global option **commitTimeout** passed to the HFXBus constructor.

**Returns:**

The resolved or rejected message.

----------------------

<a name="HFXBus+forward"></a>

### forward

```javascript
await bus.forward(message);
```

This method sends a message to consumers, it's behavior is *fire and forget*. if you want to receive the resolution or rejection of the message see the **commit** method.

**Options**

* **message.replyTo** - an optional array with custom channels names to send message's events, this is used by the **commit** method to receive feedback from messages.
* **message.trackerId** - The tracker id of the message.
* **message.streamName** - String with the stream name to add the message.

----------------------

<a name="HFXBus+message"></a>

### message

```javascript
message = await bus.message({
	streamName:'ping'
});
```

This method create a new message to be forwarded or committed. A `trackerId` will be generated. The only argument is the properties that will be added to the message instance.

**Returns:**

The message decorated with "to forward" state methods.

----------------------

<a name="HFXBus+consume"></a>

### consume

```javascript
await bus.consume(groupName, streamsNames, options);
bus.onAwait(`${groupName}:${streamName}:pending`, async (message) => {
	await message.ack();
	// Do something with the message...
	if (everythingOk)
		await message.resolve();
	else
		await message.reject();
});
```

This method start consuming messages from streams. If you want to process the same message by multiple groups, you can, but it's up to you handle the feedback of multiple consumer groups, the **commit** method will receive feedback from the first consumer that resolves the message. You can use the **listen** method to achieve a way to receive multiple feedbacks.

**Options**

* **groupName** - A string with the consumer group name.
* **streamsNames** - An array of strings with the streams to consume.
* **options** - Optional object with options.
* **options.fromId** - Id to start reading from the streams, the default value is `'$'` meaning only new messages will be consumed.

----------------------

<a name="HFXBus+stop"></a>

### stop

```javascript
await bus.stop(force);
```

This method stop the bus. All PubSub listeners, consumers and clients are stopped/closed.

**Options**

* **force** - Force to stop everything, this can cause data loss, most time you want to end your consumers/listeners gracefully, the default value is `false`.