import azure from 'azure';
import debugLib from 'debug';
import LockRenewer from './LockRenewer';
import Promise from 'any-promise';

const debug = debugLib('azure-awesome-queue:Queue');

class Queue {
  constructor ({accessKey, queueName, lockTimeout, messagesLimit}) {
    this._queueName = queueName;
    this._lockTimeout = lockTimeout;
    this._messagesLimit = messagesLimit;
    this._messagesCount = 0;

    this._serviceBusService = azure.createServiceBusService(accessKey);

    const retryOperations = new azure.ExponentialRetryPolicyFilter();
    this._autoRetryingServiceBusService = azure.createServiceBusService(accessKey).withFilter(retryOperations);
  }

  send (message) {
    debug('Send message', message);
    return new Promise((resolve, reject) => {
      this._autoRetryingServiceBusService.sendQueueMessage(this._queueName, JSON.stringify(message), function (err) {
        if (err) {
          return reject(err);
        }

        return resolve();
      });
    });
  }

  onReceive (callback) {
    debug('onReceive registered');
    if (this._onReceiveCallback) {
      throw new Error('A single subscriber is supported at this time');
    }

    const renewalDuration = this._lockTimeout / 3;
    debug(`Creating lock renewer with timeout ${renewalDuration} ms`);

    this._lockRenewer = new LockRenewer(this._serviceBusService, renewalDuration);
    this._onReceiveCallback = callback;

    this._receive();
  }

  _keepLockDuring (message, fn) {
    this._lockRenewer.addMessage(message);
    return fn()
      .then(() => {
        this._lockRenewer.removeMessage(message);
      })
      .catch((err) => {
        this._lockRenewer.removeMessage(message);

        // propagating the error after removing the lock renewal message
        return Promise.reject(err);
      });
  }


  _receive () {

    //long poll for 230 seconds, the docs say we can do 24 days but I'm seeing a forced timeout at 4 minutes
    const timeOut = 230;

    debug('Calling receiveQueueMessage to begin our long-polling');
    // the receiveQueueMessage implements long-polling, so we start another long-poll to get more messages
    this._autoRetryingServiceBusService.receiveQueueMessage(this._queueName, { timeoutIntervalInS: timeOut, isPeekLock: true }, async (err, lockedMessage) => {
      // azure likes to treat not having messages as an error
      if (err === 'No messages to receive') {
        debug('No message, call to receiveQueueMessage timed out. Immediately receiving new messages');
        setImmediate(this._receive.bind(this), 0);
        return;
      }

      this._messagesCount += 1;
      debug(`Received new message, messages count: ${this._messagesCount}`);

      // if we're below the limit, we'll start listening for new messages immediately
      const immediatelyReceiveNewMessages = !this._messagesLimit || this._messagesCount < this._messagesLimit;
      if (immediatelyReceiveNewMessages) {
        debug('Immediately receiving new messages');
        setImmediate(this._receive.bind(this), 0);
      }

      await this._processMessage(err, lockedMessage);
      this._messagesCount -= 1;

      // if we didn't immediately receive new messages, it's because
      // we were over our limit so we're gonna do so now
      if (!immediatelyReceiveNewMessages) {
        debug('Receiving more messages because of the completion of a message being processed');
        setImmediate(this._receive.bind(this), 0);
      }
    });
  }

  async _processMessage (err, lockedMessage) {
    // legitimate error, gonna propagate it to our callback
    if (err) {
      return this._onReceiveCallback(err);
    }

    debug(`Received message on queue '${this._queueName}'`, lockedMessage);

    const messageBody = JSON.parse(lockedMessage.body);

    return this._keepLockDuring(lockedMessage, this._onReceiveCallback.bind(this, null, messageBody))
      .then(() => {
        debug(`Deleting message from queue '${this._queueName}'`);
        this._autoRetryingServiceBusService.deleteMessage(lockedMessage, function (err) {
          if (err) {
            console.error('Error deleting message', err);
          }
        });
      })
      .catch((err) => {
        let stack;
        if (err && err.stack) {
          stack = err.stack.split("\n");
        }

        console.error('Error processing message', err, stack);
      });
  }

}

export default Queue;
