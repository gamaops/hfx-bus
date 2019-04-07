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

----------------------

<a name="message"></a>

## message

Messages generated from HFXBus are just objects with some properties and methods, there is no real "Message class".

----------------------

<a name="message+trackerId"></a>

### trackerId

The tracker id is the string used to track the message through the flow of exchanging it. It does not changes as opposed to message id. It can be generated by HFXBus **message** method.

----------------------

<a name="message+messageId"></a>

### messageId

The message id is the string used to identify the message where it's in the flow, it's renewed everytime when **forward** or **commit** methods are called.

----------------------

<a name="message+groupName"></a>

### groupName

The consumer group name that received or consumed the message, this field is not present in brand new generated messages as they're not consumed or forwarded.

----------------------

<a name="message+streamName"></a>

### streamName

The stream name that received or consumed the message, this field is not present in brand new generated messages as they're not consumed or forwarded.

----------------------

<a name="message+isAcknowledged"></a>

### isAcknowledged

This field is a boolean indicating if the message was acknowledged, this field is present only for consumers.

----------------------

<a name="message+isResolved"></a>

### isResolved

This field is not present in brand new generated messages as they're not consumed or forwarded. The value of this field can be:

* `null` - The state of the message is unknown
* `HFXBus.STATUS_REJECTED` - The message was rejected by consumer.
* `HFXBus.STATUS_RESOLVED` - The message was resolved by consumer.

----------------------

<a name="message+isDead"></a>

### isDead

This field is a boolean indicating if the message is dead meaning that a claimer killed this message for some reasong (e.g. maximum retries). This field is only present for received messages by committers/listeners.

----------------------

<a name="message+ack"></a>

### ack

```javascript
await message.ack(unsafe);
```

This method is present only for consumers and mark message as acknowledged. It's really important to acknowledge message as they will be unavaible to be claimed by other consumers. You can leave to **resolve** or **reject** method to acknowledge the message to you, but you'll have to plan carefully your **pendingTimeout** value of claimers. Usually the first thing you're going to do in your consumer is call this method.

**Options**

* **unsafe** - This boolean releases the slot occupied (controlled by the **maxParallel** option of HFXBus) by the message in your consumer before sending the XACK command to redis, the default value is `false`.

----------------------

<a name="message+resolve"></a>

### resolve

```javascript
await message.resolve(unsafe);
```

This method is present only for consumers and resolves the message sending feedback to committers/listeners. If the message is not acknowledged it'll acknowledge the message.

**Options**

* **unsafe** - See the **ack** method.

----------------------

<a name="message+reject"></a>

### reject

```javascript
await message.reject(unsafe);
```

This method is present only for consumers and rejects the message sending feedback to committers/listeners. If the message is not acknowledged it'll acknowledge the message.

**Options**

* **unsafe** - See the **ack** method.

----------------------

<a name="message+save"></a>

### save

```javascript
message[key] = value;
await message.save(key, options);
```

This method saves a payload key into your message (a key in Redis is created to store data). The **value** can be a Buffer or JavaScript type (e.g. Object, Array...). Take care with the **key** name as it can override the HFXBus messages properties.

**Options**

* **key** - A string with the payload identifier, the default value is `'payload'`.
* **options.encodeJson** - If the value is an JavaScript type, specify this option as `true` so this method will encode the type to be saved in Redis, the default value is `false` that means that the value is a Buffer.
* **options.expirationTime** - This overrides the default **expirationTime** passed to HFXBus constructor and set the payload key expiration time in Redis, this prevents payloads to stuck in Redis from lost messages, the default value is `null`.

----------------------

<a name="message+load"></a>

### load

```javascript
await message.load(key, options);
console.log(message[key])
```

This method loads a payload key from Redis.

**Options**

* **key** - A string with the payload identifier, the default value is `'payload'`.
* **options.decodeJson** - If the value is an JavaScript type, specify this option as `true` so this method will decode the type saved in Redis, the default value is `false` that means that the value is a Buffer.
* **options.drop** - Removes the payload from Redis, the default value is `false`.
* **options.strictDefined** - Thrown an error if the key is not defined or just return `undefined`, the default value is `true` (it's going to throw).

----------------------

<a name="message+drop"></a>

### drop

```javascript
await message.drop(...keys);
```

This method removes payloads from Redis.

**Options**

* **key** - A string with the payload identifier, the default value is `'payload'`.

----------------------

<a name="message+purge"></a>

### purge

```javascript
await message.purge(options);
```

This method removes **all** message's payloads from Redis.

**Options**

* **options.individually** - Remove each key individually, it's useful when you're using Redis Cluster, the default value is `false`.

----------------------

<a name="Claimer"></a>

## Claimer

```javascript
const HFXBus = require('hfxbus');
HFXBus.Claimer;
```

Claimer is an **optional** feature from HFXBus. The purpose of this feature is to ensure that dead consumers or dangling messages are handled properly. The Claimer will look for messages without acknowledgement and claim to another consumer. Dangling messages are messages that stuck and we're claimed many times, the behavior here is to kill the message telling to committers/listeners that the message was killed by the **isDead** property.

----------------------

<a name="Claimer+attachTo"></a>

### attachTo

```javascript
HFXBus.Claimer.attachTo(bus);
```

Attaches a claimer to HFXBus instance. If you want to use the Claimer, this **must** be done before any **consume** method call.

**Options**

* **options.verifyInterval** - Number of milliseconds to run the claimer verify logic, checking if there are stuck messages, the default value is `15000`.
* **options.maxRetries** - Maximum number of retries to claim a message before killing it the default value is `3`.
* **options.pendingCount** - The number of pending messages to check on each verify interval, the default value is `500`.
* **options.pendingTimeout** - Number of milliseconds that a message can keep unacknowledged before the claimer claims the message to other consumer, the default value is `15000`.