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
  this._cache.put(key, value, ttl);
  return cb();
};

Cache.prototype.del = function (key, cb = noop) {
  this._cache.del(key);
  return cb();
};

Cache.prototype.clear = function (cb = noop) {
  this._cache.clear();
  return cb();
};

module.exports = function (options) {
  return new Cache(options);
};
