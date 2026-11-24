import { readFileSync } from 'fs'
import { execFile } from 'node:child_process'
import { createServer } from 'node:http'
import { promisify } from 'node:util'

import { beforeEach, describe, expect, jest, test } from '@jest/globals'

import { NoSuchElementError, ProviderError, ValueError } from '@tetherto/wdk-wallet'

import RheonProtocol, { RheonApiError, RheonCallbackError, RheonConfigurationError } from '../index.js'

test('example backend forwards widget calls server-to-server without browser fetch metadata', async () => {
  const received = []
  const server = createServer(async (request, response) => {
    let raw = ''
    for await (const chunk of request) raw += chunk
    received.push({ path: request.url, headers: request.headers, body: raw ? JSON.parse(raw) : null })
    response.writeHead(201, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ sessionId: 'wss_example' }))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const oldBase = process.env.RHEON_API_BASE
  const oldKey = process.env.RHEON_API_KEY
  process.env.RHEON_API_BASE = `http://127.0.0.1:${server.address().port}`
  process.env.RHEON_API_KEY = 'disposable-local-key'
  try {
    const { forward } = await import('../examples/backend.js')
    const body = { externalOrderId: 'buy-42', journey: 'buy' }
    await expect(forward({ method: 'POST', path: '/v1/widget/sessions', headers: { 'Idempotency-Key': 'order-42', Origin: 'https://wallet.example' }, body }, null))
      .resolves.toEqual({ status: 201, body: { sessionId: 'wss_example' } })
    expect(received[0]).toMatchObject({ path: '/v1/widget/sessions', body, headers: { authorization: 'Bearer disposable-local-key', 'idempotency-key': 'order-42' } })
    expect(received[0].headers.origin).toBeUndefined()
    expect(Object.keys(received[0].headers).filter(name => name.startsWith('sec-fetch-'))).toEqual([])
    await expect(forward({ method: 'GET', path: '/v1/widget/orders?externalOrderId=buy-42' }, null)).resolves.toMatchObject({ status: 201 })
    await expect(forward({ method: 'GET', path: '/admin' }, null)).resolves.toMatchObject({ status: 403 })
    expect(received).toHaveLength(2)
  } finally {
    if (oldBase === undefined) delete process.env.RHEON_API_BASE
    else process.env.RHEON_API_BASE = oldBase
    if (oldKey === undefined) delete process.env.RHEON_API_KEY
    else process.env.RHEON_API_KEY = oldKey
    await new Promise(resolve => server.close(resolve))
  }
})

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'))

const CONFIG = fixture('config.apple-pay.json')

const ESTIMATE = fixture('estimate-apple-pay.response.json')

const TRANSACTION = fixture('create-transaction-apple-pay.response.json')

const PROCESSING = fixture('get-transaction.apple-pay-processing.response.json')

const HELD_FOR_KYC = fixture('get-transaction.apple-pay-kyc.response.json')

const COMPLETED = fixture('get-transaction.completed.response.json')

const SIMULATION = fixture('simulate-checkout.delivered.response.json')

const TEST_TOKEN = fixture('submit-apple-pay-sandbox-test-token.request.json')

const NEW_CUSTOMER = fixture('error.identity-required-new-customer.response.json')

const CUSTOMER_EXISTS = fixture('error.customer-exists.response.json')

const NOT_AVAILABLE = fixture('error.not-available-for-user.response.json')

const NOT_FOUND = fixture('error.not-found.response.json')

const PAYMENT_USED = fixture('error.apple-payment-used.response.json')

const SANDBOX_ONLY = fixture('error.sandbox-only.response.json')

const ROUTE_ID = 'rte_01m3283a1b2c3d4e5f6g7h8j9k'

const TX_ID = 'txn_01m3283c7d8e9f0g1h2j3k4m5n'

const ADDRESS = '0x8ba1f109551bD432803012645Ac136ddd64DBA72'

const QUOTE = {
  ...ESTIMATE,
  quoteId: 'qte_01m3283b5c6d7e8f9g0h1j2k3m',
  customerId: 'cus_01m3282x4v7c0m8h3n9k2q7f5e',
  expiresAt: '2026-10-02T12:03:00.000Z',
  checks: { kyc: 'not_required' },
  indicative: undefined,
  simulated: true
}

