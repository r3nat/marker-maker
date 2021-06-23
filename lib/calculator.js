const assert = require('assert');

/**
 * @typedef Balances
 * @property {number} base
 * @property {number} quote
 */

/**
 * Calculator keeps track of balances and placed orders
 * TODO fees https://www.deversifi.com/fees
 * TODO it is incorrect to use js numbers (which are floats), use bignumber.js
 */
class Calculator {
  /**
   * @param {Balances} balances
   */
  constructor(balances) {
    this.balances = balances;
    // price -> Order
    this.orders = new Map();
  }

  /**
   * @returns {{
   *   base: number,
   *   quote: number,
   *   bids: number,
   *   asks: number,
   *   placedBase: number,
   *   placedQuote: number,
   * }}
   */
  getStatus() {
    const status = {
      base: this.balances.base,
      quote: this.balances.quote,
      bids: 0,
      asks: 0,
      placedBase: 0,
      placedQuote: 0,
    };

    for (const order of this.orders.values()) {
      if (Calculator.isBid(order)) {
        status.bids++;
      } else {
        status.asks++;
      }
      const value = Calculator.getMakeValue(order);
      status.placedBase += value.base;
      status.placedQuote += value.quote;
    }

    return status;
  }

  getOrders() {
    return this.orders.values();
  }

  /**
   * @param {Order} order
   * @throws {Error}
   */
  make(order) {
    const value = Calculator.getMakeValue(order);
    assert(
      this.balances.base >= value.base,
      `Not enough base balance to make order ${JSON.stringify(order)}: ` +
      `need ${value.base}, have ${this.balances.base}`,
    );
    assert(
      this.balances.quote >= value.quote,
      `Not enough quote balance to make order ${JSON.stringify(order)}: ` +
      `need ${value.quote}, have ${this.balances.quote}`,
    );

    this.balances.base -= value.base;
    this.balances.quote -= value.quote;

    if (this.orders.has(order.price)) {
      const existingOrder = this.orders.get(order.price);
      assert(
        Math.sign(order.amount) * Math.sign(existingOrder.amount) === 1,
        `Logic error: unable to bid when we have ask at the same price and vice versa`,
      );

      // update by ref, no need to set it back
      existingOrder.count += order.count;
      existingOrder.amount += order.amount;
    } else {
      this.orders.set(order.price, order);
    }
  }

  /**
   * @param {Order} order
   * @throws {Error}
   */
  take(order) {
    this._removeOrder(order);

    const value = Calculator.getTakeValue(order);
    this.balances.base += value.base;
    this.balances.quote += value.quote;
  }

  cancel(order) {
    this._removeOrder(order);

    const value = Calculator.getMakeValue(order);
    this.balances.base += value.base;
    this.balances.quote += value.quote;
  }

  /**
   * @param {Order} order
   * @private
   */
  _removeOrder(order) {
    assert(this.orders.has(order.price));
    const existingOrder = this.orders.get(order.price);

    assert(
      Math.abs(existingOrder.amount) >= Math.abs(order.amount),
      `Not enough amount to take order: have ${existingOrder.amount}, need for oder ${JSON.stringify(order)}`,
    );
    assert(existingOrder.count >= order.count);

    if (existingOrder.amount === order.amount) {
      assert(existingOrder.count === order.count);
      this.orders.delete(order.price);
    } else {
      assert(existingOrder.count > order.count);
      // update by ref
      existingOrder.count -= order.count;
      existingOrder.amount -= order.amount;
    }
  }

  /**
   * @param {Order} order
   * @returns {Balances}
   */
  static getMakeValue(order) {
    const value = { base: 0, quote: 0 };
    if (Calculator.isBid(order)) {
      // bid - spend quote
      value.quote = order.price * order.amount;
    } else {
      // ask - spend base
      value.base = -order.amount;
    }
    return value;
  }

  /**
   * @param {Order} order
   * @returns {Balances}
   */
  static getTakeValue(order) {
    const value = { base: 0, quote: 0 };
    if (Calculator.isBid(order)) {
      // bid - we spend quote (already calculated) to get base
      value.base = order.amount;
    } else {
      // ask - we spend base (already calculated) to get quote
      value.quote = order.price * (-order.amount);
    }
    return value;
  }

  static isBid(order) {
    return order.amount > 0;
  }
}

module.exports = Calculator;
