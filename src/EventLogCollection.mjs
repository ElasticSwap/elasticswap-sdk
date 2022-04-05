import Base from './Base.mjs';

export default class EventLogCollection extends Base {
  constructor(sdk, target, eventName) {
    super(sdk);

    this._collection = [];
    this._hashes = new Set();
    this._target = target;
    this.target.events[eventName]().then((subject) =>
      subject.subscribe((event) => this.addEvent(event)),
    );
    this._whenInitialized = new Promise((resolve) => {
      this.target.contract
        .queryFilter(eventName)
        .then((events) => events.forEach((event) => this.addEvent(event)))
        .then(resolve);
    });
  }

  get collection() {
    return this._collection;
  }

  get endingBlock() {
    if (this.collection.length === 0) {
      return 0;
    }
    return this.collection[this.collection.length - 1].blockNumber;
  }

  get sorted() {
    return this.collection.sort((a, b) => a.blockNumber - b.blockNumber);
  }

  get startingBlock() {
    if (this.collection.length === 0) {
      return 0;
    }
    return this.collection[0].blockNumber;
  }

  get target() {
    return this._target;
  }

  get whenInitialized() {
    return this._whenInitialized;
  }

  addEvent(event) {
    if (!this.has(event)) {
      this._hashes.add(event.transactionHash);
      this._collection.push(event);
    }
  }

  has({ transactionHash }) {
    return this._hashes.has(transactionHash);
  }

  range(startBlock, endBlock) {
    if (!startBlock && !endBlock) {
      return this.sorted;
    }

    if (!endBlock) {
      return this.sorted.filter((event) => event.blockNumber >= startBlock);
    }

    return this.sorted.filter(
      (event) => event.blockNumber >= startBlock && event.blockNumber <= endBlock,
    );
  }
}
