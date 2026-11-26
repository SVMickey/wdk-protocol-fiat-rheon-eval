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

'use strict'

import { createHash } from 'crypto'
import { FiatProtocol } from '@tetherto/wdk-wallet/protocols'
import { NoSuchElementError, ProviderError, ProviderErrorReason, ValueError } from '@tetherto/wdk-wallet'

import { RheonApiError, RheonCallbackError, RheonConfigurationError } from './errors.js'

/** @typedef {import('@tetherto/wdk-wallet').IWalletAccount} IWalletAccount */
/** @typedef {import('@tetherto/wdk-wallet').IWalletAccountReadOnly} IWalletAccountReadOnly */

/** @typedef {import('@tetherto/wdk-wallet/protocols').BuyCommonOptions} BuyCommonOptions */
/** @typedef {import('@tetherto/wdk-wallet/protocols').BuyWithFiatAmountOptions} BuyWithFiatAmountOptions */
/** @typedef {import('@tetherto/wdk-wallet/protocols').BuyResult} BuyResult */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SellResult} SellResult */

/** @typedef {import('@tetherto/wdk-wallet/protocols').FiatQuote} FiatQuote */

/** @typedef {import('@tetherto/wdk-wallet/protocols').FiatTransactionStatus} FiatTransactionStatus */
/** @typedef {import('@tetherto/wdk-wallet/protocols').FiatTransactionDetail} FiatTransactionDetail */

/** @typedef {import('@tetherto/wdk-wallet/protocols').SupportedCryptoAsset} SupportedCryptoAsset */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SupportedFiatCurrency} SupportedFiatCurrency */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SupportedCountry} SupportedCountry */

/**
 * One call to Rheon's partner API, for the `request` callback to send with your Rheon API key.
 *
 * @typedef {Object} RheonRequest
 * @property {'GET' | 'POST'} method - The HTTP method.
 * @property {string} path - The path on Rheon's API host, with its query (e.g., '/v1/quote').
 * @property {Record<string, string>} headers - Headers to send as they are (e.g., `Idempotency-Key` on every POST).
 * @property {Record<string, unknown>} [body] - The JSON body of a POST.
 */

/**
 * Rheon's answer to one call, as the `request` callback received it.
 *
 * @typedef {Object} RheonResponse
 * @property {number} status - The HTTP status code of Rheon's answer.
 * @property {unknown} body - The parsed JSON body of Rheon's answer (null when it has none).
 */

/**
 * @typedef {Object} RheonProtocolConfig
 * @property {(request: RheonRequest) => Promise<RheonResponse>} request - Sends one call to Rheon's partner API from your backend, adding your Rheon API key as `Authorization: Bearer <key>`, and resolves to Rheon's status and JSON body. Your backend decides the host: `https://api.sandbox.rheon.io` for a sandbox key, `https://api.rheon.io` for a production key.
 * @property {number} [cacheTime] - How long, in milliseconds, the account's routes from `GET /v1/config` are cached (default: 600,000, 10 minutes).
 * @property {Record<string, number>} [assetDecimals] - On-chain decimals of crypto assets, keyed by `<code>:<chain>` in Rheon's codes (e.g., `{ 'USDC:base': 6 }`). Extends and overrides the module's built-in table.
 * @property {string} [merchantTransactionId] - Your order id (1–180 characters, not beginning `txn_`). Defaults to a UUID, readable on the instance. Use one instance per order, or override it in each buy/sell config.
 */

/**
 * An asset as Rheon writes it: a fiat currency (code only) or a token on a chain.
 *
 * @typedef {Object} RheonAsset
 * @property {string} code - The asset's code (e.g., 'USD', 'USDC').
 * @property {string} [chain] - The token's chain in Rheon's codes (e.g., 'solana', 'base-sepolia').
 * @property {string} [contract] - The token's contract or mint address.
 */

/**
 * An amount as Rheon writes it.
 *
 * @typedef {Object} RheonAmount
 * @property {string} amount - The amount, as a decimal string in the asset's units.
 * @property {RheonAsset} asset - The asset of the amount.
 */

/**
 * Whether a route stage is switched on for your account.
 *
 * @typedef {Object} RheonAvailability
 * @property {boolean} enabled - Whether the stage is on.
 * @property {string | null} reason - Why it is off ('not_enabled', 'temporarily_unavailable' or 'not_supported'), or null when it is on.
 */

/**
 * A route of your account, as listed by Rheon's `GET /v1/config`.
 *
 * @see https://api.rheon.io/docs
 * @typedef {Object} RheonRoute
 * @property {string} routeId - The route's id.
 * @property {string} product - The route's product: native Apple Pay or a widget buy/sell product.
 * @property {string} provider - The provider of the route.
 * @property {'sandbox' | 'production'} providerEnvironment - The provider's environment.
 * @property {RheonAsset} from - The pay asset (fiat on a buy, crypto on a sell).
 * @property {RheonAsset} to - The receive asset (crypto on a buy, fiat on a sell).
 * @property {string} paymentMethod - How the user pays, e.g. 'apple_pay', 'bank_transfer' or 'card'.
 * @property {{ minSourceAmount?: string, maxSourceAmount?: string }} limits - Rheon's bounds in the source asset.
 * @property {{ pricing: RheonAvailability, payments: RheonAvailability }} availability - Whether quotes and payments are on for your account.
 * @property {string[]} blockedCountries - Upper-case ISO 3166-1 alpha-2 codes of countries whose users the route refuses.
 */

/**
 * A price from Rheon's `POST /v1/estimate` or `POST /v1/quote`.
 *
 * @see https://api.rheon.io/docs
 * @typedef {Object} RheonPrice
 * @property {string} [quoteId] - The quote's id; only on a quote.
 * @property {string} [customerId] - The customer's id; only on a quote.
 * @property {string} routeId - The route that priced it.
 * @property {string} provider - The route's provider.
 * @property {string} product - The route's product.
 * @property {'exact_in'} exactMode - The amount that is fixed: the source/pay amount.
 * @property {RheonAmount} sourceAmount - What the user pays, every fee included.
 * @property {RheonAmount} expectedDeliveredAmount - What reaches the wallet.
 * @property {RheonAmount} totalFee - Every fee, in the source asset, already inside `sourceAmount`.
 * @property {string} fxRate - Source units per one destination unit (token per fiat on a sell).
 * @property {string} [expiresAt] - When the quote expires, as an ISO 8601 string; only on a quote.
 * @property {boolean} [indicative] - True on an estimate: a user's quote can differ.
 * @property {boolean} [simulated] - True when Rheon's sandbox test rate priced it.
 */

