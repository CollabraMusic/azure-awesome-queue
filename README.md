# Azure Awesome Queue

Continuously listen for messages from Azure ServiceBus queues, and limit the number of messages that are being processed at a time. You can also send messages using this library; however, it's a thin facade over the Microsoft approach.

## Rationale

At the time that this was written, Microsoft has two approaches for interacting with their ServiceBus queues: a REST API and AMQP 1.0. I wanted a way to receive messages from the queue continually, process the messages for any length of time, and limit the number of concurrent messages being processed at any point in time.
 
The requirement to be able to process a message for any length of time eliminated the possibility of using AMQP 1.0 interface. There is nothing in the spec that supports this use-case, and it's up to the 'vendor' to decide how this would be implemented. Microsoft has no documented method of renewing a lock for a message if you're using AMQP, so I gave up on this approach.
 
The REST API offers the ability to use peek locks, and then be able to renew the locks whenever you need. The REST API also offers the poorly documented method of receiving messages using long-polling, so as soon as a message is put on the queue you can "immediately" begin processing the message. This library utilizes the REST API to allow you to setup a message handler that is called whenever a message hits the queue, and it automatically renews the lock for the message  while you're processing it. 


## Usage

### Install via NPM
`npm install azure-awesome-queue`

### Instantiate your Queue
```
import Queue from 'azure-awesome-queue';

const queue = new Queue({
  accessKey: 'Service bus access key',
  queueName: 'Service bus queue name',
  lockTimeout: 10000, //in milliseconds
  messagesLimit: 5
});
```

### Listen for Messages
```
queue.onReceive(async (err, message) => {
  if (err) { return console.error(err); }

  await processMessage(message);
});
```

### Send Messages
```
queue.send({
  awesome: true
});
```
