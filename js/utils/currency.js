import _ from 'underscore';
import app from '../app';
import $ from 'jquery';
import bitcoinConvert from 'bitcoin-convert';
import { upToFixed } from './number';
import { Events } from 'backbone';
import { getCurrencyByCode } from '../data/currencies';
import {
  getServerCurrency,
  getCurrencyByCode as getCryptoCurByCode,
} from '../data/cryptoCurrencies';
import loadTemplate from '../utils/loadTemplate';

const events = {
  ...Events,
};

export { events };

export const btcSymbol = '₿';

export function NoExchangeRateDataError(message) {
  this.message = message || 'Missing exchange rate data';
  this.name = 'NoExchangeRateDataError';
  this.stack = (new Error()).stack;
}

NoExchangeRateDataError.prototype = Object.create(Error.prototype);
NoExchangeRateDataError.prototype.constructor = NoExchangeRateDataError;

export function UnrecognizedCurrencyError(message) {
  this.message = message || 'The currency is not recognized.';
  this.name = 'UnrecognizedCurrencyError';
  this.stack = (new Error()).stack;
}

UnrecognizedCurrencyError.prototype = Object.create(Error.prototype);
UnrecognizedCurrencyError.prototype.constructor = UnrecognizedCurrencyError;

/**
 * Converts the amount from a decimal to an integer. If the currency code is a crypto currency,
 * it will convert to its base units.
 */
export function decimalToInteger(amount, currency, options = {}) {
  if (typeof amount !== 'number') {
    throw new Error('Please provide an amount as a number.');
  }

  if (typeof currency !== 'string') {
    throw new Error('Please provide a currency as a string.');
  }

  const opts = {
    returnUndefinedOnError: true,
    ...options,
  };

  const curData = getCurrencyByCode(currency);
  let returnVal;

  if (!curData) {
    if (!opts.returnUndefinedOnError) {
      throw new UnrecognizedCurrencyError(`${currency} is not a recognized currency.`);
    }
  } else {
    if (getCryptoCurByCode(currency)) {
      returnVal = Math.round(amount * curData.baseUnit);
    } else {
      returnVal = Math.round(amount * 100);
    }
  }

  return returnVal;
}

/**
 * Converts the amount from an integer to a decimal, rounding to 2 decimal places. If the
 * currency code is for a crypto currency, it will convert from its base units.
 */
export function integerToDecimal(amount, currency, options = {}) {
  const opts = {
    returnUndefinedOnError: true,
    ...options,
  };

  const curData = getCurrencyByCode(currency);
  let returnVal;

  if (!curData) {
    if (!opts.returnUndefinedOnError) {
      throw new UnrecognizedCurrencyError(`${currency} is not a recognized currency.`);
    }
  } else {
    if (getCryptoCurByCode(currency)) {
      returnVal = Number(
        (amount / curData.baseUnit).toFixed(curData.maxDisplayDecimals)
      );
    } else {
      returnVal = Number((amount / 100).toFixed(2));
    }
  }

  return returnVal;
}

/**
 * Will take a number and return a string version of the number with the appropriate number of
 * decimal places based on whether the number represents a crypto or fiat price.
 *
 * This differs from formatCurrency in that this does not localize the number at all. It simply
 * returns the value with the appropriate number of decimal place, e.g:
 *
 * formatPrice(123.456, 'USD') // "123.46"
 * formatPrice(123.456, 'BTC')  // "123.45600000"
 *
 * It is more useful for <input>'s because we are not localizing the numbers in them.
 *
 */
export function formatPrice(price, currency) {
  if (typeof price !== 'number') {
    throw new Error('Please provide a price as a number');
  }

  if (isNaN(price)) {
    throw new Error('Please provide a price that is not NaN');
  }

  if (typeof currency !== 'string') {
    throw new Error('Please provide a currency as a string');
  }

  let convertedPrice;
  const cryptoCur = getCryptoCurByCode(currency);

  if (cryptoCur) {
    // Format crypto price so it has up to the max decimal places (as specified in the crypto
    // config), but without any trailing zeros
    convertedPrice = upToFixed(price, cryptoCur.maxDisplayDecimals);
  } else {
    convertedPrice = price.toFixed(2);
  }

  return convertedPrice;
}

/**
 * Will format an amount in the given currency into the format appropriate for the given locale. An
 * empty string will be returned if an unrecognized currency code is provided.
 */