const USER = { email: 'user-8842@example.com', userIp: '8.8.8.8', country: 'US' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const request = jest.fn()

function answerWith (...responses) {
  for (const [status, body] of responses) {
    request.mockResolvedValueOnce({ status, body })
  }
}

function call (n) {
  return request.mock.calls[n][0]
}

class DummyAccount {
  async getAddress () {
    return ADDRESS
  }
}

describe('RheonProtocol', () => {
  let protocol

  beforeEach(() => {
    request.mockReset()

    protocol = new RheonProtocol(new DummyAccount(), { request })
  })

  describe('constructor', () => {
    test.each([[[undefined, {}]], [[undefined]], [[]]])('should throw if the request callback is missing: %o', (args) => {
      expect(() => new RheonProtocol(...args))
        .toThrow(new RheonConfigurationError('\'request\' is required: the callback that sends calls to Rheon\'s API from your backend'))
    })
  })

  describe('getSupportedCryptoAssets', () => {
    test('should list the tokens of the quotable native Apple Pay routes, once per chain', async () => {
      answerWith([200, CONFIG])

      const assets = await protocol.getSupportedCryptoAssets()

      expect(call(0)).toEqual({ method: 'GET', path: '/v1/config', headers: {} })

      expect(assets).toEqual([
        { code: 'USDC', networkCode: 'base-sepolia', decimals: 6, metadata: CONFIG.routes[0].to },
        { code: 'USDT', networkCode: 'ethereum-sepolia', decimals: 6, metadata: CONFIG.routes[1].to }
      ])
    })

    test('should leave out a token whose decimals are unknown, and take decimals from the configuration', async () => {
      const routes = [{ ...CONFIG.routes[0], to: { code: 'EURC', chain: 'base' } }, { ...CONFIG.routes[1], to: { code: 'PYUSD', chain: 'solana' } }]

      protocol = new RheonProtocol(undefined, { request, assetDecimals: { 'PYUSD:solana': 6, 'USDT:ethereum-sepolia': 8 } })

      answerWith([200, { ...CONFIG, routes }])

      expect(await protocol.getSupportedCryptoAssets())
        .toEqual([{ code: 'PYUSD', networkCode: 'solana', decimals: 6, metadata: routes[1].to }])
    })

    test('should read the routes once within the cache time and again after it', async () => {
      const now = jest.spyOn(Date, 'now')

      protocol = new RheonProtocol(undefined, { request, cacheTime: 1000 })

      answerWith([200, CONFIG], [200, { ...CONFIG, routes: [] }])

      now.mockReturnValue(10_000)
      await protocol.getSupportedCryptoAssets()

      now.mockReturnValue(10_999)
      expect(await protocol.getSupportedCryptoAssets()).toHaveLength(2)

      now.mockReturnValue(11_000)
      expect(await protocol.getSupportedCryptoAssets()).toEqual([])

      expect(request).toHaveBeenCalledTimes(2)

      now.mockRestore()
    })

    test('should skip malformed routes and read a missing blocked list as empty', async () => {
      const route = { ...CONFIG.routes[0], blockedCountries: undefined }

      answerWith([200, { routes: [null, { ...CONFIG.routes[0], to: { code: 'USDC' } }, { ...CONFIG.routes[0], from: {} }, route] }])

      const countries = await protocol.getSupportedCountries()

      expect(countries.find(({ code }) => code === 'US').isBuyAllowed).toBe(true)
      expect(countries.filter(({ isBuyAllowed }) => isBuyAllowed)).toHaveLength(249 - 31)
    })

    test('should throw if the routes are unreadable', async () => {
      answerWith([200, { routes: {} }])

      await expect(protocol.getSupportedCryptoAssets())
        .rejects.toThrow(new RheonApiError('Rheon answered the routes of your account unreadably', {}))
    })
  })

  describe('getSupportedFiatCurrencies', () => {
    test('should list the fiat currencies of the quotable routes, once each', async () => {
      const jpy = { ...CONFIG.routes[2], availability: CONFIG.routes[0].availability }

      answerWith([200, { routes: [...CONFIG.routes, jpy] }])

      expect(await protocol.getSupportedFiatCurrencies()).toEqual([
        { code: 'USD', decimals: 2, metadata: { code: 'USD' } },
        { code: 'EUR', decimals: 2, metadata: { code: 'EUR' } },
        { code: 'JPY', decimals: 0, metadata: { code: 'JPY' } }
      ])
    })

    test.each([['KWD', 3], ['CLF', 4], ['EUR', 2]])('should give %s %i decimals', async (code, decimals) => {
      answerWith([200, { routes: [{ ...CONFIG.routes[0], from: { code } }] }])

      expect(await protocol.getSupportedFiatCurrencies()).toEqual([{ code, decimals, metadata: { code } }])
    })
  })

  describe('getSupportedCountries', () => {
    test('should allow buying where one quotable route does not block the country, outside the EEA and the UK', async () => {
      answerWith([200, { routes: CONFIG.routes.filter(route => route.product === 'apple_pay_onramp') }])

      const countries = await protocol.getSupportedCountries()

      expect(countries).toHaveLength(249)
      expect(new Set(countries.map(({ code }) => code)).size).toBe(249)

      const allowed = (code) => countries.find((country) => country.code === code)

      expect(allowed('US')).toEqual({ code: 'US', isBuyAllowed: true, isSellAllowed: false })
      expect(allowed('CA').isBuyAllowed).toBe(true)
      expect(allowed('MX').isBuyAllowed).toBe(false)
      expect(allowed('BR').isBuyAllowed).toBe(true)

      for (const code of ['DE', 'FR', 'GB', 'NO', 'IS', 'LI', 'IE']) {
        expect(allowed(code).isBuyAllowed).toBe(false)
      }

      expect(countries.every(({ isSellAllowed }) => isSellAllowed === false)).toBe(true)
    })

    test('should allow no country when the account has no quotable route', async () => {
      answerWith([200, { routes: [CONFIG.routes[2]] }])

      expect((await protocol.getSupportedCountries()).some(({ isBuyAllowed }) => isBuyAllowed)).toBe(false)
    })
  })

  describe('quoteBuy', () => {
    test('should quote a fiat amount from Rheon\'s estimate', async () => {
      answerWith([200, CONFIG], [200, ESTIMATE])

      const quote = await protocol.quoteBuy({ cryptoAsset: 'USDC', fiatCurrency: 'USD', fiatAmount: 10_000 })

      expect(call(1)).toEqual({
        method: 'POST',
        path: '/v1/estimate',
        headers: { 'Idempotency-Key': expect.stringMatching(UUID) },
        body: { provider: 'example_pay', routeId: ROUTE_ID, exactMode: 'exact_in', amount: '100.00' }
      })

      expect(quote).toEqual({ cryptoAmount: 95_120_000n, fiatAmount: 10_000n, fee: 200n, rate: '1.03', metadata: ESTIMATE })
    })

    test('should send a new idempotency key on every call', async () => {
      answerWith([200, CONFIG], [200, ESTIMATE], [200, ESTIMATE])

      await protocol.quoteBuy({ cryptoAsset: 'USDC', fiatCurrency: 'USD', fiatAmount: 10_000n })
      await protocol.quoteBuy({ cryptoAsset: 'USDC', fiatCurrency: 'USD', fiatAmount: 10_000n })

      expect(call(1).headers['Idempotency-Key']).not.toBe(call(2).headers['Idempotency-Key'])
    })

    test('should write an amount with fewer digits than decimal places', async () => {
      answerWith([200, CONFIG], [200, { ...ESTIMATE, sourceAmount: { ...ESTIMATE.sourceAmount, amount: '0.05' } }])

      await protocol.quoteBuy({ cryptoAsset: 'USDC', fiatCurrency: 'USD', fiatAmount: 5 })

      expect(call(1).body.amount).toBe('0.05')
    })

    test('should write a zero-decimal currency without a decimal point', async () => {
      const route = { ...CONFIG.routes[2], availability: CONFIG.routes[0].availability }
      const estimate = { ...ESTIMATE, routeId: route.routeId, sourceAmount: { amount: '15000', asset: { code: 'JPY' } }, totalFee: { amount: '300', asset: { code: 'JPY' } }, expectedDeliveredAmount: { amount: '97.5', asset: route.to } }

      answerWith([200, { routes: [route] }], [200, estimate])

      const quote = await protocol.quoteBuy({ cryptoAsset: 'USDT', fiatCurrency: 'JPY', fiatAmount: 15_000 })

      expect(call(1).body.amount).toBe('15000')
      expect(quote).toMatchObject({ cryptoAmount: 97_500_000n, fiatAmount: 15_000n, fee: 300n })
    })

    test('should use the route of the chain given', async () => {
      const route = { ...CONFIG.routes[1], to: { ...CONFIG.routes[1].to, code: 'USDC' } }

      answerWith([200, { routes: [CONFIG.routes[0], route] }])

      await expect(protocol.quoteBuy({ cryptoAsset: 'USDC', fiatCurrency: 'USD', fiatAmount: 10_000 }))
        .rejects.toThrow(new ValueError('Rheon offers \'USDC\' on several chains (base-sepolia, ethereum-sepolia): set \'config.chain\''))

      answerWith([200, { ...ESTIMATE, routeId: route.routeId, expectedDeliveredAmount: { amount: '95.12', asset: route.to } }])

      await protocol.quoteBuy({ cryptoAsset: 'USDC', fiatCurrency: 'USD', fiatAmount: 10_000, config: { chain: 'ethereum-sepolia' } })

      expect(call(1).body.routeId).toBe(route.routeId)
    })

    test('should use the route id given', async () => {
      answerWith([200, CONFIG])

      await expect(protocol.quoteBuy({ cryptoAsset: 'USDC', fiatCurrency: 'USD', fiatAmount: 10_000, config: { routeId: 'rte_other' } }))
        .rejects.toThrow(new ValueError('Rheon offers your account no buy route from \'USD\' to \'USDC\''))
    })

    test('should throw if no quotable route matches', async () => {
      answerWith([200, CONFIG])

      await expect(protocol.quoteBuy({ cryptoAsset: 'USDT', fiatCurrency: 'JPY', fiatAmount: 10_000 }))
        .rejects.toThrow(new ValueError('Rheon offers your account no buy route from \'JPY\' to \'USDT\''))

      await expect(protocol.quoteBuy({ cryptoAsset: 'USDC', fiatCurrency: 'USD', fiatAmount: 10_000, config: { chain: 'solana' } }))
        .rejects.toThrow(new ValueError('Rheon offers your account no buy route from \'USD\' to \'USDC\' on \'solana\''))

      expect(request).toHaveBeenCalledTimes(1)
    })

    test('should throw if the token\'s decimals are unknown', async () => {
      answerWith([200, { routes: [{ ...CONFIG.routes[0], to: { code: 'USDC', chain: 'arbitrum' } }] }])

      await expect(protocol.quoteBuy({ cryptoAsset: 'USDC', fiatCurrency: 'USD', fiatAmount: 10_000 }))
        .rejects.toThrow(new RheonConfigurationError('The on-chain decimals of \'USDC\' on \'arbitrum\' are unknown: set them in the \'assetDecimals\' option'))
    })

    test.each([
      [{ cryptoAmount: 1_000_000 }, 'Purchases are priced by fiat amount only: pass \'fiatAmount\' instead of \'cryptoAmount\''],
      [{}, '\'fiatAmount\' must be provided'],
      [{ fiatAmount: 0 }, '\'fiatAmount\' must be a positive integer amount in base units'],
      [{ fiatAmount: -5n }, '\'fiatAmount\' must be a positive integer amount in base units'],
      [{ fiatAmount: 10.5 }, '\'fiatAmount\' must be a positive integer amount in base units'],
      [{ fiatAmount: '1000' }, '\'fiatAmount\' must be a positive integer amount in base units']
    ])('should refuse %o before any call', async (amount, message) => {
      await expect(protocol.quoteBuy({ cryptoAsset: 'USDC', fiatCurrency: 'USD', ...amount }))
        .rejects.toThrow(new ValueError(message))

      expect(request).not.toHaveBeenCalled()
    })

    test('should carry Rheon\'s refusal of the estimate', async () => {
      const refusal = { error: { code: 'invalid_request', message: 'Amount is below the route minimum', requestId: 'req_1', details: { reason: 'amount_below_minimum' }, retry: { safe: false, afterMs: null, action: 'fix_request' } } }

      answerWith([200, CONFIG], [400, refusal])

      const error = await protocol.quoteBuy({ cryptoAsset: 'USDC', fiatCurrency: 'USD', fiatAmount: 100 }).catch((error) => error)

      expect(error).toBeInstanceOf(RheonApiError)
      expect(error.message).toBe('Rheon refused the estimate: 400 invalid_request (Amount is below the route minimum)')
      expect(error).toMatchObject({ status: 400, code: 'invalid_request', details: refusal.error.details, retry: refusal.error.retry, requestId: 'req_1' })
    })

    test('should cut a long refusal message', async () => {
      answerWith([200, CONFIG], [400, { error: { code: 'invalid_request', message: 'x'.repeat(1000) } }])

      const error = await protocol.quoteBuy({ cryptoAsset: 'USDC', fiatCurrency: 'USD', fiatAmount: 100 }).catch((error) => error)

      expect(error.message).toBe(`Rheon refused the estimate: 400 invalid_request (${'x'.repeat(300)})`)
    })

    test('should read a refusal without an error envelope', async () => {
      answerWith([200, CONFIG], [404, null])

      const error = await protocol.quoteBuy({ cryptoAsset: 'USDC', fiatCurrency: 'USD', fiatAmount: 100 }).catch((error) => error)

      expect(error.message).toBe('Rheon refused the estimate: 404')
      expect(error).toMatchObject({ status: 404, code: null, details: null, retry: null, requestId: null })
    })

    test('should throw a provider error on a server error, with Rheon\'s answer as the cause', async () => {
      answerWith([200, CONFIG], [503, { error: { code: 'temporarily_unavailable', message: 'Try again' } }])

      const error = await protocol.quoteBuy({ cryptoAsset: 'USDC', fiatCurrency: 'USD', fiatAmount: 10_000 }).catch((error) => error)

      expect(error).toBeInstanceOf(ProviderError)
      expect(error.message).toBe('Rheon failed to answer the estimate: 503')
      expect(error.cause).toBeInstanceOf(RheonApiError)
      expect(error.cause.code).toBe('temporarily_unavailable')
    })

    test('should let a 299 through and refuse a 300 or a 199', async () => {
      answerWith([200, CONFIG], [299, ESTIMATE], [300, ESTIMATE], [199, ESTIMATE])

      await protocol.quoteBuy({ cryptoAsset: 'USDC', fiatCurrency: 'USD', fiatAmount: 10_000 })

      for (const status of [300, 199]) {
        await expect(protocol.quoteBuy({ cryptoAsset: 'USDC', fiatCurrency: 'USD', fiatAmount: 10_000 }))
          .rejects.toThrow(new RheonApiError(`Rheon refused the estimate: ${status}`, {}))
      }
    })

    test.each([
      [{ sourceAmount: { amount: '100.00', asset: { code: 'EUR' } } }, 'Rheon answered a price for other assets than requested'],
      [{ totalFee: { amount: '2.00', asset: { code: 'EUR' } } }, 'Rheon answered a price for other assets than requested'],
      [{ expectedDeliveredAmount: { amount: '95.12', asset: { code: 'USDT', chain: 'base-sepolia' } } }, 'Rheon answered a price for other assets than requested'],
      [{ expectedDeliveredAmount: { amount: '95.12', asset: { code: 'USDC', chain: 'base' } } }, 'Rheon answered a price for other assets than requested'],
      [{ expectedDeliveredAmount: undefined }, 'Rheon answered a price for other assets than requested'],
      [{ sourceAmount: { amount: '99.99', asset: { code: 'USD' } } }, 'Rheon answered a price for another amount than requested'],
      [{ fxRate: 1.03 }, 'Rheon answered a price without a positive decimal rate'],
      [{ fxRate: 'not-a-rate' }, 'Rheon answered a price without a positive decimal rate'],
      [{ fxRate: '1e3' }, 'Rheon answered a price without a positive decimal rate'],
      [{ fxRate: '0.000' }, 'Rheon answered a price without a positive decimal rate'],
      [{ sourceAmount: { amount: '100.001', asset: { code: 'USD' } } }, 'Rheon answered an unreadable fiat amount'],
      [{ totalFee: { amount: '-2.00', asset: { code: 'USD' } } }, 'Rheon answered an unreadable fee'],
      [{ expectedDeliveredAmount: { amount: 95.12, asset: ESTIMATE.expectedDeliveredAmount.asset } }, 'Rheon answered an unreadable crypto amount'],
      [{ expectedDeliveredAmount: { amount: '1e3', asset: ESTIMATE.expectedDeliveredAmount.asset } }, 'Rheon answered an unreadable crypto amount']
    ])('should refuse an estimate with %o', async (change, message) => {
      answerWith([200, CONFIG], [200, { ...ESTIMATE, ...change }])

      await expect(protocol.quoteBuy({ cryptoAsset: 'USDC', fiatCurrency: 'USD', fiatAmount: 10_000 }))
        .rejects.toThrow(new RheonApiError(message, {}))
    })

    test.each([[[]], ['text'], [null]])('should refuse the unreadable body %o', async (body) => {
      answerWith([200, CONFIG], [200, body])

      await expect(protocol.quoteBuy({ cryptoAsset: 'USDC', fiatCurrency: 'USD', fiatAmount: 10_000 }))
        .rejects.toThrow(new RheonApiError('Rheon answered the estimate with an unreadable body', {}))
    })

    test.each([[undefined], [null], [{ status: '200', body: {} }], [{ body: {} }], [{ status: 200 }]])('should refuse the callback result %o', async (result) => {
      request.mockResolvedValueOnce(result)

      await expect(protocol.quoteBuy({ cryptoAsset: 'USDC', fiatCurrency: 'USD', fiatAmount: 10_000 }))
        .rejects.toThrow(new RheonCallbackError('request must resolve to { status, body }: the HTTP status and the parsed JSON body of Rheon\'s answer'))
    })

    test('should pass on an error the callback throws', async () => {
      const failure = new Error('backend down')

      request.mockRejectedValueOnce(failure)

      await expect(protocol.quoteBuy({ cryptoAsset: 'USDC', fiatCurrency: 'USD', fiatAmount: 10_000 })).rejects.toBe(failure)
    })
  })

  describe('quoteApplePay', () => {
    const body = {
      provider: 'example_pay',
      routeId: ROUTE_ID,
      externalId: 'user-8842',
      exactMode: 'exact_in',
      amount: '100.00',
      email: USER.email,
      destination: { walletAddress: ADDRESS },
      userIp: '8.8.8.8',
      country: 'US'
    }

    test('should quote for the user, to the account\'s address, with the key given', async () => {
      answerWith([200, CONFIG], [201, QUOTE])

      const quote = await protocol.quoteApplePay({ cryptoAsset: 'USDC', fiatCurrency: 'USD', fiatAmount: 10_000, externalId: 'user-8842', ...USER, config: { idempotencyKey: 'quote-1' } })

      expect(call(1)).toEqual({ method: 'POST', path: '/v1/quote', headers: { 'Idempotency-Key': 'quote-1' }, body })

      expect(quote).toEqual({
        cryptoAmount: 95_120_000n,
        fiatAmount: 10_000n,
        fee: 200n,
        rate: '1.03',
        quoteId: QUOTE.quoteId,
        expiresAt: QUOTE.expiresAt,
        metadata: QUOTE
      })
    })

    test('should send to the recipient and name the customer by its id', async () => {
      protocol = new RheonProtocol(undefined, { request })

      answerWith([200, CONFIG], [201, QUOTE])

      await protocol.quoteApplePay({ cryptoAsset: 'USDC', fiatCurrency: 'USD', fiatAmount: 10_000, customerId: QUOTE.customerId, recipient: '0xabc', ...USER })

      const { externalId, ...rest } = body

      expect(call(1).body).toEqual({ ...rest, customerId: QUOTE.customerId, destination: { walletAddress: '0xabc' } })
    })

    test('should create the customer when Rheon has none, then quote again with derived keys', async () => {
      answerWith([200, CONFIG], [422, NEW_CUSTOMER], [201, { customerId: QUOTE.customerId }], [201, QUOTE])

      const quote = await protocol.quoteApplePay({ cryptoAsset: 'USDC', fiatCurrency: 'USD', fiatAmount: 10_000, externalId: 'user-8842', ...USER, config: { idempotencyKey: 'quote-1' } })

      expect(call(2)).toEqual({ method: 'POST', path: '/v1/customers', headers: { 'Idempotency-Key': 'quote-1-customer' }, body: { externalId: 'user-8842' } })
      expect(call(3)).toEqual({ method: 'POST', path: '/v1/quote', headers: { 'Idempotency-Key': 'quote-1-requote' }, body })
      expect(quote.quoteId).toBe(QUOTE.quoteId)
    })

    test('should use the existing customer, with random keys when none is given', async () => {
      answerWith([200, CONFIG], [422, NEW_CUSTOMER], [409, CUSTOMER_EXISTS], [201, QUOTE])

      await protocol.quoteApplePay({ cryptoAsset: 'USDC', fiatCurrency: 'USD', fiatAmount: 10_000, externalId: 'user-8842', ...USER })

      expect(call(3).path).toBe('/v1/quote')
      expect(new Set([1, 2, 3].map((n) => call(n).headers['Idempotency-Key'])).size).toBe(3)

      for (const n of [1, 2, 3]) {
        expect(call(n).headers['Idempotency-Key']).toMatch(UUID)
      }
    })

    test('should pass on another refusal of the customer', async () => {
      answerWith([200, CONFIG], [422, NEW_CUSTOMER], [403, SANDBOX_ONLY])

      await expect(protocol.quoteApplePay({ cryptoAsset: 'USDC', fiatCurrency: 'USD', fiatAmount: 10_000, externalId: 'user-8842', ...USER }))
        .rejects.toMatchObject({ status: 403, code: 'permission_denied' })

      expect(request).toHaveBeenCalledTimes(3)
    })

    test('should not create a customer for another identity step, or for a customer id', async () => {
      const pending = { error: { ...NEW_CUSTOMER.error, details: { ...NEW_CUSTOMER.error.details, nextAction: { type: 'wait_for_review' } } } }

      answerWith([200, CONFIG], [422, pending], [422, NEW_CUSTOMER], [400, NOT_AVAILABLE])

      await expect(protocol.quoteApplePay({ cryptoAsset: 'USDC', fiatCurrency: 'USD', fiatAmount: 10_000, externalId: 'user-8842', ...USER }))
        .rejects.toMatchObject({ code: 'identity_required', details: { nextAction: { type: 'wait_for_review' } } })

      await expect(protocol.quoteApplePay({ cryptoAsset: 'USDC', fiatCurrency: 'USD', fiatAmount: 10_000, customerId: 'cus_x', ...USER }))
        .rejects.toMatchObject({ code: 'identity_required' })

      const error = await protocol.quoteApplePay({ cryptoAsset: 'USDC', fiatCurrency: 'USD', fiatAmount: 10_000, externalId: 'user-8842', ...USER }).catch((error) => error)

      expect(error).toMatchObject({ status: 400, code: 'no_route', details: { reason: 'not_available_for_user' } })
      expect(request).toHaveBeenCalledTimes(4)
    })

    test('should pass on a server error of the quote', async () => {
      answerWith([200, CONFIG], [500, null])

      await expect(protocol.quoteApplePay({ cryptoAsset: 'USDC', fiatCurrency: 'USD', fiatAmount: 10_000, externalId: 'user-8842', ...USER }))
        .rejects.toThrow(ProviderError)
    })

    test.each([
      [{ email: '' }, '\'email\' must be a non-empty string'],
      [{ email: undefined }, '\'email\' must be a non-empty string'],
      [{ userIp: ' ' }, '\'userIp\' must be a non-empty string'],
      [{ country: undefined }, '\'country\' must be a non-empty string'],
      [{ externalId: undefined }, 'Give exactly one of \'externalId\' and \'customerId\' to name the user'],
      [{ customerId: 'cus_x' }, 'Give exactly one of \'externalId\' and \'customerId\' to name the user'],
      [{ fiatAmount: undefined }, '\'fiatAmount\' must be provided']
    ])('should refuse %o before any call', async (change, message) => {
      await expect(protocol.quoteApplePay({ cryptoAsset: 'USDC', fiatCurrency: 'USD', fiatAmount: 10_000, externalId: 'user-8842', ...USER, ...change }))
        .rejects.toThrow(new ValueError(message))

      expect(request).not.toHaveBeenCalled()
    })

    test('should throw without a recipient or an account', async () => {
      protocol = new RheonProtocol(undefined, { request })

      answerWith([200, CONFIG])

      await expect(protocol.quoteApplePay({ cryptoAsset: 'USDC', fiatCurrency: 'USD', fiatAmount: 10_000, externalId: 'user-8842', ...USER }))
        .rejects.toThrow(new ValueError('A \'recipient\' or a wallet account is required: the crypto is sent to this address'))

      expect(request).toHaveBeenCalledTimes(1)
    })

    test.each([[{ quoteId: undefined }], [{ expiresAt: 1 }]])('should refuse a quote with %o', async (change) => {
      answerWith([200, CONFIG], [201, { ...QUOTE, ...change }])

      await expect(protocol.quoteApplePay({ cryptoAsset: 'USDC', fiatCurrency: 'USD', fiatAmount: 10_000, externalId: 'user-8842', ...USER }))
        .rejects.toThrow(new RheonApiError('Rheon answered the quote without its quoteId or expiresAt', {}))
    })

    test('should refuse a quote for another amount', async () => {
      answerWith([200, CONFIG], [201, { ...QUOTE, sourceAmount: { amount: '50.00', asset: { code: 'USD' } } }])

      await expect(protocol.quoteApplePay({ cryptoAsset: 'USDC', fiatCurrency: 'USD', fiatAmount: 10_000, externalId: 'user-8842', ...USER }))
        .rejects.toThrow(new RheonApiError('Rheon answered a price for another amount than requested', {}))
    })
  })

  describe('createApplePayPayment', () => {
    test('should open the transaction and give the Apple Pay sheet', async () => {
      answerWith([201, TRANSACTION])

      const payment = await protocol.createApplePayPayment({ quoteId: QUOTE.quoteId, email: USER.email, config: { idempotencyKey: 'tx-1' } })

      expect(call(0)).toEqual({ method: 'POST', path: '/v1/transactions', headers: { 'Idempotency-Key': 'tx-1' }, body: { quoteId: QUOTE.quoteId, email: USER.email } })

      expect(payment).toEqual({ transactionId: TX_ID, applePay: TRANSACTION.instructions, metadata: TRANSACTION })
    })

    test('should give no sheet when Rheon asks for none', async () => {
      answerWith([201, HELD_FOR_KYC], [201, { ...PROCESSING, instructions: undefined }])

      expect((await protocol.createApplePayPayment({ quoteId: QUOTE.quoteId, email: USER.email })).applePay).toBeNull()
      expect((await protocol.createApplePayPayment({ quoteId: QUOTE.quoteId, email: USER.email })).applePay).toBeNull()

      expect(call(0).headers['Idempotency-Key']).toMatch(UUID)
    })

    test.each([[{ quoteId: '' }, 'quoteId'], [{ email: undefined }, 'email']])('should refuse %o', async (change, name) => {
      await expect(protocol.createApplePayPayment({ quoteId: QUOTE.quoteId, email: USER.email, ...change }))
        .rejects.toThrow(new ValueError(`'${name}' must be a non-empty string`))
    })

    test('should carry an expired quote', async () => {
      answerWith([400, { error: { code: 'quote_expired', message: 'Quote expired', retry: { safe: false, afterMs: null, action: 'create_new_quote' } } }])

      await expect(protocol.createApplePayPayment({ quoteId: QUOTE.quoteId, email: USER.email }))
        .rejects.toMatchObject({ code: 'quote_expired', retry: { action: 'create_new_quote' } })
    })

    test.each([[{ transactionId: 5 }], [{ status: undefined }]])('should refuse a transaction with %o', async (change) => {
      answerWith([201, { ...TRANSACTION, ...change }])

      await expect(protocol.createApplePayPayment({ quoteId: QUOTE.quoteId, email: USER.email }))
        .rejects.toThrow(new RheonApiError('Rheon answered the transaction without its transactionId or status', {}))
    })
  })

  describe('submitApplePayPayment', () => {
    test('should send the sheet\'s answer to the transaction\'s Apple Pay endpoint', async () => {
      answerWith([200, PROCESSING])

      const detail = await protocol.submitApplePayPayment(TX_ID, { ...TEST_TOKEN, extra: 'dropped' }, { idempotencyKey: 'pay-1' })

      expect(call(0)).toEqual({ method: 'POST', path: `/v1/transactions/${TX_ID}/apple-pay`, headers: { 'Idempotency-Key': 'pay-1' }, body: TEST_TOKEN })

      expect(detail).toEqual({ status: 'in_progress', cryptoAsset: 'USDC', fiatCurrency: 'USD', metadata: PROCESSING })
    })

    test('should escape the transaction id in the path', async () => {
      answerWith([200, PROCESSING])

      await protocol.submitApplePayPayment('txn/../x', TEST_TOKEN)

      expect(call(0).path).toBe('/v1/transactions/txn%2F..%2Fx/apple-pay')
      expect(call(0).headers['Idempotency-Key']).toMatch(UUID)
    })

    test('should give the verification step of a held payment', async () => {
      answerWith([200, HELD_FOR_KYC])

      const detail = await protocol.submitApplePayPayment(TX_ID, TEST_TOKEN)

      expect(detail.status).toBe('in_progress')
      expect(detail.metadata.instructions).toMatchObject({ type: 'open_url', purpose: 'provider_kyc' })
    })

    test('should carry a refusal of a used payment', async () => {
      answerWith([409, PAYMENT_USED])

      await expect(protocol.submitApplePayPayment(TX_ID, TEST_TOKEN))
        .rejects.toMatchObject({ status: 409, code: 'invalid_state', details: { reason: 'apple_payment_already_used' }, requestId: 'req_01m3282zfq2c4n6r8t0v2x4z6b' })
    })

    test.each([
      ['no transaction id', [undefined, TEST_TOKEN], 'transactionId'],
      ['no authorization', [TX_ID, undefined], 'paymentToken'],
      ['an empty payment token', [TX_ID, { ...TEST_TOKEN, paymentToken: '' }], 'paymentToken']
    ])('should refuse %s before any call', async (_, args, name) => {
      await expect(protocol.submitApplePayPayment(...args)).rejects.toThrow(new ValueError(`'${name}' must be a non-empty string`))

      expect(request).not.toHaveBeenCalled()
    })
  })

  describe('getTransactionDetail', () => {
    test.each([
      ['processing', 'in_progress'],
      ['preparing', 'in_progress'],
      ['action_required', 'in_progress'],
      ['awaiting_user', 'in_progress'],
      ['manual_review', 'in_progress'],
      ['unknown', 'in_progress'],
      ['refunding', 'in_progress'],
      ['a_new_status', 'in_progress'],
      ['completed', 'completed'],
      ['failed', 'failed'],
      ['expired', 'failed'],
      ['refunded', 'failed']
    ])('should read Rheon\'s %s as %s', async (status, expected) => {
      answerWith([200, { ...PROCESSING, status }])

      expect((await protocol.getTransactionDetail(TX_ID)).status).toBe(expected)
    })

    test('should read the transaction', async () => {
      answerWith([200, COMPLETED])

      const detail = await protocol.getTransactionDetail(COMPLETED.transactionId)

      expect(call(0)).toEqual({ method: 'GET', path: `/v1/transactions/${COMPLETED.transactionId}`, headers: {} })
      expect(detail).toEqual({ status: 'completed', cryptoAsset: 'USDC', fiatCurrency: 'EUR', metadata: COMPLETED })
    })

    test('should throw a no such element error for an unknown id', async () => {
      answerWith([404, NOT_FOUND])

      const error = await protocol.getTransactionDetail('txn_nobody').catch((error) => error)

      expect(error).toBeInstanceOf(NoSuchElementError)
      expect(error.message).toBe('Rheon has no transaction with the id \'txn_nobody\'')
      expect(error.cause).toMatchObject({ status: 404, code: 'not_found' })
    })

    test('should pass on other refusals', async () => {
      answerWith([401, { error: { code: 'unauthorized', message: 'Invalid API key' } }], [502, null])

      await expect(protocol.getTransactionDetail(TX_ID)).rejects.toThrow(new RheonApiError('Rheon refused the transaction: 401 unauthorized (Invalid API key)', {}))
      await expect(protocol.getTransactionDetail(TX_ID)).rejects.toThrow(ProviderError)
    })

    test('should refuse an empty id and a transaction without a status', async () => {
      await expect(protocol.getTransactionDetail('')).rejects.toThrow(new ValueError('\'txId\' must be a non-empty string'))

      answerWith([200, { ...PROCESSING, status: null }])

      await expect(protocol.getTransactionDetail(TX_ID)).rejects.toThrow(new RheonApiError('Rheon answered the transaction without its transactionId or status', {}))
    })
  })

  describe('simulateCheckout', () => {
    test('should play the outcome in the sandbox', async () => {
      answerWith([201, SIMULATION])

      expect(await protocol.simulateCheckout(TX_ID, 'delivered', { idempotencyKey: 'sim-1' })).toEqual(SIMULATION)

      expect(call(0)).toEqual({ method: 'POST', path: `/v1/transactions/${TX_ID}/simulate-checkout`, headers: { 'Idempotency-Key': 'sim-1' }, body: { outcome: 'delivered' } })
    })

    test('should carry the refusal of a production key', async () => {
      answerWith([403, SANDBOX_ONLY])

      await expect(protocol.simulateCheckout(TX_ID, 'paid')).rejects.toMatchObject({ status: 403, details: { reason: 'sandbox_only' } })

      expect(call(0).headers['Idempotency-Key']).toMatch(UUID)
    })

    test.each([[[TX_ID, 'refunded'], '\'outcome\' must be \'paid\', \'failed\' or \'delivered\''], [['', 'paid'], '\'transactionId\' must be a non-empty string']])('should refuse %o', async (args, message) => {
      await expect(protocol.simulateCheckout(...args)).rejects.toThrow(new ValueError(message))

      expect(request).not.toHaveBeenCalled()
    })
  })

  describe('widget buy, sell and merchant order status', () => {
    const buyRoute = CONFIG.routes[3]
    const sellRoute = { ...buyRoute, routeId: 'rte_sell', product: 'bank_offramp', from: buyRoute.to, to: buyRoute.from }
    const session = { widgetUrl: 'https://buy.sandbox.rheon.io/w/ws_123#lt=one-use', sessionId: 'ws_123' }
    const sellOptions = { cryptoAsset: 'USDC', fiatCurrency: 'EUR', cryptoAmount: 25_123_456n }
    const sellPrice = {
      routeId: 'rte_sell', product: 'bank_offramp', provider: 'example_bank', exactMode: 'exact_in', indicative: true,
      sourceAmount: { amount: '25.123456', asset: sellRoute.from },
      expectedDeliveredAmount: { amount: '12.31', asset: sellRoute.to },
      totalFee: { amount: '0.503000', asset: sellRoute.from }, fxRate: '2'
    }

    test.each(['buy', 'sell'])('returns only the %s URL with the caller order id and locked wallet/corridor', async journey => {
      answerWith([200, { routes: [buyRoute, sellRoute] }], [201, session])
      const config = { merchantTransactionId: 'order / é?42', method: 'bank', externalUserId: 'user-42' }
      const options = journey === 'buy' ? { cryptoAsset: 'USDC', fiatCurrency: 'EUR', fiatAmount: 12345n, config } : { ...sellOptions, refundAddress: 'other-wallet', config }
      expect(await protocol[journey](options)).toEqual({ [`${journey}Url`]: session.widgetUrl })
      expect(call(1)).toEqual({
        method: 'POST', path: '/v1/widget/sessions', headers: { 'Idempotency-Key': expect.stringMatching(/^wdk:[0-9a-f]{64}$/) },
        body: {
          journeys: [journey], destination: { mode: 'partner_fixed', walletAddress: journey === 'buy' ? ADDRESS : 'other-wallet', chain: 'base-sepolia', assets: ['USDC'] },
          asset: { symbol: 'USDC', chain: 'base-sepolia' }, assetLocked: true, fiatCurrency: 'EUR', fiatCurrencyLocked: true,
          amount: journey === 'buy' ? '123.45' : '25.123456', amountLocked: true, enabledMethods: ['bank'], externalOrderId: config.merchantTransactionId, externalUserId: 'user-42'
        }
      })
    })

    test('generates a readable order id and keeps retries on the same idempotency key', async () => {
      answerWith([200, { routes: [buyRoute] }], [201, session], [201, session])
      const options = { cryptoAsset: 'USDC', fiatCurrency: 'EUR', fiatAmount: 5000n }
      await protocol.buy(options)
      await protocol.buy(options)
      expect(protocol.merchantTransactionId).toMatch(UUID)
      expect(call(1).body.externalOrderId).toBe(protocol.merchantTransactionId)
      expect(call(2).headers).toEqual(call(1).headers)
    })

    test.each([{ launchable: false }, { widgetUrl: 'http://evil.example/' }, {}])('rejects an unlaunchable session %o', async response => {
      answerWith([200, { routes: [buyRoute] }], [201, response])
      await expect(protocol.buy({ cryptoAsset: 'USDC', fiatCurrency: 'EUR', fiatAmount: 5000n })).rejects.toBeInstanceOf(RheonApiError)
    })

    test('never opens a native Apple Pay route in the widget', async () => {
      answerWith([200, { routes: [CONFIG.routes[0]] }])
      await expect(protocol.buy({ cryptoAsset: 'USDC', fiatCurrency: 'USD', fiatAmount: 5000n })).rejects.toBeInstanceOf(ValueError)
      expect(request).toHaveBeenCalledTimes(1)
    })

    test('quotes sell in the right direction, inverts the rate and rounds the fiat fee half-up', async () => {
      answerWith([200, { routes: [sellRoute] }], [200, sellPrice])
      expect(await protocol.quoteSell(sellOptions)).toEqual({ cryptoAmount: 25_123_456n, fiatAmount: 1231n, fee: 25n, rate: '0.500000000000000000', metadata: sellPrice })
      answerWith([200, { ...sellPrice, totalFee: { ...sellPrice.totalFee, amount: '0.510000' } }])
      expect((await protocol.quoteSell(sellOptions)).fee).toBe(26n)
      expect(call(1).body).toEqual({ provider: 'example_bank', routeId: 'rte_sell', exactMode: 'exact_in', amount: '25.123456' })
    })

    test.each([{ method: 'card' }, { method: 'apple_pay_hosted' }, { routeId: 'rte_card' }, {}])('refuses a card or hosted Apple Pay estimate %o before any estimate call', async config => {
      const card = { ...buyRoute, routeId: 'rte_card', product: 'card_onramp' }
      answerWith([200, { routes: [card, { ...card, routeId: 'rte_hosted', product: 'apple_pay_hosted_onramp' }, { ...sellRoute, routeId: 'rte_card_sell', product: 'card_offramp' }] }])
      const refusal = new ValueError('Rheon prices card and hosted Apple Pay routes only inside its widget, not by estimate: buy() opens the widget, which shows the price. quoteBuy and quoteSell estimate bank and native Apple Pay routes')
      await expect(protocol.quoteBuy({ cryptoAsset: 'USDC', fiatCurrency: 'EUR', fiatAmount: 5000n, config })).rejects.toThrow(refusal)
      if (config.method !== 'apple_pay_hosted') {
        await expect(protocol.quoteSell({ ...sellOptions, config: config.routeId ? { routeId: 'rte_card_sell' } : config }))
          .rejects.toThrow(new ValueError(refusal.message.replace('buy()', 'sell()')))
      }
      expect(request).toHaveBeenCalledTimes(1)
    })

    test('estimates the bank route when a card route of the corridor comes first', async () => {
      answerWith([200, { routes: [{ ...buyRoute, routeId: 'rte_card', product: 'card_onramp' }, buyRoute] }], [200, { ...ESTIMATE, routeId: buyRoute.routeId, sourceAmount: { amount: '50.00', asset: { code: 'EUR' } }, expectedDeliveredAmount: { amount: '48.5', asset: buyRoute.to }, totalFee: { amount: '1.50', asset: { code: 'EUR' } } }])
      await protocol.quoteBuy({ cryptoAsset: 'USDC', fiatCurrency: 'EUR', fiatAmount: 5000n })
      expect(call(1).body.routeId).toBe(buyRoute.routeId)
    })

    test.each([
      { ...sellPrice, sourceAmount: { ...sellPrice.sourceAmount, asset: { ...sellRoute.from, chain: 'ethereum' } } },
      { ...sellPrice, totalFee: { amount: '0.5', asset: { code: 'EUR' } } },
      { ...sellPrice, fxRate: '0' }
    ])('rejects a mismatched sell price or unusable rate', async price => {
      answerWith([200, { routes: [sellRoute] }], [200, price])
      await expect(protocol.quoteSell(sellOptions)).rejects.toBeInstanceOf(RheonApiError)
    })

    test('finds sell status by an encoded merchant id, also from a new instance', async () => {
      answerWith([200, { externalOrderId: 'order / é?42', transactionId: TX_ID }], [200, { ...COMPLETED, product: 'bank_offramp', sourceAmount: sellPrice.sourceAmount, expectedDeliveredAmount: sellPrice.expectedDeliveredAmount }])
      const restored = new RheonProtocol(undefined, { request })
      expect(await restored.getTransactionDetail('order / é?42')).toMatchObject({ status: 'completed', cryptoAsset: 'USDC', fiatCurrency: 'EUR' })
      expect(call(0).path).toBe('/v1/widget/orders?externalOrderId=order%20%2F%20%C3%A9%3F42')
      expect(call(1).path).toBe(`/v1/transactions/${TX_ID}`)
    })

    test('preserves missing and ambiguous order refusals', async () => {
      answerWith([404, NOT_FOUND], [400, { error: { code: 'invalid_request', details: { reason: 'ambiguous_order' } } }])
      await expect(protocol.getTransactionDetail('missing-order')).rejects.toBeInstanceOf(NoSuchElementError)
      await expect(protocol.getTransactionDetail('ambiguous-order')).rejects.toMatchObject({ status: 400, details: { reason: 'ambiguous_order' } })
    })

    test('lists sell-only assets and currencies without swapping them, and respects country blocks', async () => {
      answerWith([200, { routes: [{ ...sellRoute, blockedCountries: ['US'] }] }])
      expect(await protocol.getSupportedCryptoAssets()).toEqual([{ code: 'USDC', networkCode: 'base-sepolia', decimals: 6, metadata: sellRoute.from }])
      expect(await protocol.getSupportedFiatCurrencies()).toEqual([{ code: 'EUR', decimals: 2, metadata: sellRoute.to }])
      const countries = await protocol.getSupportedCountries()
      expect(countries.find(c => c.code === 'GB')).toEqual({ code: 'GB', isBuyAllowed: false, isSellAllowed: true })
      expect(countries.find(c => c.code === 'US').isSellAllowed).toBe(false)
    })
  })

  test('wallet example completes repeated simulations and refuses provider-priced payments', async () => {
    const price = {
      ...ESTIMATE,
      sourceAmount: { amount: '50.00', asset: { code: 'USD' } },
      expectedDeliveredAmount: { amount: '48.500000', asset: CONFIG.routes[0].to },
      totalFee: { amount: '1.50', asset: { code: 'USD' } }
    }
    const tokens = new Set()
    const states = new Map()
    let simulated = true
    let held = false
    const server = createServer(async (incoming, response) => {
      let raw = ''
      for await (const chunk of incoming) raw += chunk
      const { method, path, body } = JSON.parse(raw)
      let status = 200
      let answer
      if (path === '/v1/config') answer = CONFIG
      else if (path === '/v1/estimate') answer = price
      else if (path === '/v1/quote') answer = { ...QUOTE, ...price, simulated }
      else if (path === '/v1/transactions') {
        const transactionId = `txn_wallet_example_${states.size + 1}`
        states.set(transactionId, 'action_required')
        answer = { ...TRANSACTION, transactionId }
      } else {
        const transactionId = path.split('/')[3]
        if (path.endsWith('/apple-pay')) {
          const token = JSON.parse(Buffer.from(body.paymentToken, 'base64').toString())
          const paymentId = token.header.transactionId
          if (tokens.has(paymentId)) {
            status = 409
            answer = PAYMENT_USED
          } else if (held) {
            tokens.add(paymentId)
            answer = { ...HELD_FOR_KYC, transactionId }
          } else {
            tokens.add(paymentId)
            states.set(transactionId, 'processing')
            answer = { ...PROCESSING, transactionId }
          }
        } else if (path.endsWith('/simulate-checkout')) {
          if (body.outcome === 'delivered' && states.get(transactionId) !== 'paid') {
            status = 409
            answer = { error: { code: 'invalid_state', message: 'Simulate paid first' } }
          } else {
            states.set(transactionId, body.outcome === 'paid' ? 'paid' : 'completed')
            answer = { ...SIMULATION, transactionId, outcome: body.outcome }
          }
        } else if (method === 'GET' && states.get(transactionId) === 'action_required') {
          answer = { ...HELD_FOR_KYC, transactionId }
        } else if (method === 'GET') {
          answer = { ...COMPLETED, transactionId, status: states.get(transactionId), deliveredAmount: price.expectedDeliveredAmount }
        }
      }
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ status, body: answer }))
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const options = {
      cwd: new URL('..', import.meta.url),
      timeout: 10_000,
      env: { ...process.env, BACKEND_URL: `http://127.0.0.1:${server.address().port}`, WALLET_ADDRESS: ADDRESS, CRYPTO_ASSET: 'USDC', CHAIN: 'base-sepolia', FIAT_CURRENCY: 'USD' }
    }
    try {
      for (let run = 0; run < 2; run++) {
        const { stdout } = await promisify(execFile)(process.execPath, ['examples/wallet.js'], options)
        expect(stdout).toContain('Transaction: completed')
      }
      simulated = false
      await expect(promisify(execFile)(process.execPath, ['examples/wallet.js'], options))
        .rejects.toMatchObject({ stderr: expect.stringContaining('enabled for simulated pricing') })
      expect([...states.values()]).toEqual(['completed', 'completed'])
      expect(tokens.size).toBe(2)

      // A payment held for verification: the link stays out of the output, and reading it again creates nothing.
      simulated = true
      held = true
      const { stdout: heldOut } = await promisify(execFile)(process.execPath, ['examples/wallet.js'], options)
      expect(heldOut).toContain('TRANSACTION_ID=txn_wallet_example_3')
      expect(heldOut).not.toContain(HELD_FOR_KYC.instructions.url)
      const { stdout: again } = await promisify(execFile)(process.execPath, ['examples/wallet.js'], { ...options, env: { ...options.env, TRANSACTION_ID: 'txn_wallet_example_3', SHOW_LINK: '1' } })
      expect(again).toContain(`Open: ${HELD_FOR_KYC.instructions.url}`)
      expect(states.size).toBe(3)
    } finally {
      await new Promise(resolve => server.close(resolve))
    }
  }, 25_000)
})
