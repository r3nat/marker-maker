const assert = require('assert');

const Calculator = require('./calculator');

/**
 * Returns a random number between min (inclusive) and max (exclusive)
 */
function getRandomArbitrary(min, max) {
  return Math.random() * (max - min) + min;
}

// magic function to calculate value to make out of remaining value
function calculateMakeValue(remainingValue) {
  return Math.random() * 0.5 * remainingValue;
}

// min amount to place an order with
const MIN_AMOUNT = 0.000001;

class Trader {
  /**
   * @param {DeversifiAPI} api
   * @param {Calculator} calculator
   * @param {string} pair
   * @param {number} makeRatio
   * @param {number} discrepancyRatio
   * @param {number} maintainBids
   * @param {number} maintainAsks
   * @param {number} span
   * @throws {Error}
   */
  constructor(api, calculator, pair, makeRatio, discrepancyRatio, maintainBids, maintainAsks, span) {
    assert(discrepancyRatio < makeRatio);
    this.api = api;
    this.calculator = calculator;
    this.pair = pair;
    this.makeRatio = makeRatio;
    this.discrepancyRatio = discrepancyRatio;
    this.maintainBids = maintainBids;
    this.maintainAsks = maintainAsks;
    this.span = span;
  }

  /**
   * @returns {Promise<{
   *   bestBid: number,
   *   bestAsk: number,
   *   placedOrders: Order[],
   *   takenOrders: Order[],
   *   cancelledOrders: Order[],
   * }>}
   * TODO Calculator should fire events on placed/taken/cancelled orders instead of collecting them here
   */
  async refresh() {
    const book = await this.api.getOrderbook(this.pair);

    const { bestBid, bestAsk } = Trader._bestPrices(book);
    const minBid = bestBid * (1 - this.span);
    const maxAsk = bestAsk * (1 + this.span);

    const outOfSpanCancelledOrders = this._cancelOutOfSpan(minBid, maxAsk);
    const takenOrders = this._fill(bestBid, bestAsk);
    const { placedBids, cancelledBids } = this._makeBids(minBid, bestBid);
    const { placedAsks, cancelledAsks } = this._makeAsks(bestAsk, maxAsk);

    return {
      bestBid, bestAsk,
      cancelledOrders: [
        ...outOfSpanCancelledOrders,
        ...cancelledBids,
        ...cancelledAsks,
      ],
      takenOrders,
      placedOrders: [
        ...placedBids,
        ...placedAsks,
      ],
    };
  }

  _cancelOutOfSpan(minBid, maxAsk) {
    const orders = this.calculator.getOrders();
    const cancelledOrders = [];
    for (const order of orders) {
      if (Calculator.isBid(order)) {
        if (order.price < minBid) {
          this.calculator.cancel(order);
          cancelledOrders.push(order);
        }
      } else {
        if (order.price > maxAsk) {
          this.calculator.cancel(order);
          cancelledOrders.push(order);
        }
      }
    }

    return cancelledOrders;
  }

  _fill(bestBid, bestAsk) {
    const orders = this.calculator.getOrders();
    const takenOrders = [];
    for (const order of orders) {
      if (Calculator.isBid(order)) {
        if (order.price > bestBid) {
          this.calculator.take(order);
          takenOrders.push(order);
        }
      } else {
        if (order.price < bestAsk) {
          this.calculator.take(order);
          takenOrders.push(order);
        }
      }
    }
    return takenOrders;
  }

  _makeBids(minBid, bestBid) {
    const placedBids = [];
    const cancelledBids = [];

    let status, makeBids, makeQuote;
    // keep canceling orders until we have room to make new bids
    // TODO end up with too many cancels, should use threshold discrepancyRatio
    do {
      status = this.calculator.getStatus();

      makeBids = this.maintainBids - status.bids;
      const wantQuote = this.makeRatio * (status.quote + status.placedQuote);
      makeQuote = wantQuote - status.placedQuote;

      const orders = this.calculator.getOrders();
      for (const order of orders) {
        // cancel first bid
        if (Calculator.isBid(order)) {
          this.calculator.cancel(order);
          cancelledBids.push(order);
          break;
        }
      }
    } while (makeBids === 0 && makeQuote > 0);

    const make = quote => {
      const price = getRandomArbitrary(minBid, bestBid);
      makeQuote -= quote;
      const amount = quote / price;
      if (amount < MIN_AMOUNT) {
        return;
      }
      const order = { price, count: 1, amount };
      this.calculator.make(order);
      placedBids.push(order);
    };

    if (makeBids > 0 && makeQuote > 0) {
      for (let i = 0; i < makeBids-1; i++) {
        // we want random division of an interval
        // but instead we took random*0.5 every time of remaining base
        const quote = calculateMakeValue(makeQuote);
        make(quote);
      }
      // last one takes remaining makeQuote
      make(makeQuote);
    }

    return { placedBids, cancelledBids };
  }

  // TODO combine with _makeBids as logic is mostly the same
  _makeAsks(bestAsk, maxAsk) {
    const placedAsks = [];
    const cancelledAsks = [];

    // keep canceling orders until we have room to make new asks
    let status, makeAsks, makeBase;
    do {
      status = this.calculator.getStatus();

      makeAsks = this.maintainAsks - status.asks;
      const wantBase = this.makeRatio * (status.base + status.placedBase);
      makeBase = wantBase - status.placedBase;

      const orders = this.calculator.getOrders();
      for (const order of orders) {
        // cancel first ask
        if (!Calculator.isBid(order)) {
          this.calculator.cancel(order);
          cancelledAsks.push(order);
          break;
        }
      }
    } while (makeAsks === 0 && makeBase > 0);

    const take = base => {
      const price = getRandomArbitrary(bestAsk, maxAsk);
      makeBase -= base;
      if (base < MIN_AMOUNT) {
        return;
      }
      const order = { price, count: 1, amount: -base }; // negative amount - ask
      this.calculator.make(order);
      placedAsks.push(order);
    };

    if (makeAsks > 0 && makeBase > 0) {
      for (let i = 0; i < makeAsks-1; i++) {
        // we want random division of an interval
        // but instead we took 0.5 every time of remaining quote
        const base = calculateMakeValue(makeBase);
        take(base);
      }

      // last one takes remaining makeBase
      take(makeBase);
    }

    return { placedAsks, cancelledAsks };
  }

  /**
   * @param {Order[]} book
   * @returns {{bestBid: number, bestAsk: number}}
   * @private
   */
  static _bestPrices(book) {
    let bestBid = null, bestAsk = null;
    for (const order of book) {
      if (Calculator.isBid(order)) {
        if (bestBid === null || order.price > bestBid) {
          bestBid = order.price;
        }
      } else {
        if (bestAsk === null || order.price < bestAsk) {
          bestAsk = order.price;
        }
      }
    }
    return { bestBid, bestAsk };
  }
}

module.exports = Trader;
