// Copyright 2026 Rheon. Evaluation use only: see LICENSE.
// Generate a sandbox widget link only: no payment, signing or token transfer.
'use strict'

import RheonProtocol from '../index.js'

// An empty value, as in a copied .env.example, means the default.
const env = Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== ''))
const { BACKEND_URL = 'http://127.0.0.1:8787', WALLET_ADDRESS, CRYPTO_ASSET = 'USDC', CHAIN = 'base-sepolia', FIAT_CURRENCY = 'EUR', JOURNEY = 'buy', PAYMENT_METHOD = 'bank', MERCHANT_TRANSACTION_ID, SHOW_LINK } = env
if (!WALLET_ADDRESS) throw new Error('Set WALLET_ADDRESS')
if (!['buy', 'sell'].includes(JOURNEY)) throw new Error('JOURNEY must be buy or sell')
// Rheon's sandbox widget routes on Base Sepolia are bank routes; set card or apple_pay_hosted (buy only) for an account that has those.
if (!['bank', 'card', 'apple_pay_hosted'].includes(PAYMENT_METHOD)) throw new Error('PAYMENT_METHOD must be bank, card or apple_pay_hosted')

const request = async call => {
  const response = await fetch(`${BACKEND_URL}/rheon`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(call) })
  if (!response.ok) throw new Error(`Backend failed: ${response.status}`)
  return response.json()
}
const rheon = new RheonProtocol({ getAddress: async () => WALLET_ADDRESS }, { request, merchantTransactionId: MERCHANT_TRANSACTION_ID })
const options = { cryptoAsset: CRYPTO_ASSET, fiatCurrency: FIAT_CURRENCY, config: { chain: CHAIN, method: PAYMENT_METHOD } }
const sell = JOURNEY === 'sell'
const asset = (await rheon.getSupportedCryptoAssets()).find(a => a.code === CRYPTO_ASSET && a.networkCode === CHAIN)
const currency = (await rheon.getSupportedFiatCurrencies()).find(c => c.code === FIAT_CURRENCY)
if (!asset || !currency) throw new Error('No quotable route for the requested asset, chain and currency')
const amounts = sell ? { cryptoAmount: 25n * 10n ** BigInt(asset.decimals) } : { fiatAmount: 50n * 10n ** BigInt(currency.decimals) }
console.log('Order:', rheon.merchantTransactionId)
// Rheon estimates bank routes only; the widget prices card and hosted Apple Pay itself.
if (PAYMENT_METHOD === 'bank') console.log('Estimate:', await rheon[sell ? 'quoteSell' : 'quoteBuy']({ ...options, ...amounts }))
const result = await rheon[JOURNEY]({ ...options, ...amounts })
// The link carries a one-use launch token: keep it out of logs. SHOW_LINK=1 prints it on this machine to open it.
const link = result.buyUrl ?? result.sellUrl
console.log(SHOW_LINK === '1' ? `One-use ${JOURNEY} link (open it once, do not share it): ${link}` : `${JOURNEY} link created (one-use, not printed). Run with SHOW_LINK=1 to print it.`)