/**
 * The native Apple Pay sheet to show, from the `present_apple_pay` step of Rheon's transaction.
 *
 * @see https://api.rheon.io/docs
 * @typedef {Object} RheonApplePayRequest
 * @property {'present_apple_pay'} type - The step's type.
 * @property {string} amount - The amount of the payment, as a decimal string.
 * @property {string} currency - The currency of the payment (ISO 4217).
 * @property {string} merchantCountryCode - The `countryCode` of the Apple Pay payment request.
 * @property {string} processorName - Who processes the payment, to name on the sheet.
 * @property {string[]} supportedNetworks - The card networks of the Apple Pay payment request.
 * @property {string[]} merchantCapabilities - The merchant capabilities of the Apple Pay payment request.
 * @property {string[]} requiredBillingContactFields - The billing contact fields to request.
 * @property {string[]} [requiredShippingContactFields] - The shipping contact fields to request (the email).
 * @property {{ name: string, url: string }[]} termsLinks - The terms to show the user before they pay.
 * @property {string} expiresAt - When the sheet may no longer be submitted, as an ISO 8601 string.
 * @property {{ method: string, path: string }} submit - Where the token goes; `submitApplePayPayment` sends it there.
 */

/**
 * A transaction as Rheon's `GET /v1/transactions/{id}` shows it.
 *
 * @see https://api.rheon.io/docs
 * @typedef {Object} RheonTransaction
 * @property {string} transactionId - The transaction's id.
 * @property {string} status - Rheon's status ('preparing', 'action_required', 'awaiting_user', 'processing', 'manual_review', 'unknown', 'completed', 'failed', 'expired', 'refunding' or 'refunded').
 * @property {Record<string, unknown> | null} instructions - The user's step, only while the user has to act: `present_apple_pay`, or `open_url` with `purpose: 'provider_kyc'`.
 * @property {RheonAmount} [sourceAmount] - What the user pays.
 * @property {RheonAmount} [expectedDeliveredAmount] - What the quote said reaches the wallet.
 * @property {RheonAmount | null} [deliveredAmount] - What reached the wallet, once it did.
 * @property {string | null} [failureReason] - Why the transaction failed, when it did.
 */

/**
 * The transaction Rheon opened for a native Apple Pay quote.
 *
 * @typedef {Object} RheonApplePayPayment
 * @property {string} transactionId - The transaction's id, for `submitApplePayPayment` and `getTransactionDetail`.
 * @property {RheonApplePayRequest | null} applePay - The Apple Pay sheet to show, or null when Rheon asks for no sheet (read `metadata.status`).
 * @property {RheonTransaction} metadata - The transaction as Rheon answered it.
 */

/**
 * What the Apple Pay sheet returned, for `submitApplePayPayment`.
 *
 * @typedef {Object} RheonApplePayAuthorization
 * @property {string} paymentToken - The base64 of the Apple Pay token's `paymentData` alone (iOS: `payment.token.paymentData.base64EncodedString()`).
 * @property {string} email - The email from the sheet's shipping contact; the same address as the transaction's email.
 * @property {string} firstName - The billing contact's first name.
 * @property {string} lastName - The billing contact's last name.
 * @property {RheonBillingAddress} billingAddress - The billing contact's postal address.
 * @property {string} userIp - The user's public IP address; the same as the quote's.
 */

/**
 * The billing contact's postal address from the Apple Pay sheet.
 *
 * @typedef {Object} RheonBillingAddress
 * @property {string} countryCode - The ISO 3166-1 alpha-2 country code.
 * @property {string} streetLine1 - The first street line.
 * @property {string} [streetLine2] - The second street line.
 * @property {string} [stateCode] - The state or region code.
 * @property {string} city - The city.
 * @property {string} zipCode - The postal code.
 */

/**
 * What Rheon's sandbox played for `simulateCheckout`.
 *
 * @typedef {Object} RheonSimulation
 * @property {string} simulationId - The simulation's id.
 * @property {string} transactionId - The transaction's id.
 * @property {'paid' | 'failed' | 'delivered'} outcome - The outcome played.
 * @property {string} status - Rheon's status of the transaction right after it.
 * @property {true} simulated - Always true.
 * @property {string} transactionUrl - The transaction's path on Rheon's API.
 * @property {string} createdAt - When it was played, as an ISO 8601 string.
 */

/**
 * @typedef {Object} RheonRouteParams
 * @property {string} [chain] - Rheon's chain of the token (e.g., 'solana'); needed when your account has the token on several chains.
 * @property {string} [routeId] - A route id from `GET /v1/config`, to use that route only.
 * @property {'bank' | 'card' | 'apple_pay_hosted' | 'apple_pay'} [method] - Select a widget method, or native Apple Pay for estimates. Estimates price bank and native Apple Pay only; card and hosted Apple Pay are priced inside the widget. Native Apple Pay is never a widget method.
 */

/**
 * @typedef {Object} RheonRequestParams
 * @property {string} [idempotencyKey] - The `Idempotency-Key` of the call, at most 190 characters (default: a random UUID). Send the same key again to retry the same call safely. When a quote first creates the user's customer, those calls take this key with `-customer` and `-requote` appended.
 */

/** @typedef {RheonRouteParams & RheonRequestParams} RheonApplePayQuoteParams */

/** @typedef {Omit<BuyCommonOptions, 'recipient'> & BuyWithFiatAmountOptions & { config?: RheonRouteParams }} RheonQuoteBuyOptions */

/**
 * @typedef {Omit<RheonRouteParams, 'routeId'> & RheonRequestParams & { merchantTransactionId?: string, externalUserId?: string, returnUrl?: string, cancelUrl?: string, locale?: string }} RheonWidgetParams
 */
/** @typedef {BuyCommonOptions & BuyWithFiatAmountOptions & { config?: RheonWidgetParams }} RheonBuyOptions */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SellCommonOptions & import('@tetherto/wdk-wallet/protocols').SellExactCryptoAmountOptions & { config?: RheonWidgetParams }} RheonSellOptions */
/** @typedef {FiatQuote & { metadata: RheonPrice }} RheonSellQuote */

/**
 * @typedef {Object} RheonApplePayUser
 * @property {string} email - The user's email; Rheon's provider identifies the user by it.
 * @property {string} userIp - The user's public IP address.
 * @property {string} country - The user's country of residence (ISO 3166-1 alpha-2).
 * @property {string} [externalId] - Your id for the user. Rheon creates its customer with it when the quote asks for one. Give this or `customerId`.
 * @property {string} [customerId] - Rheon's customer id. Give this or `externalId`.
 */

