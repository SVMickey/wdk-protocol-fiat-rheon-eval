/* global Bare */
// Run under the Bare runtime against the packed package (see .github/workflows/test.yml). No network:
// the request callback answers like Rheon's partner API.
import RheonProtocol from 'wdk-protocol-fiat-rheon'

const route = {
  routeId: 'rte_bare_smoke',
  product: 'apple_pay_onramp',
  provider: 'example_pay',
  from: { code: 'USD' },
  to: { code: 'USDT', chain: 'ethereum-sepolia' },
  availability: { pricing: { enabled: true } }
}
const estimate = {
  routeId: route.routeId,
  sourceAmount: { amount: '100.00', asset: { code: 'USD' } },
  expectedDeliveredAmount: { amount: '97.000000', asset: route.to },
  totalFee: { amount: '3.00', asset: { code: 'USD' } },
  fxRate: '1.00'
}
const request = async ({ method, path, headers }) => {
  if (method === 'GET' && path === '/v1/config') return { status: 200, body: { routes: [route] } }
  if (method === 'POST' && path === '/v1/estimate' && headers['Idempotency-Key']) return { status: 201, body: estimate }
  return { status: 404, body: { error: { code: 'not_found', message: 'not found' } } }
}

if (typeof Bare !== 'object') throw new Error('not running under Bare')
const rheon = new RheonProtocol(undefined, { request })
const quote = await rheon.quoteBuy({ cryptoAsset: 'USDT', fiatCurrency: 'USD', fiatAmount: 10000n })
if (quote.cryptoAmount !== 97000000n || quote.fee !== 300n || quote.rate !== '1.00') throw new Error('unexpected quote')
const countries = await rheon.getSupportedCountries()
if (countries.length !== 249) throw new Error('unexpected countries')
console.log(`Bare ${Bare.version}: quoteBuy ${quote.cryptoAmount} USDT base units, ${countries.length} countries`)