export function formatCurrency(amount, currency, options) {
  const opts = {
    locale: app && app.localSettings && app.localSettings.standardizedTranslatedLang() || 'en-US',
    btcUnit: app && app.localSettings &&
      app.localSettings.get('bitcoinUnit') || 'BTC',
    ...options,
  };

  if (typeof amount !== 'number') {
    throw new Error('Please provide an amount as a number');
  }

  if (isNaN(amount)) {
    throw new Error('Please provide an amount that is not NaN');
  }

  if (typeof opts.locale !== 'string') {
    throw new Error('Please provide a locale as a string');
  }

  if (typeof currency !== 'string') {
    throw new Error('Please provide a currency as a string');
  }

  const cur = currency.toUpperCase();
  const curData = getCurrencyByCode(cur);

  if (!curData) {
    // return an empty string when we have an unrecognized currency code
    return '';
  }

  let formattedCurrency;
  const cryptoCur = getCryptoCurByCode(cur);

  if (cryptoCur) {
    let curSymbol = curData.symbol || cur;
    let bitcoinConvertUnit;
    let amt = amount;

    if (cur === 'BTC' || cur === 'TBTC') {
      switch (opts.btcUnit) {
        case 'MBTC':
          bitcoinConvertUnit = curSymbol = 'mBTC';
          break;
        case 'UBTC':
          bitcoinConvertUnit = curSymbol = 'μBTC';
          break;
        case 'SATOSHI':
          curSymbol = 'sat';
          bitcoinConvertUnit = 'Satoshi';
          break;
        default:
          bitcoinConvertUnit = 'BTC';
      }

      amt = bitcoinConvert(amount, 'BTC', bitcoinConvertUnit);
    }

    const formattedAmount = new Intl.NumberFormat(opts.locale, {
      minimumFractionDigits: curData.minDisplayDecimals,
      maximumFractionDigits: curData.maxDisplayDecimals,
    }).format(amt);

    const translationSubKey = curSymbol === curData.symbol ?
      'curSymbolAmount' : 'curCodeAmount';
    formattedCurrency = app.polyglot.t(`cryptoCurrencyFormat.${translationSubKey}`, {
      amount: formattedAmount,
      [curSymbol === curData.symbol ? 'symbol' : 'code']: curSymbol,
    });
  } else {
    formattedCurrency = new Intl.NumberFormat(opts.locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }

  return formattedCurrency;
}

let exchangeRates = {};

/**
 * Will fetch exchange rate data from the server. This is already called on an interval via
 * exchangeRateSyncer.js, so it's unlikely you would need to call this method. Instead access
 * cached values via getExchangeRate() or more commonly convertCurrency().
 */
export function fetchExchangeRates(options = {}) {
  const xhr = $.get(app.getServerUrl('ob/exchangerates/'), options)
    .done((data) => (exchangeRates = data));

  events.trigger('fetching-exchange-rates', { xhr });

  return xhr;
}

/**
 * Will return the exchange rate between the server's crypto currency and the given
 * currency.
 */
export function getExchangeRate(currency) {
  if (!currency) {
    throw new Error('Please provide a currency.');
  }

  let returnVal = exchangeRates[currency];
  const serverCurrency = getServerCurrency();

  if (serverCurrency.code === currency ||
    serverCurrency.testnetCode === currency) {
    returnVal = 1;
  }

  return returnVal;
}

/**
 * Converts an amount from one currency to another based on exchange rate data.
 */
export function convertCurrency(amount, fromCur, toCur) {
  const fromCurCaps = fromCur.toUpperCase();
  const toCurCaps = toCur.toUpperCase();
  const serverCur = getServerCurrency();
  const isFromServerCur = fromCurCaps === serverCur.code || fromCurCaps === serverCur.testnetCode;
  const isToServerCur = toCurCaps === serverCur.code || toCurCaps === serverCur.testnetCode;

  if (typeof amount !== 'number') {
    throw new Error('Please provide an amount as a number');
  }

  if (isNaN(amount)) {
    throw new Error('Please provide an amount that is not NaN');
  }

  if (typeof fromCurCaps !== 'string') {
    throw new Error('Please provide a fromCur as a string');
  }

  if (typeof toCurCaps !== 'string') {
    throw new Error('Please provide a toCur as a string');
  }

  if (fromCurCaps === toCurCaps) {
    return amount;
  }

  if (!isFromServerCur && !exchangeRates[fromCurCaps]) {
    throw new NoExchangeRateDataError(`We do not have exchange rate data for ${fromCurCaps}.`);
  }

  if (!isToServerCur && !exchangeRates[toCurCaps]) {
    throw new NoExchangeRateDataError(`We do not have exchange rate data for ${toCurCaps}.`);
  }

  const fromRate = isFromServerCur ? 1 : getExchangeRate(fromCurCaps);
  const toRate = isToServerCur ? 1 : getExchangeRate(toCurCaps);

  return (amount / fromRate) * toRate;
}

/**
 * Convenience function to both convert and format a currency amount using convertCurrency()
 * and formatCurrency().
 */
export function convertAndFormatCurrency(amount, fromCur, toCur, options = {}) {
  const opts = {
    locale: app && app.localSettings && app.localSettings.standardizedTranslatedLang() || 'en-US',
    btcUnit: app && app.localSettings && app.localSettings.get('bitcoinUnit') || 'BTC',
    skipConvertIfNoExchangeRateData: true,
    ...options,
  };

  let convertedAmt;
  let outputFormat = toCur;

  try {
    convertedAmt = convertCurrency(amount, fromCur, toCur);
  } catch (e) {
    if (e instanceof NoExchangeRateDataError && opts.skipConvertIfNoExchangeRateData) {
      // We'll use an unconverted amount
      convertedAmt = amount;
      outputFormat = fromCur;
    } else {
      throw e;
    }
  }

  return formatCurrency(convertedAmt, outputFormat,
    _.omit(opts, 'skipConvertIfNoExchangeRateData'));
}

/**
 * Returns `VALID` if the given currency is valid, otherwise it will return a code
 * indicating why it's not valid.
 */
export function getCurrencyValidity(cur) {
  if (typeof cur !== 'string') {
    throw new Error('A currency must be provided as a string.');
  }

  const curData = getCurrencyByCode(cur);
  let returnVal;

  if (curData) {
    // Determine if the given currency is the one the node is running in
    const isCurServerCurrency = curData.isCrypto &&
      app.serverConfig.cryptoCurrency === cur ||
      app.serverConfig.cryptoCurrency === curData.testnetCode;

    if (getExchangeRate(cur) || isCurServerCurrency) {
      returnVal = 'VALID';
    } else {
      returnVal = 'EXCHANGE_RATE_MISSING';
    }
  } else {
    returnVal = 'UNRECOGNIZED_CURRENCY';
  }

  return returnVal;
}

/**
 * Will render a formattedCurrency template. The main function of the template is that it will
 * render a localized price when possible. When it is not possible (e.g. an unrecognized currency),
 * it will render an alert icon with a tooltip containing an explanation (assuming you don't pass in
 * the showTooltipOnUnrecognizedCur option as false).
 */
export function renderFormattedCurrency(amount, fromCur, toCur, options = {}) {
  if (typeof fromCur !== 'string' || !fromCur) {
    throw new Error('Please provide a "from currency" as a string.');
  }

  if (fromCur && typeof toCur !== 'string') {
    throw new Error('If providing a "to currency", it must be provided as a string.');
  }

  let result = '';

  loadTemplate('components/formattedCurrency.html', (t) => {
    result = t({
      price: amount,
      fromCur,
      toCur: toCur || fromCur,
      ...options,
    });
  });

  return result;
}

/**
 * Will render a pairing of currencies, most commonly used to show a crypto currency
 * along with it's fiat equivalent (e.g. $2.33 (0.0002534 BTC)). If it cannot show the
 * "to" currency (e.g. exchange rate data not available), it will just show the "from".
 * If the "from" currency is invalid, it will render an empty string.
 */
export function renderPairedCurrency(price, fromCur, toCur) {
  const fromCurValidity = getCurrencyValidity(fromCur);

  if (!price || fromCurValidity === 'UNRECOGNIZED_CURRENCY') {
    // Sometimes when prices are in an unsupported currency, they will be
    // saved as empty strings or undefined. We'll ignore those an just render an
    // empty string.
    return '';
  }

  const toCurValidity = getCurrencyValidity(toCur);
  const formattedBase = formatCurrency(price, fromCur);
  const formattedConverted = fromCur === toCur || toCurValidity !== 'VALID' ||
    fromCurValidity !== 'VALID' ?
      '' : convertAndFormatCurrency(price, fromCur, toCur);

  let result = formattedBase;

  if (formattedConverted !== '') {
    result = app.polyglot.t('currencyPairing', {
      baseCurValue: formattedBase,
      convertedCurValue: formattedConverted,
    });
  }

  return result;
}