/** @typedef {BuyCommonOptions & BuyWithFiatAmountOptions & RheonApplePayUser & { config?: RheonApplePayQuoteParams }} RheonApplePayQuoteOptions */

/**
 * @typedef {Object} RheonApplePayPaymentOptions
 * @property {string} quoteId - The `quoteId` of a native Apple Pay quote.
 * @property {string} email - The user's email; the same as the quote's.
 * @property {RheonRequestParams} [config] - The call's options.
 */

/** @typedef {FiatQuote & { metadata: RheonPrice }} RheonBuyQuote */

/** @typedef {RheonBuyQuote & { quoteId: string, expiresAt: string }} RheonApplePayQuote */

/** @typedef {FiatTransactionDetail & { metadata: RheonTransaction }} RheonTransactionDetail */

/** @typedef {SupportedCryptoAsset & { metadata: RheonAsset }} RheonSupportedCryptoAsset */

/** @typedef {SupportedFiatCurrency & { metadata: RheonAsset }} RheonSupportedFiatCurrency */

/**
 * A country, with whether the account's routes allow buying and selling there. A named type of its own, so that
 * the generated declaration keeps `getSupportedCountries` (TypeScript drops a JavaScript override whose type
 * matches the abstract base's).
 *
 * @typedef {Object} RheonSupportedCountry
 * @property {string} code - The country's ISO 3166-1 alpha-2 code.
 * @property {boolean} isBuyAllowed - Whether a buy route allows the country.
 * @property {boolean} isSellAllowed - Whether a sell route allows the country.
 */

const PRODUCT = 'apple_pay_onramp'
const WIDGET_BUY_PRODUCTS = ['bank_onramp', 'card_onramp', 'apple_pay_hosted_onramp']
const WIDGET_SELL_PRODUCTS = ['bank_offramp', 'card_offramp']
// The products Rheon's partner estimate (POST /v1/estimate) prices. Card and hosted Apple Pay are priced only inside the widget.
const ESTIMATED_PRODUCTS = [PRODUCT, 'bank_onramp', 'bank_offramp']

function methodOf (product) {
  if (product === PRODUCT) return 'apple_pay'
  if (product === 'apple_pay_hosted_onramp') return 'apple_pay_hosted'
  return product.startsWith('bank_') ? 'bank' : 'card'
}

/** @param {string} id - The partner order id. @returns {string} The validated id. */
function checkOrderId (id) {
  requireText(id, 'merchantTransactionId')
  if (id.length > 180 || id.startsWith('txn_')) throw new ValueError('merchantTransactionId must be at most 180 characters and must not begin txn_')
  return id
}

const RHEON_CACHE_TIME = 10 * 60 * 1000

/** The longest part of Rheon's error message carried in an error. */
const MAX_ERROR_DETAIL_LENGTH = 300

/**
 * On-chain decimals of the tokens Rheon offers, keyed by `<code>:<chain>` in Rheon's codes.
 */
const ASSET_DECIMALS = {
  'USDC:solana': 6,
  'USDC:solana-sandbox': 6,
  'USDC:base': 6,
  'USDC:base-sepolia': 6,
  'USDC:ethereum': 6,
  'USDC:ethereum-sepolia': 6,
  'USDT:ethereum': 6,
  'USDT:ethereum-sepolia': 6,
  'USDT:tron': 6
}

const ISO_4217_ZERO_DECIMAL_CURRENCIES = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'PYG', 'RWF',
  'UGX', 'UYI', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'
])

const ISO_4217_THREE_DECIMAL_CURRENCIES = new Set(['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND'])

const ISO_4217_FOUR_DECIMAL_CURRENCIES = new Set(['CLF', 'UYW'])

/** The officially assigned ISO 3166-1 alpha-2 codes (249). */
const ISO_3166_ALPHA2 = `AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ
  BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ
  CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ
  DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR
  GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU
  ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ
  LA LB LC LI LK LR LS LT LU LV LY
  MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ
  NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA
  RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ
  TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ
  VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW`.split(/\s+/)

/**
 * Countries whose users never get native Apple Pay through Rheon: the EEA (the 27 EU states, Iceland, Liechtenstein
 * and Norway) and the United Kingdom. Rheon refuses them on the country of residence, the IP's country and the
 * billing country.
 */
const NATIVE_APPLE_PAY_BLOCKED_COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU',
  'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'GB'
])

/**
 * The standardized status of a Rheon transaction status. Only `completed` means the crypto reached the wallet;
 * every status the module does not know is not final.
 *
 * @param {string} status - Rheon's status.
 * @returns {FiatTransactionStatus} The standardized status.
 */
function toWdkStatus (status) {
  if (status === 'completed') return 'completed'
  if (status === 'failed' || status === 'expired' || status === 'refunded') return 'failed'
  return 'in_progress'
}

/**
 * Gets the number of decimal places of a fiat currency's smallest unit, per ISO 4217.
 *
 * @param {string} code - The currency's ISO 4217 code.
 * @returns {number} The number of decimal places.
 */
function getFiatDecimals (code) {
  if (ISO_4217_ZERO_DECIMAL_CURRENCIES.has(code)) return 0
  if (ISO_4217_THREE_DECIMAL_CURRENCIES.has(code)) return 3
  if (ISO_4217_FOUR_DECIMAL_CURRENCIES.has(code)) return 4
  return 2
}

/**
 * Writes an amount in base units as a decimal string with all of its decimal places.
 *
 * @param {bigint} units - The amount, in base units.
 * @param {number} decimals - The number of decimal places of the base unit.
 * @returns {string} The decimal string.
 */
function formatUnits (units, decimals) {
  const digits = units.toString().padStart(decimals + 1, '0')
  const whole = digits.slice(0, digits.length - decimals)
  const fraction = digits.slice(digits.length - decimals)

  return fraction ? `${whole}.${fraction}` : whole
}

/**
 * Reads an amount from Rheon as an amount in base units. Rheon never writes more decimal places than the asset has.
 *
 * @param {unknown} value - The decimal string.
 * @param {number} decimals - The number of decimal places of the base unit.
 * @param {string} subject - What the value is, for the error message.
 * @returns {bigint} The amount, in base units.
 */
