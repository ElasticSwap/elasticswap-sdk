import { isPOJO } from './utils/typeChecks.mjs';
import Base from './Base.mjs';

const localData = {
  ignore: {},
};

export default class Cache extends Base {
  constructor(sdk, key = 'default', { persist = true } = {}) {
    super(sdk);

    this._key = `@elasticswap/sdk - ${key}`;
    this._globalPersist = persist;

    if (!isPOJO(localData.ignore[this._key])) {
      localData.ignore[this._key] = {};
    }

    if (persist && !localData[this.key]) {
      localData[this.key] = { loading: true };
      this.adapter
        .load(this.key)
        .then((data) => {
          localData[this.key] = data;
          if (!isPOJO(localData[this.key])) {
            this.clear();
          }
        })
        .catch(() => {
          this.clear();
        })
        .finally(() => {
          delete localData[this.key].loading;
        });
    } else if (!localData[this.key]) {
      localData[this.key] = {};
    }
  }

  get adapter() {
    return this.sdk.storageAdapter;
  }

  get key() {
    return this._key;
  }

  get promise() {
    if (!this._globalPersist) {
      return Promise.resolve();
    }

    if (!localData[this.key].loading && this.sdk.storageAdapter.available) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      setTimeout(() => {
        this.promise.then(resolve);
      }, 50);
    });
  }

  get raw() {
    return localData[this.key];
  }

  get sdk() {
    return this._sdk;
  }

  clear() {
    if (this.adapter.available) {
      this.adapter.remove(this.key);
    }

    localData[this.key] = {};
  }

  delete(key, { persist = true } = {}) {
    delete localData[this.key][key];
    if (persist) {
      setTimeout(() => this.persist(), 0);
    }
  }

  get(key) {
    return localData[this.key][key];
  }

  has(key) {
    return Object.keys(localData[this.key]).includes(key);
  }

  persist() {
    if (this._globalPersist && this.adapter.available) {
      const persistable = {};
      Object.keys(localData[this.key]).forEach((key) => {
        if (!localData.ignore[this.key][key]) {
          persistable[key] = localData[this.key][key];
        }
      });
      this.adapter.persist(this.key, persistable);
    }
  }

  set(key, value, { persist = true } = {}) {
    localData[this.key][key] = value;
    if (persist) {
      this.persist();
    } else {
      localData.ignore[this.key][key] = true;
    }
  }
}
