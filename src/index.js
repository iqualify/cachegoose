'use strict';

const TWENTY_MINUTES_IN_MILLISECONDS = 1000 * 60 * 20;

let hasRun = false;
let cache;

module.exports = function init(mongoose, cacheOptions = {}) {
  if (typeof mongoose.Model.hydrate !== 'function') throw new Error('Cachegoose is only compatible with versions of mongoose that implement the `model.hydrate` method');
  if (hasRun) return;
  hasRun = true;

  init._cache = cache = require('./cache')(cacheOptions);

  require('./extend-query')(mongoose, cache);
  require('./extend-aggregate')(mongoose, cache);
};

module.exports.clearCache = function (customKey, cb = () => {}) {
  if (!customKey) {
    cache.clear(cb);
    return;
  }
  cache.del(customKey, cb);
};

/**
 * @param {string} key the key to check for.
 * @return {Promise<Boolean>} whether there is an entry for the key
 */
module.exports.isCached = async function(key) {
  if (!key) {
    throw new Error('Must provide a key');
  }

  return new Promise((resolve, reject) => {
    cache.get(key, (err, cachedResults) => {
      if (err) {
        return reject(err);
      }

      return resolve(Boolean(cachedResults));
    });
  });
};

/**
 * @param {string} key the key to set.
 * @param {string} value the value to set.
 * @return {Promise}
 */
module.exports.setCache = async function(key, value, ttl = TWENTY_MINUTES_IN_MILLISECONDS) {
  if (!key || !value) {
    throw new Error('Must provide a key and value');
  }

  return new Promise((resolve, reject) => {
    if (process.env.DISABLE_DB_MEMCACHE === 'true') {
      return resolve();
    } else {
      cache.set(key, value, ttl, () => {
        return resolve();
      });
    }
  });
};