function parseUnits (value, decimals, subject) {
  const match = typeof value === 'string' ? /^(\d+)(?:\.(\d+))?$/.exec(value) : null

  if (!match || (match[2] ?? '').length > decimals) {
    throw new RheonApiError(`Rheon answered an unreadable ${subject}`, { status: 200, code: null, details: null, retry: null, requestId: null })
  }

  return BigInt(match[1] + (match[2] ?? '').padEnd(decimals, '0'))
}

/**
 * Reads the fiat pay amount of a purchase; exact receive amounts are not supported.
 *
 * @param {{ cryptoAmount?: number | bigint, fiatAmount?: number | bigint }} options - The operation's options.
 * @returns {bigint} The fiat amount, in base units.
 */
function readFiatAmount (options) {
  if (options.cryptoAmount !== undefined) {
    throw new ValueError('Purchases are priced by fiat amount only: pass \'fiatAmount\' instead of \'cryptoAmount\'')
  }

  const amount = options.fiatAmount

  if (amount === undefined) {
    throw new ValueError('\'fiatAmount\' must be provided')
  }

  if ((typeof amount !== 'bigint' && !Number.isSafeInteger(amount)) || amount <= 0) {
    throw new ValueError('\'fiatAmount\' must be a positive integer amount in base units')
  }

  return BigInt(amount)
}

/**
 * Throws a value error when a required text option is missing or empty.
 *
 * @param {unknown} value - The option's value.
 * @param {string} name - The option's name.
 */
function requireText (value, name) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ValueError(`'${name}' must be a non-empty string`)
  }
}

/**
 * Builds the error for one of Rheon's refusals, from its error envelope.
 *
 * @param {number} status - The HTTP status code of Rheon's answer.
 * @param {unknown} body - The JSON body of Rheon's answer.
 * @param {string} subject - What was asked for, for the error message.
 * @returns {RheonApiError} The error.
 */
function apiErrorFor (status, body, subject) {
  const error = body !== null && typeof body === 'object' ? body.error : undefined

  const code = typeof error?.code === 'string' ? error.code : null
  const message = typeof error?.message === 'string' ? error.message.slice(0, MAX_ERROR_DETAIL_LENGTH) : ''

  return new RheonApiError(`Rheon refused the ${subject}: ${status}${code ? ` ${code}` : ''}${message ? ` (${message})` : ''}`, {
    status,
    code,
    details: error?.details ?? null,
    retry: error?.retry ?? null,
    requestId: typeof error?.requestId === 'string' ? error.requestId : null
  })
}

export default class RheonProtocol extends FiatProtocol {
  /**
   * Creates a new interface to interact with Rheon without binding it to a wallet account.
   *
   * @overload
   * @param {undefined} account - The wallet account to use to interact with the protocol.
   * @param {RheonProtocolConfig} config - The Rheon protocol configuration.
   * @throws {RheonConfigurationError} If the configuration has no `request` callback.
   */

  /**
   * Creates a new read-only interface to interact with Rheon.
   *
   * @overload
   * @param {IWalletAccountReadOnly} account - The wallet account whose address receives the bought crypto.
   * @param {RheonProtocolConfig} config - The Rheon protocol configuration.
   * @throws {RheonConfigurationError} If the configuration has no `request` callback.
   */

  /**
   * Creates a new interface to interact with Rheon.
   *
   * @overload
   * @param {IWalletAccount} account - The wallet account whose address receives the bought crypto.
   * @param {RheonProtocolConfig} config - The Rheon protocol configuration.
   * @throws {RheonConfigurationError} If the configuration has no `request` callback.
   */
  constructor (account, { request, cacheTime = RHEON_CACHE_TIME, assetDecimals, merchantTransactionId = globalThis.crypto.randomUUID() } = {}) {
    super(account)

    if (typeof request !== 'function') {
      throw new RheonConfigurationError('\'request\' is required: the callback that sends calls to Rheon\'s API from your backend')
    }

    /** @private */
    this._request = request

    /** @private */
    this._cacheTime = cacheTime

    /** @private */
    this._assetDecimals = { ...ASSET_DECIMALS, ...assetDecimals }

    /** @private */
    this._routesCache = undefined

    /** The default widget order id. Persist it before opening the URL; no API secret is stored. @type {string} */
    this.merchantTransactionId = checkOrderId(merchantTransactionId)
  }

  /**
   * Gets a quote for a crypto asset purchase, from Rheon's estimate, for a bank or native Apple Pay route. Card and hosted Apple Pay
   * are priced only inside the widget (`buy`). The estimate has no user:
   * a user's quote (`quoteApplePay`) can differ, and does not tell whether the user gets native Apple Pay.
   * Native Apple Pay is priced by fiat amount only.
   *
   * @param {RheonQuoteBuyOptions} options - The options for the buy operation.
   * @returns {Promise<RheonBuyQuote>} A quote for the transaction: the fiat amount the user pays (fees included), the crypto amount that reaches the wallet, and the total fee in the fiat currency.
   * @throws {ValueError} If 'cryptoAmount' is given, 'fiatAmount' is missing or not a positive integer, the account has no matching route for the asset, chain and fiat currency, or only card or hosted Apple Pay routes match.
   * @throws {RheonConfigurationError} If the module does not know the token's on-chain decimals.
   * @throws {RheonApiError} If Rheon refuses the estimate (e.g., an amount outside the route's limits) or answers for other assets or amounts.
   * @throws {RheonCallbackError} If the `request` callback resolves to anything but `{ status, body }`.
   * @throws {ProviderError} If Rheon fails with a server error.
   */
  async quoteBuy (options) {
    const { cryptoAsset, fiatCurrency, config = {} } = options

    const fiatUnits = readFiatAmount(options)

    const { route, cryptoDecimals, fiatDecimals } = await this._findRoute(cryptoAsset, fiatCurrency, config, { native: false, estimate: true })

    const estimate = await this._call('POST', '/v1/estimate', 'estimate', {
      body: { provider: route.provider, routeId: route.routeId, exactMode: 'exact_in', amount: formatUnits(fiatUnits, fiatDecimals) }
    })

    return this._toQuote(estimate, route, fiatUnits, cryptoDecimals, fiatDecimals)
  }

  /**
   * Open a Rheon widget visit, with its receiving wallet, asset, fiat and pay amount locked.
   *
   * @param {RheonBuyOptions} options - Fiat amount in base units; recipient defaults to the account.
   * @returns {Promise<BuyResult>} Only the widget URL; save config.merchantTransactionId or the instance's generated id for status.
   */
  async buy (options) {
    return { buyUrl: await this._widgetUrl('buy', options) }
  }

