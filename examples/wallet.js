// Copyright 2026 Rheon. Evaluation use only: see LICENSE.

// The wallet side of one native Apple Pay purchase in Rheon's sandbox, end to end, with no real card:
// Rheon's sandbox test token stands in for the Apple Pay sheet, and a simulated checkout for the provider.
// Start examples/backend.js first, then run: node --env-file=.env examples/wallet.js
//
// Every call goes to Rheon's sandbox through the backend. Nothing is charged.

'use strict'

import { randomUUID } from 'node:crypto'

import RheonProtocol from '../index.js'

const {
  BACKEND_URL = 'http://127.0.0.1:8787',
  WALLET_ADDRESS,
  USER_EMAIL = 'wdk-example@example.com',
  USER_IP = '8.8.8.8',
  USER_COUNTRY = 'US',
  CRYPTO_ASSET,
  CHAIN,
  FIAT_CURRENCY,
  SHOW_LINK,
  TRANSACTION_ID
} = process.env

/** Rheon's documented test token, with a fresh payment id for every purchase. */
const SANDBOX_TEST_TOKEN = Buffer.from(JSON.stringify({
  version: 'EC_v1',
  data: Buffer.from('RHEON_SANDBOX_TEST_TOKEN').toString('base64'),
  signature: Buffer.from('RHEON_SANDBOX_TEST_SIGNATURE').toString('base64'),
  header: {
    ephemeralPublicKey: Buffer.from('RHEON_SANDBOX_TEST_KEY').toString('base64'),
    publicKeyHash: Buffer.from('RHEON_SANDBOX_TEST_HASH').toString('base64'),
    transactionId: randomUUID().replaceAll('-', '')
  }
})).toString('base64')

async function request (call) {
  const response = await fetch(`${BACKEND_URL}/rheon`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(call)
  })

  if (!response.ok) throw new Error(`The backend failed: ${response.status}`)

  return response.json()
}

/** Prints the verification step of a held payment; the link only with SHOW_LINK=1, as it is the user's own. */
function showVerification (transactionId, instructions) {
  console.log(`The user must be verified first (payment hold: ${instructions.paymentHold?.status}, until ${instructions.paymentHold?.until ?? instructions.expiresAt}).`,
    SHOW_LINK === '1'
      ? `Open: ${instructions.url}`
      : `To print the link of this same payment, without creating another: SHOW_LINK=1 TRANSACTION_ID=${transactionId} node --env-file=.env examples/wallet.js`)
}

const rheon = new RheonProtocol(undefined, { request })

// TRANSACTION_ID: read an existing payment again (e.g., to print its verification link). Creates nothing.
if (TRANSACTION_ID) {
  const existing = await rheon.getTransactionDetail(TRANSACTION_ID)
  const { status, instructions } = existing.metadata
  console.log('Transaction:', existing.status, `(${status})`)
  if (status === 'action_required' && instructions?.type === 'open_url') showVerification(TRANSACTION_ID, instructions)
  process.exit(0)
}

if (!WALLET_ADDRESS) throw new Error('Set WALLET_ADDRESS in .env: the address that receives the test tokens')

// The route: CRYPTO_ASSET, CHAIN and FIAT_CURRENCY from .env, else the account's first token and currency.
const assets = await rheon.getSupportedCryptoAssets()
const asset = assets.find(({ code, networkCode }) => (!CRYPTO_ASSET || code === CRYPTO_ASSET) && (!CHAIN || networkCode === CHAIN))

if (!asset) throw new Error('Your Rheon account has no quotable native Apple Pay route for this token')

const currencies = await rheon.getSupportedFiatCurrencies()
const currency = currencies.find(({ code }) => !FIAT_CURRENCY || code === FIAT_CURRENCY)

if (!currency) throw new Error('Your Rheon account has no quotable native Apple Pay route in this currency')

console.log('Route:', currency.code, '->', asset.code, 'on', asset.networkCode)

const options = { cryptoAsset: asset.code, fiatCurrency: currency.code, fiatAmount: 50n * 10n ** BigInt(currency.decimals), config: { chain: asset.networkCode } }

console.log('Estimate:', await rheon.quoteBuy(options))

const quote = await rheon.quoteApplePay({ ...options, recipient: WALLET_ADDRESS, externalId: `wdk-example-${USER_EMAIL}`, email: USER_EMAIL, userIp: USER_IP, country: USER_COUNTRY })

if (quote.metadata.simulated !== true) throw new Error('This example needs a sandbox account enabled for simulated pricing (metadata.simulated); no payment was created')

console.log('Quote:', quote.quoteId, 'until', quote.expiresAt)

const payment = await rheon.createApplePayPayment({ quoteId: quote.quoteId, email: USER_EMAIL })

if (!payment.applePay) throw new Error(`Rheon asked for no Apple Pay sheet: ${payment.metadata.status}`)

console.log('Apple Pay sheet:', payment.applePay)

// What the sheet would return. A fixed key: if this call's answer is lost, sending it again with the same key is safe.
const submitKey = `wdk-example-submit-${payment.transactionId}`

const submitted = await rheon.submitApplePayPayment(payment.transactionId, {
  paymentToken: SANDBOX_TEST_TOKEN,
  email: USER_EMAIL,
  firstName: 'Alex',
  lastName: 'Taylor',
  billingAddress: { countryCode: USER_COUNTRY, streetLine1: 'Asden Ct', city: 'Reynoldsburg', stateCode: 'OH', zipCode: '43068' },
  userIp: USER_IP
}, { idempotencyKey: submitKey })

const { status, instructions } = submitted.metadata

console.log('After the submit:', status)

if (status === 'action_required' && instructions?.type === 'open_url') {
  showVerification(payment.transactionId, instructions)
} else if (status === 'processing') {
  console.log('Simulated paid:', await rheon.simulateCheckout(payment.transactionId, 'paid'))
  console.log('Simulated:', await rheon.simulateCheckout(payment.transactionId, 'delivered'))
} else {
  console.log('Nothing to simulate now. On unknown or manual_review, keep polling and never start a new payment.')
}

let detail = await rheon.getTransactionDetail(payment.transactionId)

for (let attempt = 1; detail.status === 'in_progress' && attempt < 5; attempt++) {
  await new Promise((resolve) => setTimeout(resolve, 2_000))
  detail = await rheon.getTransactionDetail(payment.transactionId)
}

console.log('Transaction:', detail.status, detail.metadata.deliveredAmount ?? '')
