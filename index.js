// Copyright 2026 Rheon
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/** @typedef {import('@tetherto/wdk-wallet/protocols').BuyOptions} BuyOptions */
/** @typedef {import('@tetherto/wdk-wallet/protocols').BuyCommonOptions} BuyCommonOptions */
/** @typedef {import('@tetherto/wdk-wallet/protocols').BuyExactCryptoAmountOptions} BuyExactCryptoAmountOptions */
/** @typedef {import('@tetherto/wdk-wallet/protocols').BuyWithFiatAmountOptions} BuyWithFiatAmountOptions */
/** @typedef {import('@tetherto/wdk-wallet/protocols').BuyResult} BuyResult */

/** @typedef {import('@tetherto/wdk-wallet/protocols').SellOptions} SellOptions */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SellCommonOptions} SellCommonOptions */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SellExactCryptoAmountOptions} SellExactCryptoAmountOptions */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SellForFiatAmountOptions} SellForFiatAmountOptions */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SellResult} SellResult */

/** @typedef {import('@tetherto/wdk-wallet/protocols').FiatQuote} FiatQuote */
/** @typedef {import('@tetherto/wdk-wallet/protocols').FiatTransactionStatus} FiatTransactionStatus */
/** @typedef {import('@tetherto/wdk-wallet/protocols').FiatTransactionDetail} FiatTransactionDetail */

/** @typedef {import('@tetherto/wdk-wallet/protocols').SupportedCryptoAsset} SupportedCryptoAsset */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SupportedFiatCurrency} SupportedFiatCurrency */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SupportedCountry} SupportedCountry */

/** @typedef {import('./src/rheon-protocol.js').RheonProtocolConfig} RheonProtocolConfig */
/** @typedef {import('./src/rheon-protocol.js').RheonRequest} RheonRequest */
/** @typedef {import('./src/rheon-protocol.js').RheonResponse} RheonResponse */
/** @typedef {import('./src/rheon-protocol.js').RheonAsset} RheonAsset */
/** @typedef {import('./src/rheon-protocol.js').RheonAmount} RheonAmount */
/** @typedef {import('./src/rheon-protocol.js').RheonAvailability} RheonAvailability */
/** @typedef {import('./src/rheon-protocol.js').RheonRoute} RheonRoute */
/** @typedef {import('./src/rheon-protocol.js').RheonPrice} RheonPrice */
/** @typedef {import('./src/rheon-protocol.js').RheonApplePayRequest} RheonApplePayRequest */
/** @typedef {import('./src/rheon-protocol.js').RheonTransaction} RheonTransaction */
/** @typedef {import('./src/rheon-protocol.js').RheonApplePayPayment} RheonApplePayPayment */
/** @typedef {import('./src/rheon-protocol.js').RheonApplePayAuthorization} RheonApplePayAuthorization */
/** @typedef {import('./src/rheon-protocol.js').RheonBillingAddress} RheonBillingAddress */
/** @typedef {import('./src/rheon-protocol.js').RheonSimulation} RheonSimulation */
/** @typedef {import('./src/rheon-protocol.js').RheonRouteParams} RheonRouteParams */
/** @typedef {import('./src/rheon-protocol.js').RheonRequestParams} RheonRequestParams */
/** @typedef {import('./src/rheon-protocol.js').RheonApplePayQuoteParams} RheonApplePayQuoteParams */
/** @typedef {import('./src/rheon-protocol.js').RheonQuoteBuyOptions} RheonQuoteBuyOptions */
/** @typedef {import('./src/rheon-protocol.js').RheonWidgetParams} RheonWidgetParams */
/** @typedef {import('./src/rheon-protocol.js').RheonBuyOptions} RheonBuyOptions */
/** @typedef {import('./src/rheon-protocol.js').RheonSellOptions} RheonSellOptions */
/** @typedef {import('./src/rheon-protocol.js').RheonSellQuote} RheonSellQuote */
/** @typedef {import('./src/rheon-protocol.js').RheonApplePayUser} RheonApplePayUser */
/** @typedef {import('./src/rheon-protocol.js').RheonApplePayQuoteOptions} RheonApplePayQuoteOptions */
/** @typedef {import('./src/rheon-protocol.js').RheonApplePayPaymentOptions} RheonApplePayPaymentOptions */
/** @typedef {import('./src/rheon-protocol.js').RheonBuyQuote} RheonBuyQuote */
/** @typedef {import('./src/rheon-protocol.js').RheonApplePayQuote} RheonApplePayQuote */
/** @typedef {import('./src/rheon-protocol.js').RheonTransactionDetail} RheonTransactionDetail */
/** @typedef {import('./src/rheon-protocol.js').RheonSupportedCryptoAsset} RheonSupportedCryptoAsset */
/** @typedef {import('./src/rheon-protocol.js').RheonSupportedFiatCurrency} RheonSupportedFiatCurrency */
/** @typedef {import('./src/rheon-protocol.js').RheonSupportedCountry} RheonSupportedCountry */

/** @typedef {import('./src/errors.js').RheonApiErrorOptions} RheonApiErrorOptions */
/** @typedef {import('./src/errors.js').RheonRetry} RheonRetry */

export { default } from './src/rheon-protocol.js'

export { RheonApiError, RheonCallbackError, RheonConfigurationError } from './src/errors.js'