  /**
   * Estimate a sale by crypto pay amount, on a bank route (card is priced only inside the widget, `sell`). Fee is converted to fiat, half-up to its minor unit.
   *
   * @param {Omit<RheonSellOptions, 'refundAddress' | 'config'> & { config?: RheonRouteParams }} options - Crypto amount in base units.
   * @returns {Promise<RheonSellQuote>} Indicative sell quote; rate is fiat units per token, to 18 decimal places.
   */
  async quoteSell (options) {
    const units = this._sellAmount(options)
    const { route, cryptoDecimals, fiatDecimals } = await this._findRoute(options.cryptoAsset, options.fiatCurrency, options.config ?? {}, { sell: true, native: false, estimate: true })
    const price = await this._call('POST', '/v1/estimate', 'sell estimate', {
      body: { provider: route.provider, routeId: route.routeId, exactMode: 'exact_in', amount: formatUnits(units, cryptoDecimals) }
    })
    const source = price.sourceAmount
    const receive = price.expectedDeliveredAmount
    const fee = price.totalFee
    if (source?.asset?.code !== route.from.code || source?.asset?.chain !== route.from.chain || receive?.asset?.code !== route.to.code || fee?.asset?.code !== route.from.code || fee?.asset?.chain !== route.from.chain || parseUnits(source?.amount, cryptoDecimals, 'crypto amount') !== units) {
      throw new RheonApiError('Rheon answered a sell price for other assets or amount', { status: 201, code: null, details: null, retry: null, requestId: null })
    }
    const match = typeof price.fxRate === 'string' && /^(\d+)(?:\.(\d+))?$/.exec(price.fxRate)
    if (!match) throw new RheonApiError('Rheon answered an unreadable sell rate', { status: 201, code: null, details: null, retry: null, requestId: null })
    const numerator = BigInt(match[1] + (match[2] ?? ''))
    const denominator = 10n ** BigInt((match[2] ?? '').length)
    if (numerator === 0n) throw new RheonApiError('Rheon answered a zero sell rate', { status: 201, code: null, details: null, retry: null, requestId: null })
    const fiatFeeNumerator = parseUnits(fee.amount, cryptoDecimals, 'fee') * denominator * 10n ** BigInt(fiatDecimals)
    const fiatFeeDenominator = numerator * 10n ** BigInt(cryptoDecimals)
    return {
      cryptoAmount: units,
      fiatAmount: parseUnits(receive.amount, fiatDecimals, 'fiat amount'),
      fee: (2n * fiatFeeNumerator + fiatFeeDenominator) / (2n * fiatFeeDenominator),
      rate: formatUnits(denominator * 10n ** 18n / numerator, 18),
      metadata: price
    }
  }

  /**
   * Open a Rheon sell widget. The account/refundAddress is the fixed source and refund wallet; no signing occurs.
   *
   * @param {RheonSellOptions} options - Crypto pay amount in base units.
   * @returns {Promise<SellResult>} Only the widget URL.
   */
  async sell (options) {
    return { sellUrl: await this._widgetUrl('sell', options) }
  }

  /** @private */
  _sellAmount (options) {
    const amount = options.cryptoAmount
    if (options.fiatAmount !== undefined || (typeof amount !== 'bigint' && !Number.isSafeInteger(amount)) || amount <= 0) {
      throw new ValueError('Sell requires a positive integer cryptoAmount in base units, without fiatAmount')
    }
    return BigInt(amount)
  }

  /** @private */
  async _widgetUrl (journey, options) {
    const { cryptoAsset, fiatCurrency, config = {} } = options
    const sell = journey === 'sell'
    const units = sell ? this._sellAmount(options) : readFiatAmount(options)
    const orderId = checkOrderId(config.merchantTransactionId ?? this.merchantTransactionId)
    if (config.routeId !== undefined) throw new ValueError('Widget sessions fix corridor and method, not routeId; omit config.routeId')
    const { route, cryptoDecimals, fiatDecimals } = await this._findRoute(cryptoAsset, fiatCurrency, config, { sell, native: false, widget: true })
    const address = (sell ? options.refundAddress : options.recipient) ?? await this._account?.getAddress()
    requireText(address, sell ? 'refundAddress' : 'recipient')
    const token = sell ? route.from : route.to
    const body = {
      journeys: [journey],
      destination: { mode: 'partner_fixed', walletAddress: address, chain: token.chain, assets: [token.code] },
      asset: { symbol: token.code, chain: token.chain },
      assetLocked: true,
      fiatCurrency,
      fiatCurrencyLocked: true,
      amount: formatUnits(units, sell ? cryptoDecimals : fiatDecimals),
      amountLocked: true,
      enabledMethods: [methodOf(route.product)],
      externalOrderId: orderId
    }
    for (const field of ['externalUserId', 'returnUrl', 'cancelUrl', 'locale']) {
      if (config[field] !== undefined) body[field] = config[field]
    }
    const session = await this._call('POST', '/v1/widget/sessions', 'widget session', { body, idempotencyKey: config.idempotencyKey ?? `wdk:${createHash('sha256').update(orderId).digest('hex')}` })
    let url
    try { url = new URL(session.widgetUrl) } catch {}
    if (session.launchable === false || !url || url.protocol !== 'https:' || url.username || url.password) {
      throw new RheonApiError('Rheon did not return a launchable HTTPS widget URL; do not retry with a new order id for an existing payment', { status: 201, code: null, details: null, retry: null, requestId: null })
    }
    return session.widgetUrl
  }

