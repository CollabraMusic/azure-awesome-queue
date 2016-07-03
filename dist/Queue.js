'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _azure = require('azure');

var _azure2 = _interopRequireDefault(_azure);

var _debug = require('debug');

var _debug2 = _interopRequireDefault(_debug);

var _LockRenewer = require('./LockRenewer');

var _LockRenewer2 = _interopRequireDefault(_LockRenewer);

var _anyPromise = require('any-promise');

var _anyPromise2 = _interopRequireDefault(_anyPromise);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new _anyPromise2.default(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return _anyPromise2.default.resolve(value).then(function (value) { return step("next", value); }, function (err) { return step("throw", err); }); } } return step("next"); }); }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var debug = (0, _debug2.default)('azure-awesome-queue:Queue');

var Queue = function () {
  function Queue(_ref) {
    var accessKey = _ref.accessKey;
    var queueName = _ref.queueName;
    var lockTimeout = _ref.lockTimeout;
    var messagesLimit = _ref.messagesLimit;

    _classCallCheck(this, Queue);

    this._queueName = queueName;
    this._lockTimeout = lockTimeout;
    this._messagesLimit = messagesLimit;
    this._messagesCount = 0;

    this._serviceBusService = _azure2.default.createServiceBusService(accessKey);

    var retryOperations = new _azure2.default.ExponentialRetryPolicyFilter();
    this._autoRetryingServiceBusService = _azure2.default.createServiceBusService(accessKey).withFilter(retryOperations);
  }

  _createClass(Queue, [{
    key: 'send',
    value: function send(message) {
      var _this = this;

      debug('Send message', message);
      return new _anyPromise2.default(function (resolve, reject) {
        _this._autoRetryingServiceBusService.sendQueueMessage(_this._queueName, JSON.stringify(message), function (err) {
          if (err) {
            return reject(err);
          }

          return resolve();
        });
      });
    }
  }, {
    key: 'onReceive',
    value: function onReceive(callback) {
      debug('onReceive registered');
      if (this._onReceiveCallback) {
        throw new Error('A single subscriber is supported at this time');
      }

      var renewalDuration = this._lockTimeout / 3;
      debug('Creating lock renewer with timeout ' + renewalDuration + ' ms');

      this._lockRenewer = new _LockRenewer2.default(this._serviceBusService, renewalDuration);
      this._onReceiveCallback = callback;

      this._receive();
    }
  }, {
    key: '_keepLockDuring',
    value: function _keepLockDuring(message, fn) {
      var _this2 = this;

      this._lockRenewer.addMessage(message);
      return fn().then(function () {
        _this2._lockRenewer.removeMessage(message);
      }).catch(function (err) {
        _this2._lockRenewer.removeMessage(message);

        // propagating the error after removing the lock renewal message
        return _anyPromise2.default.reject(err);
      });
    }
  }, {
    key: '_receive',
    value: function _receive() {
      var _this3 = this;

      //long poll for 230 seconds, the docs say we can do 24 days but I'm seeing a forced timeout at 4 minutes
      var timeOut = 230;

      debug('Calling receiveQueueMessage to begin our long-polling');
      // the receiveQueueMessage implements long-polling, so we start another long-poll to get more messages
      this._autoRetryingServiceBusService.receiveQueueMessage(this._queueName, { timeoutIntervalInS: timeOut, isPeekLock: true }, function () {
        var _ref2 = _asyncToGenerator(regeneratorRuntime.mark(function _callee(err, lockedMessage) {
          var immediatelyReceiveNewMessages;
          return regeneratorRuntime.wrap(function _callee$(_context) {
            while (1) {
              switch (_context.prev = _context.next) {
                case 0:
                  if (!(err === 'No messages to receive')) {
                    _context.next = 4;
                    break;
                  }

                  debug('No message, call to receiveQueueMessage timed out. Immediately receiving new messages');
                  setImmediate(_this3._receive.bind(_this3), 0);
                  return _context.abrupt('return');

                case 4:

                  _this3._messagesCount += 1;
                  debug('Received new message, messages count: ' + _this3._messagesCount);

                  // if we're below the limit, we'll start listening for new messages immediately
                  immediatelyReceiveNewMessages = !_this3._messagesLimit || _this3._messagesCount < _this3._messagesLimit;

                  if (immediatelyReceiveNewMessages) {
                    debug('Immediately receiving new messages');
                    setImmediate(_this3._receive.bind(_this3), 0);
                  }

                  _context.next = 10;
                  return _this3._processMessage(err, lockedMessage);

                case 10:
                  _this3._messagesCount -= 1;

                  // if we didn't immediately receive new messages, it's because
                  // we were over our limit so we're gonna do so now
                  if (!immediatelyReceiveNewMessages) {
                    debug('Receiving more messages because of the completion of a message being processed');
                    setImmediate(_this3._receive.bind(_this3), 0);
                  }

                case 12:
                case 'end':
                  return _context.stop();
              }
            }
          }, _callee, _this3);
        }));

        return function (_x, _x2) {
          return _ref2.apply(this, arguments);
        };
      }());
    }
  }, {
    key: '_processMessage',
    value: function () {
      var _ref3 = _asyncToGenerator(regeneratorRuntime.mark(function _callee2(err, lockedMessage) {
        var _this4 = this;

        var messageBody;
        return regeneratorRuntime.wrap(function _callee2$(_context2) {
          while (1) {
            switch (_context2.prev = _context2.next) {
              case 0:
                if (!err) {
                  _context2.next = 2;
                  break;
                }

                return _context2.abrupt('return', this._onReceiveCallback(err));

              case 2:

                debug('Received message on queue \'' + this._queueName + '\'', lockedMessage);

                messageBody = JSON.parse(lockedMessage.body);
                return _context2.abrupt('return', this._keepLockDuring(lockedMessage, this._onReceiveCallback.bind(this, null, messageBody)).then(function () {
                  debug('Deleting message from queue \'' + _this4._queueName + '\'');
                  _this4._autoRetryingServiceBusService.deleteMessage(lockedMessage, function (err) {
                    if (err) {
                      console.error('Error deleting message', err);
                    }
                  });
                }).catch(function (err) {
                  var stack = void 0;
                  if (err && err.stack) {
                    stack = err.stack.split("\n");
                  }

                  console.error('Error processing message', err, stack);
                }));

              case 5:
              case 'end':
                return _context2.stop();
            }
          }
        }, _callee2, this);
      }));

      function _processMessage(_x3, _x4) {
        return _ref3.apply(this, arguments);
      }

      return _processMessage;
    }()
  }]);

  return Queue;
}();

exports.default = Queue;