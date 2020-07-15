'use strict';

const _ = require('lodash');

const generateKey = require('./generate-key');

function applyProjections(results, projections) {
  // Convert projections from what Mongoose wants to what Lodash wants
  const projectionsForLodash = ['_id'];
  _.each(projections, (projectionValue, projectionField) => {
    if (projectionValue === 1) {
      projectionsForLodash.push(projectionField);
    }
  });

  if (Array.isArray(results)) {
    results.forEach((offering) => {
      offering = _.pick(offering, projectionsForLodash);
    });
  } else {
    results = _.pick(results, projectionsForLodash);
  }
  return results;
};

module.exports = function(mongoose, cache) {
  const exec = mongoose.Query.prototype.exec;
  const TWENTY_MINUTES_IN_SECONDS = 60 * 20;

  mongoose.Query.prototype.exec = function(op, callback = function() { }) {
    if (!this.hasOwnProperty('_ttl')) return exec.apply(this, arguments);

    if (typeof op === 'function') {
      callback = op;
      op = null;
    } else if (typeof op === 'string') {
      this.op = op;
    }

    const doProjectionsOnServer = this._doProjectionsOnServer;

    // Remove the projections (_fields) from the query, to be filtered later
    let projectedFields;
    if (doProjectionsOnServer === true && this._fields) {
      projectedFields = _.cloneDeep(this._fields);
      delete this._fields;
    }

    const key = this._key || this.getCacheKey();
    const ttl = this._ttl;
    const isCount = ['count', 'countDocuments', 'estimatedDocumentCount'].includes(this.op);
    const isLean = this._mongooseOptions.lean;
    const model = this.model.modelName;

    return new Promise((resolve, reject) => {
      cache.get(key, (err, cachedResults) => { //eslint-disable-line handle-callback-err
        if (cachedResults != null) {
          if (isCount) {
            callback(null, cachedResults);
            return resolve(cachedResults);
          }

          if (!isLean) {
            const constructor = mongoose.model(model);
            cachedResults = Array.isArray(cachedResults) ?
              cachedResults.map(hydrateModel(constructor)) :
              hydrateModel(constructor)(cachedResults);
          }

          cachedResults = projectedFields ? applyProjections(cachedResults, projectedFields) : cachedResults;
          callback(null, cachedResults);
          return resolve(cachedResults);
        }

        exec
          .call(this)
          .then((results) => {
            if (process.env.DISABLE_DB_MEMCACHE === 'true') {
              results = projectedFields ? applyProjections(results, projectedFields) : results;
              callback(null, results);
              return resolve(results);
            }

            cache.set(key, results, ttl, () => {
              results = projectedFields ? applyProjections(results, projectedFields) : results;
              callback(null, results);
              return resolve(results);
            });
          })
          .catch((err) => {
            callback(err);
            reject(err);
          });
      });
    });
  };

  /**
   * Sets instance variables that control caching behavior.
   *
   * @param {number|string|boolean} ttl how long to keep this entry in memory in seconds
   *                                    if it's a string, it is the customKey
   *                                    if it's a boolean, it is doProjectionsOnServer
   * @param {string} customKey the key to associate this cache entry with
   * @param {boolean} doProjectionsOnServer whether to filter projections after the
   *                                        complete record is returned from the db or cache
   */
  mongoose.Query.prototype.cache = function(ttl = TWENTY_MINUTES_IN_SECONDS, customKey = '', doProjectionsOnServer = false) {
    if (typeof ttl === 'string') {
      customKey = ttl;
      ttl = TWENTY_MINUTES_IN_SECONDS;
    }
    if (typeof ttl === 'boolean') {
      doProjectionsOnServer = ttl;
      ttl = TWENTY_MINUTES_IN_SECONDS;
    }

    this._ttl = ttl;
    this._key = customKey;
    this._doProjectionsOnServer = doProjectionsOnServer;
    return this;
  };

  mongoose.Query.prototype.getCacheKey = function() {
    const key = {
      model: this.model.modelName,
      op: this.op,
      skip: this.options.skip,
      limit: this.options.limit,
      sort: this.options.sort,
      _options: this._mongooseOptions,
      _conditions: this._conditions,
      _path: this._path,
      _distinct: this._distinct
    };

    if (!this._doProjectionsOnServer) {
      key._fields = this._userProvidedFields;
    }

    return generateKey(key);
  };
};

function hydrateModel(constructor) {
  return (data) => {
    return constructor.hydrate(data);
  };
}