  /**
   * Gets a firm native Apple Pay quote for one user, valid for one payment until its `expiresAt` (about 3 minutes).
   * When Rheon has no customer yet for the user's `externalId`, the module creates it (native Apple Pay routes need
   * only the id: the provider verifies the user itself) and asks again. The crypto goes to `recipient`, else the
   * account's address.
   *
   * @param {RheonApplePayQuoteOptions} options - The purchase and the paying user.
   * @returns {Promise<RheonApplePayQuote>} The quote, with its `quoteId` and `expiresAt`.
   * @throws {ValueError} If 'cryptoAmount' is given, 'fiatAmount' is missing or not a positive integer, or the account has no native Apple Pay route for the asset, chain and fiat currency.
   * @throws {ValueError} If 'email', 'userIp' or 'country' is missing, or not exactly one of 'externalId' and 'customerId' is given.
   * @throws {ValueError} If neither a recipient nor a wallet account gives the address to receive the crypto.
   * @throws {RheonConfigurationError} If the module does not know the token's on-chain decimals.
   * @throws {RheonApiError} If Rheon refuses the quote: e.g., `no_route` with `details.reason: 'not_available_for_user'` (native Apple Pay is not offered to this user), or `identity_required` with the user's next step in `details`.
   * @throws {RheonCallbackError} If the `request` callback resolves to anything but `{ status, body }`.
   * @throws {ProviderError} If Rheon fails with a server error.
   */
  async quoteApplePay (options) {
    const { cryptoAsset, fiatCurrency, recipient, email, userIp, country, externalId, customerId, config = {} } = options

    const fiatUnits = readFiatAmount(options)

    requireText(email, 'email')
    requireText(userIp, 'userIp')
    requireText(country, 'country')

    if ((externalId === undefined) === (customerId === undefined)) {
      throw new ValueError('Give exactly one of \'externalId\' and \'customerId\' to name the user')
    }

    const { route, cryptoDecimals, fiatDecimals } = await this._findRoute(cryptoAsset, fiatCurrency, config)

    const walletAddress = recipient ?? await this._account?.getAddress()

    if (!walletAddress) {
      throw new ValueError('A \'recipient\' or a wallet account is required: the crypto is sent to this address')
    }

    const body = {
      provider: route.provider,
      routeId: route.routeId,
      ...(externalId !== undefined ? { externalId } : { customerId }),
      exactMode: 'exact_in',
      amount: formatUnits(fiatUnits, fiatDecimals),
      email,
      destination: { walletAddress },
      userIp,
      country
    }

    let quote

    try {
      quote = await this._call('POST', '/v1/quote', 'quote', { body, idempotencyKey: config.idempotencyKey })
    } catch (error) {
      if (!(error instanceof RheonApiError) || error.code !== 'identity_required' || error.details?.nextAction?.type !== 'create_customer' || externalId === undefined) {
        throw error
      }

      const key = config.idempotencyKey

      await this._createCustomer(externalId, key === undefined ? undefined : `${key}-customer`)

      quote = await this._call('POST', '/v1/quote', 'quote', { body, idempotencyKey: key === undefined ? undefined : `${key}-requote` })
    }

    if (typeof quote.quoteId !== 'string' || typeof quote.expiresAt !== 'string') {
      throw new RheonApiError('Rheon answered the quote without its quoteId or expiresAt', { status: 201, code: null, details: null, retry: null, requestId: null })
    }

    return {
      ...this._toQuote(quote, route, fiatUnits, cryptoDecimals, fiatDecimals),
      quoteId: quote.quoteId,
      expiresAt: quote.expiresAt
    }
  }

  /**
   * Opens Rheon's transaction for a native Apple Pay quote. Nothing is charged: the answer is the Apple Pay sheet to
   * show the user, until its `expiresAt`.
   *
   * @param {RheonApplePayPaymentOptions} options - The quote and the user's email.
   * @returns {Promise<RheonApplePayPayment>} The transaction's id and the Apple Pay sheet to show.
   * @throws {ValueError} If 'quoteId' or 'email' is missing.
   * @throws {RheonApiError} If Rheon refuses the transaction (e.g., `quote_expired`: quote again).
   * @throws {RheonCallbackError} If the `request` callback resolves to anything but `{ status, body }`.
   * @throws {ProviderError} If Rheon fails with a server error.
   */
  async createApplePayPayment ({ quoteId, email, config = {} }) {
    requireText(quoteId, 'quoteId')
    requireText(email, 'email')

    const transaction = await this._call('POST', '/v1/transactions', 'transaction', {
      body: { quoteId, email },
      idempotencyKey: config.idempotencyKey
    })

    this._checkTransaction(transaction, 'transaction')

    return {
      transactionId: transaction.transactionId,
      applePay: transaction.instructions?.type === 'present_apple_pay' ? transaction.instructions : null,
      metadata: transaction
    }
  }

  /**
   * Submits what the Apple Pay sheet returned. Rheon charges the payment at most once. On `in_progress`, read
   * `metadata.status`: `processing` (poll `getTransactionDetail`), `action_required` with an `open_url` step of purpose
   * `provider_kyc` in `metadata.instructions` (open it for the user's verification), or `unknown` (the payment may have
   * been taken: close the sheet as a success, poll, and never start a new payment for the user meanwhile).
   *
   * @param {string} transactionId - The transaction's id from `createApplePayPayment`.
   * @param {RheonApplePayAuthorization} authorization - What the Apple Pay sheet returned.
   * @param {RheonRequestParams} [config] - The call's options.
   * @returns {Promise<RheonTransactionDetail>} The transaction after the submit.
   * @throws {ValueError} If the transaction id or the payment token is missing.
   * @throws {RheonApiError} If Rheon refuses the payment (e.g., `quote_expired`, or `invalid_state` with `details.reason: 'payment_already_submitted'`).
   * @throws {RheonCallbackError} If the `request` callback resolves to anything but `{ status, body }`.
   * @throws {ProviderError} If Rheon fails with a server error.
   */
  async submitApplePayPayment (transactionId, authorization, config = {}) {
    requireText(transactionId, 'transactionId')
    requireText(authorization?.paymentToken, 'paymentToken')

    const { paymentToken, email, firstName, lastName, billingAddress, userIp } = authorization

    const transaction = await this._call('POST', `/v1/transactions/${encodeURIComponent(transactionId)}/apple-pay`, 'Apple Pay payment', {
      body: { paymentToken, email, firstName, lastName, billingAddress, userIp },
      idempotencyKey: config.idempotencyKey
    })

    return this._toDetail(transaction, 'Apple Pay payment')
  }

