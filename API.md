# HFXBus API Documentation

### Content

* [ConnectionManager](#ConnectionManager)
	* [static method standalone](#ConnectionManager+standalone) creates a ConnectionManager for standalone Redis server
	* [static method cluster](#ConnectionManager+cluster) creates a ConnectionManager for Redis Cluster
	* [method getClient](#ConnectionManager+getClient) returns a Redis client
	* [method getKeyPrefix](#ConnectionManager+getKeyPrefix) returns the defined key prefix
	* [method stop](#ConnectionManager+stop) stops all Redis clients
* [Producer](#Producer)
	* [attribute id](#Producer+id) the producer's id
	* [method listen](#Producer+listen) listen for events of streams
	* [method job](#Producer+job) creates a new job
	* [method send](#Producer+send) sends a job to stream
	* [event error](#Producer+error) emits errors
	* [event stream](#Producer+stream) emits events from streams
* [Consumer](#Consumer)
	* [attribute id](#Consumer+id) the consumer's id
	* [method process](#Consumer+process) define a process for stream
	* [method play](#Consumer+play) starts the consumer
	* [method pause](#Consumer+pause) pauses the consumer
	* [event error](#Consumer+error) emits errors
	* [event drained](#Consumer+drained) emits when there're no jobs being consumed
* [Job](#Job)
	* [attribute id](#Job+id) the job's id
	* [method prefix](#Job+prefix) prefixes a key with the job's namespace
	* [method set](#Job+set) sets value to key
	* [method push](#Job+push) pushes keys to Redis
	* [method get](#Job+get) gets value from key
	* [method del](#Job+del) deletes a key
	* [method pull](#Job+pull) pull keys from Redis
	* [decorated method finished](#Job+finished) added when a job is sent by producer
	* [decorated method reject](#Job+reject) added when a job is received by consumer
	* [decorated method resolve](#Job+resolve) added when a job is received by consumer
	* [decorated method release](#Job+release) added when a job is received by consumer

----------------------

<a name="ConnectionManager"></a>

## ConnectionManager

```typescript
import { ConnectionManager } from 'hfxbus';
const connection = new ConnectionManager({});
```

ConnectionManager implements a mapping for Redis clients, this class enables the reuse of Redis connections to multiple cases. You shouldn't instantiate this class directly, see the static methods `standalone` and `cluster`.

----------------------

<a name="ConnectionManager+standalone"></a>

### static method standalone

```typescript
const connnection = ConnectionManager.standalone(options);
```

This method creates a new instance of ConnectionManager for standalone Redis server.

**Arguments**

* **options** - All options accepted by ioredis.
* **options.enablePipelining** - Enables real Redis pipelining, the default value is `true`.

----------------------

<a name="ConnectionManager+cluster"></a>

### static method cluster

```typescript
const connnection = ConnectionManager.cluster(startupNodes, options);
```

This method creates a new instance of ConnectionManager for Redis Cluster.

**Arguments**

* **startupNodes** - Startup nodes to pass to ioredis.
* **options** - All options accepted by ioredis cluster.
* **options.enablePipelining** - Enables real Redis pipelining, the default value is `false`.

----------------------

<a name="ConnectionManager+getClient"></a>

### method getClient

```typescript
const client = connection.getClient(name);
```

This method returns a new instance of Redis clients, creating it if needed.

**Arguments**

* **name** - A string with the client's name.

----------------------

<a name="ConnectionManager+getKeyPrefix"></a>

### method getKeyPrefix

```typescript
const keyPrefix = connection.getKeyPrefix();
```

Returns the **keyPrefix** defined on ioredis configurations. The default value is `"hfxbus"`.

----------------------

<a name="ConnectionManager+stop"></a>

### method stop

```typescript
await connection.stop(options);
```

Stops all Redis clients.

**Arguments**

* **options.maxWait** - Optional number of milliseconds to wait before forcing all connections to close, if undefined (default case) it'll wait forever.
* **options.force** - Optional boolean indicating the method to force all connections to close, the default value is `false`.

----------------------

<a name="Producer"></a>

## Producer

```typescript
import { Producer } from 'hfxbus';
const producer = new Producer(connection);
```

Producer is the class that sends jobs to consumers, they can just fire and forget the jobs or await for their completion. Producers can also be passive, listening for all completions from streams.

**Arguments**

* **connection** - An instance of ConnectionManager.

----------------------

<a name="Producer+id"></a>

### attribute id

```typescript
producer.id;
```

The id of producer, this id is used to listen to pub/sub channels that consumers publishes jobs completions.

----------------------

<a name="Producer+listen"></a>

### method listen

```typescript
await producer.listen();
await producer.listen('stream');
```

This method subscribes the producer to streams channels, the first option is to call it without arguments so producer will listen only for jobs completions that it produced. The second option is to call with the streams names to listen for jobs completions, all completions of that stream will be received. You can call this method multiple times.

**Arguments**

* **...streams** - Array of streams to listen.

----------------------

<a name="Producer+send"></a>

### method send

```typescript
await producer.send(options);
```

Sends the job to the specified stream.

**Arguments**

* **options.stream** - Required string with the stream's name.
* **options.job** - Required, the job instance.
* **options.capped** - Maximum number of messages to keep in the stream, see the Redis XTRIM command to understand this options. By default, the stream won't be capped.
* **options.waitFor** - Optional boolean indicating if the **decorated method finished** must be added to job, if this parameter is false (the defaul valur) the behavior of send will be fire and forget, otherwise you can await for the job's completion. Remember to call **Producer.listen()** before sending jobs if you want to await for jobs to be finished.

----------------------

<a name="Producer+error"></a>

### event error

```typescript
producer.on('error', (error) => {});
```

Emitted when an error occurs on producer.

**Listener's Arguments**

* **error** - All errors of HFXBus have the **code** and **errno** properties indicating the error's kind.

----------------------

<a name="Producer+stream"></a>

### event stream

```typescript
producer.on('myStreamName', (jobId, error) => {});
```

If you use the method **Producer.listen** to listen to streams this event will be emitted for each completed job.

**Listener's Arguments**

* **jobId** - The ID of the completed job.
* **error** - If the job's processing caused an error this parameter will contain the error data.

----------------------

<a name="Consumer"></a>

## Consumer

```typescript
import { Consumer } from 'hfxbus';
const producer = new Consumer(connection, options);
```

Consumer is the class that process jobs from streams. Consumers can also claim stalled out jobs, see the Redis XCLAIM command to understand this behavior. Consumer's group is the group of consumers that will process Redis Streams, ensuring that only one consumer in the group will process the job.

**Arguments**

* **connection** - An instance of ConnectionManager.
* **options.group** - Required string with the consumer group name.
* **options.id** - An optional string with the consumer's ID, if not specified an ID will be generated using the nanoid package.
* **options.concurrency** - Maximum number of parallel jobs being processed by this consumer, the default value is `1`.
* **options.blockTimeout** - Number of milliseconds to block the XREADGROUP command, the default value is `5000`.
* **options.claimInterval** - Number of milliseconds schedule the claim strategy for stalled out jobs. The claim strategy in interval allows us to not overload consumers with just salled out jobs. If it's not specified the consumer will not run claim checks (this is the default).
* **options.retryLimit** - Maximum number of retries allowed per job, the default value is `3`.
* **options.claimPageSize** - Page size to iterate over XPENDING list, the default value is `100`, usually you'll not touch this parameter.
* **options.claimDeadline** - Number of milliseconds to consider a job stalled out (in the XPEDING list), the default value is `30000`.

----------------------

<a name="Consumer+id"></a>

### attribute id

```typescript
consumer.id;
```

The id of consumer, this id is used to attach the consumer to consumer groups.

----------------------

<a name="Consumer+process"></a>

### method process

```typescript
consumer.process(options);
```

Defines a processor for a stream.

**Arguments**

* **options.stream** - Required string with the stream name to be processed.
* **options.processor** - Required **async function** that receives a job and process it.
* **options.readFrom** - The ID that this consumer will use to read from this stream, see the XREADGROUP command to understand this value. The default value is `'>'`;
* **options.fromId** - The Redis Stream ID that the consumer group will start processing jobs, see the XGROUP command to understand what this ID means, the default value is `$` (only new jobs will be received).
* **options.setId** - A boolean indicating if the consumer must set the current ID of stream, see the XREADGROUP SETID command to understand this behavior, the default value is `false`.
* **options.deadline** - Optional number of milliseconds to await for the procesor to be executed (is recommended to always set this parameter), but you can se this to 0 to disable the deadline. The default value is `30000`.

----------------------

<a name="Consumer+play"></a>

### method play

```typescript
await consumer.play();
```

Starts the consumer's routine to get jobs from streams, you should call this method after defining the processors using the **Consumer.process** method.

----------------------

<a name="Consumer+pause"></a>

### method pause

```typescript
await consumer.pause(timeout);
```

Gracefuly pauses the consumer. This method should be called before calling **ConnectionManager.stop**.

**Arguments**

* **timout** - Optional number of milliseconds to await for the consumer to stop, a secure value is always something greater than the **blockTimeout** value.

----------------------

<a name="Consumer+error"></a>

### event error

```typescript
consumer.on('error', (error) => {});
```

Emitted when an error occurs on consumer.

**Listener's Arguments**

* **error** - All errors of HFXBus have the **code** and **errno** properties indicating the error's kind.

----------------------

<a name="Consumer+drained"></a>

### event drained

```typescript
consumer.on('drained', () => {});
```

Emitted when the consumer processed all jobs.

----------------------

<a name="Job"></a>

## Job

```typescript
import { Job } from 'hfxbus';
const job = new Job(client, id);
```

Job is the class representing a single unit of work to consumers, they can be 1-n to messages on streams, meaning that a job can be sent to multiple streams. Usually you'll not instantiate a job directly, using the **Producer.job** method is what you want, but this method is just a wrapper to pass the client from ConnectionManager to job.

**Arguments**

* **client** - A client generated by ConnectionManager.
* **id** - An optional string with the job's ID, if you don't specify this argument an ID will be generated using the nanoid package.

----------------------

<a name="Job+id"></a>

### attribute id

```typescript
job.id;
```

The id of job.

----------------------

<a name="Job+prefix"></a>

### method prefix

```typescript
const prefixedKey = job.prefix(key);
```

Prefixes a key with the job's namespace to generate an unique key representation.

**Arguments**

* **key** - A string to be prefixed.

----------------------

<a name="Job+set"></a>

### method set

```typescript
job.set(key, value, timeout);
```

Sets a job's property, it's just a simple key on Redis, the value can be any JSON-valid object or Buffer. The timeout is optional and defines the time in milliseconds to expire the key (see the Redis PSETEX command). The calls to this method are stacked and only flushed into Redis when you call **Job.push**.

**Arguments**

* **key** - The name of the property.
* **value** - The value of the property. If it's not a Buffer it'll be JSON encoded.
* **timeout** - An optional number of milliseconds to expire the key.

----------------------

<a name="Job+push"></a>

### method push

```typescript
await job.push();
```

Pushes all stacked **Job.set** calls into Redis.

----------------------

<a name="Job+get"></a>

### method get

```typescript
job.get(key, asBuffer);
```

Gets a job's property value from Redis (just stacks the call).

**Arguments**

* **key** - The name of the property.
* **asBuffer** - A boolean indicating that the value should be returned as a Buffer, the default value is true, otherwise the value will parsed from JSON.

----------------------

<a name="Job+del"></a>

### method del

```typescript
job.del(key);
```

Deletes a job's property value from Redis (just stacks the call).

**Arguments**

* **key** - The name of the property.

----------------------

<a name="Job+pull"></a>

### method pull

```typescript
const values = await job.pull();
```

Pulls data from Redis, executing the stacked **Job.get** and **Job.del** calls. All stacked **Job.get** calls are executed before the **Job.del** calls. The returned value is an object with the keys-values requested from the stacked **Job.get** calls.

----------------------

## Decorated Methods

Decorated methods are methods that are attached as job's addons only when the job is interacting with certain flows. They aren't bound to job's context meaning that you can move them like this:

```typescript
const decoratedMethod = job.decoratedMethod;
delete job.decoratedMethod;
// The decorated method still valid even without the job's context
decoratedMethod();
```

----------------------

<a name="Job+finished"></a>

### decorated method finished

* After the job is sent to stream using the **Producer.send** and the parameter **waitFor** was set to `true`

```typescript
await job.finished(timeout);
```

Waits for the job's completion.

**Arguments**

* **timeout** - An optional maximum number of milliseconds to wait for the job's completion before launching an error. If you don't specify this value (the default case) the method will wait forever.

----------------------

<a name="Job+release"></a>

### decorated method release

* When a job is received by a consumer

```typescript
await job.release();
```

This function will release the job sending an acknowledge to the stream. Usually you'll not call this method as this is called by **Job.resolve** and **Job.reject** methods. When this method is called the current count of processing count of this consumer will decrease leaving the consumer free to acquire a new job.

----------------------

<a name="Job+resolve"></a>

### decorated method resolve

* When a job is received by a consumer

```typescript
await job.resolve();
```

Resolves the job, usually you'll not call this method as this is called when the processor ends the processing.

----------------------

<a name="Job+reject"></a>

### decorated method reject

* When a job is received by a consumer

```typescript
await job.reject(error);
```

Rejects the job with an error, usually you'll not call this method as this is called when the processor throws an error.

**Arguments**

* **error** - An error to be passed as job's completion.