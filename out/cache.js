'use strict';

const cache = require('memory-cache');
const noop = () => {};

function Cache(options) {
  this._cache = cache;
}

Cache.prototype.get = function (key, cb = noop) {
  const cachedResults = this._cache.get(key);
  return cb(null, cachedResults);
};

Cache.prototype.set = function (key, value, ttl, cb = noop) {
  if (ttl === 0) ttl = -1;
  return this._cache.put(key, value, ttl, cb);
};

Cache.prototype.del = function (key, cb = noop) {
  return this._cache.del(key, cb);
};

Cache.prototype.clear = function (cb = noop) {
  return this._cache.clear(cb);
};

module.exports = function (options) {
  return new Cache(options);
};