  /**
   * Retrieves the details of a specific transaction from Rheon. It is `completed` only when the crypto reached the
   * wallet; `failed` when it failed, expired or was refunded; `in_progress` otherwise (including Rheon's `unknown` and
   * `manual_review`, and any status the module does not know). The user's current step is in `metadata.instructions`.
   *
   * @param {string} txId - The widget's merchantTransactionId, or a native `txn_` id from `createApplePayPayment`.
   * @returns {Promise<RheonTransactionDetail>} The transaction details.
   * @throws {ValueError} If the transaction id is empty.
   * @throws {NoSuchElementError} If Rheon has no transaction of your account with this id.
   * @throws {RheonApiError} If Rheon refuses the read or answers an unreadable transaction.
   * @throws {RheonCallbackError} If the `request` callback resolves to anything but `{ status, body }`.
   * @throws {ProviderError} If Rheon fails with a server error.
   */
  async getTransactionDetail (txId) {
    requireText(txId, 'txId')

    let transaction

    try {
      let transactionId = txId
      if (!txId.startsWith('txn_')) {
        const order = await this._call('GET', `/v1/widget/orders?externalOrderId=${encodeURIComponent(txId)}`, 'widget order')
        requireText(order.transactionId, 'transactionId')
        transactionId = order.transactionId
      }
      transaction = await this._call('GET', `/v1/transactions/${encodeURIComponent(transactionId)}`, 'transaction')
    } catch (error) {
      if (error instanceof RheonApiError && error.status === 404) {
        throw new NoSuchElementError(`Rheon has no transaction with the id '${txId}'`, { cause: error })
      }

      throw error
    }

    return this._toDetail(transaction, 'transaction')
  }

  /**
   * Sandbox keys only: plays what happens next on a native Apple Pay transaction, as if the provider reported it.
   * `paid` moves it to `processing`, `delivered` to `completed`, `failed` to `failed`. Nothing is charged.
   *
   * @param {string} transactionId - The transaction's id from `createApplePayPayment`.
   * @param {'paid' | 'failed' | 'delivered'} outcome - The outcome to play.
   * @param {RheonRequestParams} [config] - The call's options.
   * @returns {Promise<RheonSimulation>} What Rheon's sandbox played.
   * @throws {ValueError} If the transaction id is empty or the outcome is not 'paid', 'failed' or 'delivered'.
   * @throws {RheonApiError} If Rheon refuses it (e.g., `permission_denied` with `details.reason: 'sandbox_only'` on a production key).
   * @throws {RheonCallbackError} If the `request` callback resolves to anything but `{ status, body }`.
   * @throws {ProviderError} If Rheon fails with a server error.
   */
  async simulateCheckout (transactionId, outcome, config = {}) {
    requireText(transactionId, 'transactionId')

    if (!['paid', 'failed', 'delivered'].includes(outcome)) {
      throw new ValueError('\'outcome\' must be \'paid\', \'failed\' or \'delivered\'')
    }

    return this._call('POST', `/v1/transactions/${encodeURIComponent(transactionId)}/simulate-checkout`, 'simulated checkout', {
      body: { outcome },
      idempotencyKey: config.idempotencyKey
    })
  }

  /**
   * Retrieves a list of supported crypto assets from the provider: the tokens of the buy/sell routes your
   * account can quote, once per chain, whose on-chain decimals the module knows.
   *
   * @returns {Promise<RheonSupportedCryptoAsset[]>} An array of supported crypto assets.
   * @throws {RheonApiError} If Rheon refuses the read of your account's routes or answers it unreadably.
   * @throws {RheonCallbackError} If the `request` callback resolves to anything but `{ status, body }`.
   * @throws {ProviderError} If Rheon fails with a server error.
   */
  async getSupportedCryptoAssets () {
    const routes = await this._getRoutes()

    const assets = new Map()

    for (const route of routes) {
      const to = WIDGET_SELL_PRODUCTS.includes(route.product) ? route.from : route.to
      const key = `${to.code}:${to.chain}`

      if (!assets.has(key) && this._assetDecimals[key] !== undefined) {
        assets.set(key, { code: to.code, networkCode: to.chain, decimals: this._assetDecimals[key], metadata: to })
      }
    }

    return [...assets.values()]
  }

  /**
   * Retrieves a list of supported fiat currencies from the provider: the currencies the buy/sell routes your
   * account can quote take, with their ISO 4217 decimals.
   *
   * @returns {Promise<RheonSupportedFiatCurrency[]>} An array of supported fiat currencies.
   * @throws {RheonApiError} If Rheon refuses the read of your account's routes or answers it unreadably.
   * @throws {RheonCallbackError} If the `request` callback resolves to anything but `{ status, body }`.
   * @throws {ProviderError} If Rheon fails with a server error.
   */
  async getSupportedFiatCurrencies () {
    const routes = await this._getRoutes()

    const currencies = new Map()

    for (const route of routes) {
      const from = WIDGET_SELL_PRODUCTS.includes(route.product) ? route.to : route.from
      if (!currencies.has(from.code)) {
        currencies.set(from.code, { code: from.code, decimals: getFiatDecimals(from.code), metadata: from })
      }
    }

    return [...currencies.values()]
  }

  /**
   * Retrieves indicative country support from enabled pricing routes and their blocked-country lists. Native Apple
   * Pay also excludes the EEA/UK. Widget buy and sell have independent flags; the provider can still refuse a user.
   *
   * @returns {Promise<RheonSupportedCountry[]>} Every ISO 3166-1 alpha-2 country, with whether buying and selling are allowed.
   * @throws {RheonApiError} If Rheon refuses the read of your account's routes or answers it unreadably.
   * @throws {RheonCallbackError} If the `request` callback resolves to anything but `{ status, body }`.
   * @throws {ProviderError} If Rheon fails with a server error.
   */
  async getSupportedCountries () {
    const routes = await this._getRoutes()

    return ISO_3166_ALPHA2.map((code) => ({
      code,
      isBuyAllowed: routes.some((route) => !WIDGET_SELL_PRODUCTS.includes(route.product) && !route.blockedCountries.includes(code) && (route.product !== PRODUCT || !NATIVE_APPLE_PAY_BLOCKED_COUNTRIES.has(code))),
      isSellAllowed: routes.some((route) => WIDGET_SELL_PRODUCTS.includes(route.product) && !route.blockedCountries.includes(code))
    }))
  }

  /** @private */
  async _createCustomer (externalId, idempotencyKey) {
    try {
      await this._call('POST', '/v1/customers', 'customer', { body: { externalId }, idempotencyKey })
    } catch (error) {
      if (!(error instanceof RheonApiError) || error.code !== 'customer_exists') {
        throw error
      }
    }
  }

