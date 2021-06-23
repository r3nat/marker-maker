// -- Config

const PAIR = 'ETH:USDT';
const INITIAL_BALANCES = {
  base: 10, // eths
  quote: 2000, // usds
};
// keep MAKE_RATIO of balances in placed orders
const MAKE_RATIO = .9;
// cancel random order if we have less than DISCREPANCY_RATIO of amount in placed orders
// TODO not implemented yet
const DISCREPANCY_RATIO = .6;
// number of bids and asks to place
const BIDS = 5, ASKS = 5;
// keep bids within SPAN of the best bid & ask prices TODO .05 (5%) in requirements
const SPAN = .01;
const REFRESH_BOOK_INTERVAL = 5000;
const DISPLAY_BALANCES_INTERVAL = 30000;

// -- End of config

const DeversifiAPI = require('./lib/deversifi-api');
const Calculator = require('./lib/calculator');
const Trader = require('./lib/trader');

const api = new DeversifiAPI();
const calculator = new Calculator(INITIAL_BALANCES);
const trader = new Trader(api, calculator, PAIR, MAKE_RATIO, DISCREPANCY_RATIO, BIDS, ASKS, SPAN);

function displayStatus() {
  const status = calculator.getStatus();
  console.log(
    `STATUS: ETH=${status.base} USD=${status.quote} LOCKED_ETH=${status.placedBase}` +
    `(ASKS=${status.asks}) LOCKED_USD=${status.placedQuote}(BIDS=${status.bids})`,
  );
}

function bidOrAsk(order) {
  return Calculator.isBid(order) ? 'BID' : 'ASK';
}

async function refresh() {
  const { bestBid, bestAsk, cancelledOrders, takenOrders, placedOrders } = await trader.refresh();

  console.log(`BEST BID/ASK ${bestBid} ${bestAsk}`);

  for (const order of cancelledOrders) {
    const makeValue = Calculator.getMakeValue(order);
    const eths = makeValue.base;
    const usds = makeValue.quote;
    console.log(
      `CANCELED ${bidOrAsk(order)} @ ${order.price} ${order.amount} (ETH ${eths} USD ${usds})`,
    );
  }

  for (const order of takenOrders) {
    const makeValue = Calculator.getMakeValue(order);
    const takeValue = Calculator.getTakeValue(order);
    const eths = -makeValue.base + takeValue.base;
    const usds = -makeValue.quote + takeValue.quote;
    console.log(
      `FILLED ${bidOrAsk(order)} @ ${order.price} ${order.amount} (ETH ${eths} USD ${usds})`,
    );
  }

  for (const order of placedOrders) {
    console.log(`PLACED ${bidOrAsk(order)} @ ${order.price} ${order.amount}`);
  }
}

(async() => {
  displayStatus();
  setInterval(displayStatus, DISPLAY_BALANCES_INTERVAL);

  await refresh();
  setInterval(refresh, REFRESH_BOOK_INTERVAL); // TODO
})();
