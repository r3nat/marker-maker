const https = require('https');
const querystring = require('querystring');

/**
 * @typedef {Object} Order
 * @property {number} price
 * @property {number} count number of orders
 * @property {number} amount total amount available at that price level, positive means bid
 */

class DeversifiAPI {
  /**
   * @param {string} pair
   * @returns {Promise<Order[]>}
   * @link https://docs.deversifi.com/docs#getMarketdataBookSymbolPrecisionLength
   */
  async getOrderbook(pair) {
    return new Promise((resolve, reject) => {
      const url = `https://api.deversifi.com/market-data/book/${querystring.escape(pair)}/P0/25`;
      // TODO timeouts?
      https.get(url, res => {
        if (res.statusCode !== 200) {
          reject('got non-200 result');
          return;
        }

        res.setEncoding('utf8');

        let body = '';
        res.on('data', chunk => {
          body += chunk;
        });
        res.on('end', () => {
          resolve(JSON.parse(body).map(genericOrder => ({
            price: genericOrder[0],
            count: genericOrder[1],
            amount: genericOrder[2],
          })));
        });
        res.on('error', err => {
          reject(err);
        })
      });
    });
  }
}

module.exports = DeversifiAPI;
