'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _debug = require('debug');

var _debug2 = _interopRequireDefault(_debug);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var debug = (0, _debug2.default)('azure-awesome-queue:LockRenewer');

var LockRenewer = function () {
  function LockRenewer(serviceBusService, ms) {
    _classCallCheck(this, LockRenewer);

    this._messages = [];

    this._serviceBusService = serviceBusService;
    setInterval(this._tick.bind(this), ms);
  }

  _createClass(LockRenewer, [{
    key: 'addMessage',
    value: function addMessage(message) {
      debug('Adding message', message);
      this._messages.push(message);
    }
  }, {
    key: 'removeMessage',
    value: function removeMessage(message) {
      debug('Removing message', message);
      var index = this._messages.indexOf(message);
      if (index === -1) {
        throw new Error('Tried to remove a message from having its locked renewed, but we couldn\'t find it');
      }

      this._messages.splice(index, 1);
    }
  }, {
    key: '_renewLock',
    value: function _renewLock(message) {
      this._serviceBusService.renewLockForMessage(message, function (err) {
        if (err) {
          console.error('Error renewing lock for message', message);
        }
      });
    }
  }, {
    key: '_tick',
    value: function _tick() {
      var _this = this;

      debug('Renewing locks for ' + this._messages.length + ' messages');
      this._messages.forEach(function (message) {
        _this._renewLock(message);
      });
    }
  }]);

  return LockRenewer;
}();

exports.default = LockRenewer;