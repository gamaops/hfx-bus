# HFXBus API Documentation

### Content

* [ConnectionManager](#ConnectionManager)
	* [static method standalone](#ConnectionManager+standalone) creates a ConnectionManager for standalone Redis server
	* [static method cluster](#ConnectionManager+cluster) creates a ConnectionManager for Redis Cluster
	* [method getClient](#ConnectionManager+getClient) returns a Redis client
	* [method getKeyPrefix](#ConnectionManager+getKeyPrefix) returns the defined key prefix
	* [method stop](#ConnectionManager+stop) stops all Redis clients
* [Producer](#Producer)
	* [static attribute id](#Producer+id) the producer's id
	* [method listen](#Producer+listen) listen for events of streams
	* [method job](#Producer+job) creates a new job
	* [method send](#Producer+send) sends a job to stream
	* [event error](#Producer+error) emits errors
	* [event stream](#Producer+stream) emits events from streams
* [Consumer](#Consumer)
	* [static attribute id](#Consumer+id) the consumer's id
	* [method process](#Consumer+process) define a process for stream
	* [method play](#Consumer+play) starts the consumer
	* [method pause](#Consumer+pause) pauses the consumer
	* [event error](#Consumer+error) emits errors
	* [event drained](#Consumer+drained) emits when there're no jobs being consumed
* [Job](#Job)
	* [static attribute id](#Job+id) the job's id
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
