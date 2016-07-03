import debugLib from 'debug';

const debug = debugLib('azure-awesome-queue:LockRenewer');

class LockRenewer {
  constructor (serviceBusService, ms) {
    this._messages = [];

    this._serviceBusService = serviceBusService;
    setInterval(this._tick.bind(this), ms);
  }

  addMessage (message) {
    debug('Adding message', message);
    this._messages.push(message);
  }

  removeMessage (message) {
    debug('Removing message', message);
    const index = this._messages.indexOf(message);
    if (index === -1) {
      throw new Error('Tried to remove a message from having its locked renewed, but we couldn\'t find it');
    }

    this._messages.splice(index, 1);
  }

  _renewLock (message) {
    this._serviceBusService.renewLockForMessage(message, function (err) {
      if (err) {
        console.error('Error renewing lock for message', message);
      }
    });
  }

  _tick () {
    debug(`Renewing locks for ${this._messages.length} messages`);
    this._messages.forEach((message) => {
      this._renewLock(message);
    });
  }
}

export default LockRenewer;
