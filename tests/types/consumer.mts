// Compiled with `tsc --strict` against the packed package (see .github/workflows/test.yml), without skipLibCheck.
import RheonProtocol, { type RheonRequest, type RheonResponse, type RheonBuyQuote, type RheonSupportedCountry } from 'wdk-protocol-fiat-rheon'
import type { IFiatProtocol } from '@tetherto/wdk-wallet/protocols'

const request = async (_: RheonRequest): Promise<RheonResponse> => ({ status: 200, body: { routes: [] } })
const sdk = new RheonProtocol(undefined, { request })
const asWdk: IFiatProtocol = sdk
const quote: Promise<RheonBuyQuote> = sdk.quoteBuy({ cryptoAsset: 'USDT', fiatCurrency: 'USD', fiatAmount: 100n })
const countries: RheonSupportedCountry[] = await sdk.getSupportedCountries()
void asWdk; void quote; void countries