  /** @private */
  _toQuote (price, route, fiatUnits, cryptoDecimals, fiatDecimals) {
    const { sourceAmount, expectedDeliveredAmount, totalFee } = price

    if (sourceAmount?.asset?.code !== route.from.code || expectedDeliveredAmount?.asset?.code !== route.to.code ||
      expectedDeliveredAmount?.asset?.chain !== route.to.chain || totalFee?.asset?.code !== route.from.code) {
      throw new RheonApiError('Rheon answered a price for other assets than requested', { status: 201, code: null, details: null, retry: null, requestId: null })
    }

    const fiatAmount = parseUnits(sourceAmount.amount, fiatDecimals, 'fiat amount')

    if (fiatAmount !== fiatUnits) {
      throw new RheonApiError('Rheon answered a price for another amount than requested', { status: 201, code: null, details: null, retry: null, requestId: null })
    }

    const rate = typeof price.fxRate === 'string' && /^(\d+)(?:\.(\d+))?$/.exec(price.fxRate)

    if (!rate || /^0*$/.test(rate[1] + (rate[2] ?? ''))) {
      throw new RheonApiError('Rheon answered a price without a positive decimal rate', { status: 201, code: null, details: null, retry: null, requestId: null })
    }

    return {
      cryptoAmount: parseUnits(expectedDeliveredAmount.amount, cryptoDecimals, 'crypto amount'),
      fiatAmount,
      fee: parseUnits(totalFee.amount, fiatDecimals, 'fee'),
      rate: price.fxRate,
      metadata: price
    }
  }

  /** @private */
  _checkTransaction (transaction, subject) {
    if (typeof transaction.transactionId !== 'string' || typeof transaction.status !== 'string') {
      throw new RheonApiError(`Rheon answered the ${subject} without its transactionId or status`, { status: 200, code: null, details: null, retry: null, requestId: null })
    }
  }

  /** @private */
  _toDetail (transaction, subject) {
    this._checkTransaction(transaction, subject)
    const sell = WIDGET_SELL_PRODUCTS.includes(transaction.product)

    return {
      status: toWdkStatus(transaction.status),
      cryptoAsset: (sell ? transaction.sourceAmount : transaction.expectedDeliveredAmount)?.asset?.code,
      fiatCurrency: (sell ? transaction.expectedDeliveredAmount : transaction.sourceAmount)?.asset?.code,
      metadata: transaction
    }
  }

  /** @private */
  async _findRoute (cryptoAsset, fiatCurrency, { chain, routeId, method }, { sell = false, native = true, widget = false, estimate = false } = {}) {
    const matching = (await this._getRoutes()).filter((route) =>
      (native ? route.product === PRODUCT : sell ? WIDGET_SELL_PRODUCTS.includes(route.product) : (widget ? WIDGET_BUY_PRODUCTS : [PRODUCT, ...WIDGET_BUY_PRODUCTS]).includes(route.product)) &&
      route[sell ? 'from' : 'to'].code === cryptoAsset && route[sell ? 'to' : 'from'].code === fiatCurrency &&
      (chain === undefined || route[sell ? 'from' : 'to'].chain === chain) && (routeId === undefined || route.routeId === routeId) &&
      (method === undefined || methodOf(route.product) === method))
    const routes = estimate ? matching.filter((route) => ESTIMATED_PRODUCTS.includes(route.product)) : matching

    if (routes.length === 0 && matching.length > 0) {
      throw new ValueError(`Rheon prices card and hosted Apple Pay routes only inside its widget, not by estimate: ${sell ? 'sell' : 'buy'}() opens the widget, which shows the price. quoteBuy and quoteSell estimate bank and native Apple Pay routes`)
    }

    if (routes.length === 0) {
      throw new ValueError(`Rheon offers your account no ${native ? 'native Apple Pay' : sell ? 'sell' : 'buy'} route from '${fiatCurrency}' to '${cryptoAsset}'${chain !== undefined ? ` on '${chain}'` : ''}`)
    }

    const chains = [...new Set(routes.map((route) => route[sell ? 'from' : 'to'].chain))]

    if (chains.length > 1) {
      throw new ValueError(`Rheon offers '${cryptoAsset}' on several chains (${chains.join(', ')}): set 'config.chain'`)
    }

    const [route] = routes
    const token = route[sell ? 'from' : 'to']
    const cryptoDecimals = this._assetDecimals[`${token.code}:${token.chain}`]

    if (cryptoDecimals === undefined) {
      throw new RheonConfigurationError(`The on-chain decimals of '${token.code}' on '${token.chain}' are unknown: set them in the 'assetDecimals' option`)
    }

    return { route, cryptoDecimals, fiatDecimals: getFiatDecimals(route[sell ? 'to' : 'from'].code) }
  }

  /** @private */
  async _getRoutes () {
    const now = Date.now()

    if (!this._routesCache || now - this._routesCache.timestamp >= this._cacheTime) {
      const config = await this._call('GET', '/v1/config', 'routes of your account')

      if (!Array.isArray(config.routes)) {
        throw new RheonApiError('Rheon answered the routes of your account unreadably', { status: 200, code: null, details: null, retry: null, requestId: null })
      }

      const routes = config.routes.filter((route) =>
        [PRODUCT, ...WIDGET_BUY_PRODUCTS, ...WIDGET_SELL_PRODUCTS].includes(route?.product) && route.availability?.pricing?.enabled === true &&
        typeof route.from?.code === 'string' && typeof route.to?.code === 'string' &&
        typeof route[WIDGET_SELL_PRODUCTS.includes(route.product) ? 'from' : 'to']?.chain === 'string')
        .map((route) => ({ ...route, blockedCountries: Array.isArray(route.blockedCountries) ? route.blockedCountries : [] }))

      this._routesCache = { timestamp: now, routes }
    }

    return this._routesCache.routes
  }

  /** @private */
  async _call (method, path, subject, { body, idempotencyKey } = {}) {
    const request = { method, path, headers: {} }

    if (method === 'POST') {
      request.headers['Idempotency-Key'] = idempotencyKey ?? globalThis.crypto.randomUUID()
      request.body = body
    }

    const response = await this._request(request)

    if (response === null || typeof response !== 'object' || !Number.isInteger(response.status) || !('body' in response)) {
      throw new RheonCallbackError('request must resolve to { status, body }: the HTTP status and the parsed JSON body of Rheon\'s answer')
    }

    const { status, body: answer } = response

    if (status >= 500) {
      throw new ProviderError(`Rheon failed to answer the ${subject}: ${status}`, {
        reason: ProviderErrorReason.INTERNAL_SERVER_ERROR,
        cause: apiErrorFor(status, answer, subject)
      })
    }

    if (status < 200 || status >= 300) {
      throw apiErrorFor(status, answer, subject)
    }

    if (answer === null || typeof answer !== 'object' || Array.isArray(answer)) {
      throw new RheonApiError(`Rheon answered the ${subject} with an unreadable body`, { status, code: null, details: null, retry: null, requestId: null })
    }

    return answer
  }
}
