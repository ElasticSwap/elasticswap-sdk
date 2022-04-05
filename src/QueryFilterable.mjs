import Cachable from './Cachable.mjs';
import EventLogCollection from './EventLogCollection.mjs';

export default class QueryFilterable extends Cachable {
  async queryFilter(eventName, startingBlock, endingBlock) {
    const key = `${this.constructor.name}|${this.id}|${eventName}`;

    if (!this.cache.has(key)) {
      this.cache.set(key, new EventLogCollection(this.sdk, this, eventName));
      await this.cache.get(key).whenInitialized;
      return this.queryFilter(eventName, startingBlock, endingBlock);
    }

    const collection = this.cache.get(key);
    const promises = [];

    if (startingBlock && collection.startingBlock > startingBlock) {
      promises.push(this.contract.queryFilter(eventName, startingBlock, collection.startingBlock));
    }

    if (endingBlock && collection.endingBlock < endingBlock) {
      promises.push(this.contract.queryFilter(eventName, collection.endingBlock + 1, endingBlock));
    }

    const additionalEvents = await Promise.all(promises);

    for (let i = 0; i < additionalEvents.length; i += 1) {
      for (let j = 0; j < additionalEvents[i].length; j += 1) {
        collection.addEvent(additionalEvents[i][j]);
      }
    }

    return collection.range(startingBlock, endingBlock);
  }
}
