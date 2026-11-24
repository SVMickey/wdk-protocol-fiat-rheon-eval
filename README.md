# wdk-protocol-fiat-rheon

<a href="https://docs.wdk.tether.io"><img src="https://raw.githubusercontent.com/tetherto/wdk-docs/refs/heads/main/public/assets/branding/wdk-banner-dark-circuit.png" alt="Powered by WDK" width="140"></a>

Rheon fiat module for WDK (Wallet Development Kit) by Tether. It returns **Rheon widget buy and sell URLs**, quotes both directions, and looks up payments using your own order id. It also supports **native Apple Pay**: the app shows Apple's own sheet and submits the token through Rheon. It holds no API secret: every call goes to Rheon's API through one callback to your own backend, which adds your Rheon API key. Node.js and a Bare entry point are included.

Google Pay is not offered yet. Widget methods are limited to the partner's configured bank, card and hosted Apple Pay routes; the native Apple Pay flow is separate. Availability and payment/KYC checks remain Rheon's, never an SDK promise of acceptance.

## Widget buy and sell

```javascript
const rheon = new RheonProtocol(account, { request, merchantTransactionId: 'your-buy-order-42' })
const { buyUrl } = await rheon.buy({
  cryptoAsset: 'USDC', fiatCurrency: 'EUR', fiatAmount: 5000n,
  config: { chain: 'base-sepolia', method: 'bank', externalUserId: 'your-user-42' }
})
// Open buyUrl. It contains a short-lived, one-use launch token: do not log or share it.
// Only buyUrl is returned. If you omitted merchantTransactionId, persist rheon.merchantTransactionId.
// After the user creates a payment in the widget:
const status = await rheon.getTransactionDetail('your-buy-order-42')

const sellOptions = {
  cryptoAsset: 'USDC', fiatCurrency: 'EUR', cryptoAmount: 25_000_000n,
  config: { chain: 'base-sepolia', method: 'bank', merchantTransactionId: 'your-sell-order-43' }
}
const estimate = await rheon.quoteSell(sellOptions)
const { sellUrl } = await rheon.sell(sellOptions)
```

- Buy/quoteBuy accept **fiat pay amounts**; sell/quoteSell accept **crypto pay amounts**, as integer base units. Exact receive amounts are not supported. The widget locks that amount, fiat, token/chain and wallet. The account address is used unless `recipient` (buy) or `refundAddress` (sell) is given. Selling opens a page; it never signs or sends crypto.
- `config.method` selects `bank`, `card` or `apple_pay_hosted` (buy only). The widget chooses its provider within that method/corridor; it cannot pin a route, so `buy`/`sell` refuse `config.routeId`. Estimates and native extras can select a route with it. With no method, quotes use the first matching bank or native Apple Pay route.
- **Card and hosted Apple Pay have no estimate.** Rheon's partner estimate prices bank and native Apple Pay routes only; card and hosted Apple Pay are priced inside the widget, which `buy`/`sell` open. When only card or hosted Apple Pay routes match (by `method`, `routeId` or corridor), `quoteBuy` and `quoteSell` throw `ValueError` ("Rheon prices card and hosted Apple Pay routes only inside its widget, not by estimate: ...") before calling Rheon.
- An order id can be set in the constructor or per operation (`config.merchantTransactionId`, overriding the constructor). It is 1–180 characters and must not start `txn_` (reserved for native Rheon transaction IDs). One default UUID is generated per instance. **Use one order per instance or supply a new id for each new order.** Persist the id; status works from a fresh instance too.
- Session creation forwards it as `externalOrderId`. The default idempotency key is `wdk:` plus its SHA-256 digest, so retries use the same key even for Unicode ids. Session replay rotates the launch token before launch; after launch/expiry no usable URL is returned and the module raises `RheonApiError`. Never start another order just to retry a payment with unknown outcome.
- `getTransactionDetail(merchantTransactionId)` resolves it through `GET /v1/widget/orders?externalOrderId=...`, then reads the standard transaction endpoint. Before a payment exists it throws `NoSuchElementError`; the URL alone is not a payment. Reusing one id for multiple payments yields `ambiguous_order`, never an arbitrary status. Correlation is copied to each widget quote and survives short-lived session deletion; sessions erased before that backend feature cannot be recovered.
- `quoteSell().fee` is the total fee in **fiat minor units**, converted from Rheon's source-token fee using the same quote's rate, rounded half-up once. Its rate is fiat units per token, truncated to 18 decimal places. Original amounts/rate/fee stay in `metadata`. No JavaScript floating-point money arithmetic is used.
- `returnUrl`, `cancelUrl`, `locale` and `externalUserId` are optional operation config fields. Return pages must be on the partner's allowed websites. Bank KYC needs a user identity; the widget collects the remaining fields.
- `examples/widget.js` generates a link through the callback backend and prints the order id. It does not launch the widget or make a payment, and it does not print the one-use link unless you set `SHOW_LINK=1`; it prints an estimate first for `bank` only, since the widget prices card and hosted Apple Pay itself. It defaults to sandbox usage; route/payment availability is controlled on the backend. Rheon's sandbox widget routes are bank routes for USDC on `base-sepolia` with EUR, so the examples above and the script use `method: 'bank'`; set `JOURNEY=sell` for a sell link and `PAYMENT_METHOD=card` or `apple_pay_hosted` (buy only) for an account with those routes.

## Compatibility

`RheonProtocol` implements the `IFiatProtocol` interface (`FiatProtocol` from `@tetherto/wdk-wallet/protocols`), tested against `@tetherto/wdk-wallet` `1.0.0-beta.26` (dependency range `^1.0.0-beta.26`).

## Installation

The package is not on the npm registry. Install it from the source folder you received, as a local tarball:

```bash
cd /path/to/wdk-protocol-fiat-rheon
npm pack
cd /path/to/your-app
npm install /path/to/wdk-protocol-fiat-rheon/wdk-protocol-fiat-rheon-1.0.0-beta.1.tgz
```

`npm pack` writes `wdk-protocol-fiat-rheon-1.0.0-beta.1.tgz` (the module and its types). The examples and `.env.example` stay in the source folder: run them from there after `npm install`.

## Usage

```javascript
import RheonProtocol from 'wdk-protocol-fiat-rheon'

const rheon = new RheonProtocol(account, { request }) // `request`: see "The backend callback"

// An estimate of 100.00 USD of USDT (amounts in base units); no user needed.
// Rheon's sandbox native Apple Pay route is USD -> USDT on ethereum-sepolia; use your account's token and currency.
const estimate = await rheon.quoteBuy({ cryptoAsset: 'USDT', fiatCurrency: 'USD', fiatAmount: 10_000n })
// { cryptoAmount, fiatAmount: 10000n, fee, rate, metadata: { ...Rheon's estimate } }: bigint amounts, decimal-string rate

// 1. A firm quote for the user, valid about 3 minutes; the crypto goes to `recipient`, else the account's address
const quote = await rheon.quoteApplePay({
  cryptoAsset: 'USDT',
  fiatCurrency: 'USD',
  fiatAmount: 10_000n,
  externalId: 'your-user-id', // or customerId: 'cus_...'
  email: 'user@example.com',
  userIp: '8.8.8.8', // the user's public IP: Rheon refuses private and documentation ranges (user_ip_invalid)
  country: 'US'
})

// 2. Open the payment: the Apple Pay sheet to show (nothing is charged yet)
const { transactionId, applePay } = await rheon.createApplePayPayment({ quoteId: quote.quoteId, email: 'user@example.com' })
// applePay: { amount: '100.00', currency: 'USD', merchantCountryCode, supportedNetworks, merchantCapabilities,
//             requiredBillingContactFields, requiredShippingContactFields, termsLinks, expiresAt, ... }

// 3. Show the sheet in the app (PKPaymentRequest on iOS), then submit what it returned
const detail = await rheon.submitApplePayPayment(transactionId, {
  paymentToken,  // base64 of the token's paymentData alone
  email,         // from the sheet's shipping contact
  firstName,
  lastName,
  billingAddress: { countryCode: 'US', streetLine1, city, stateCode, zipCode },
  userIp: '8.8.8.8' // the same as the quote's
})

// 4. Follow it until the crypto arrives
const status = await rheon.getTransactionDetail(transactionId)
// { status: 'in_progress' | 'completed' | 'failed', cryptoAsset: 'USDT', fiatCurrency: 'USD', metadata: { ...Rheon's transaction } }
```

`account` is optional (`undefined`, an `IWalletAccountReadOnly` or an `IWalletAccount`). It is only read for its address: the default recipient of a quote.

Runnable examples: [`examples/backend.js`](examples/backend.js) (the backend callback, Node.js only) and [`examples/wallet.js`](examples/wallet.js) (one whole purchase in Rheon's sandbox, with Rheon's test token instead of a real card). Copy `.env.example` to `.env` and set a sandbox key, then `node --env-file=.env examples/backend.js` and, in another shell, `node --env-file=.env examples/wallet.js`. The example backend is a local sandbox demo with no user authentication: it listens on `127.0.0.1` only by default and refuses Rheon's production host. Setting `HOST` (e.g., `HOST=0.0.0.0`) overrides the loopback-only default and exposes it, unauthenticated, to your network: do not. A payment held for verification (`action_required`) prints the command to read that same payment again (`TRANSACTION_ID=txn_...`, with `SHOW_LINK=1` for its link); running the example without `TRANSACTION_ID` creates a new sandbox transaction.

### The backend callback

Your Rheon API key (`rk_...`) must stay on a server. The module never sees it and never calls the network itself: it hands each call to `request`, and your backend sends it to Rheon.

**What the module passes** (`RheonRequest`):

| Field | Type | Meaning |
|---|---|---|
| `method` | `'GET' \| 'POST'` | The HTTP method. |
| `path` | `string` | The path on Rheon's host, such as `/v1/quote` or `/v1/transactions/txn_.../apple-pay`. Ids in it are URL-encoded. |
| `headers` | `Record<string, string>` | Headers to send as they are: `Idempotency-Key` on every POST, none on a GET. |
| `body` | `object` (POST only) | The JSON body to send. |

**What your backend must do:**

1. Send the call to Rheon: `https://api.sandbox.rheon.io` with a sandbox key, `https://api.rheon.io` with a production key. Add `Authorization: Bearer <key>` and `Content-Type: application/json` on a POST, and keep `Idempotency-Key` unchanged: Rheon uses it to answer a repeated call as the first one and never to charge twice.
2. Resolve to `{ status, body }` (`RheonResponse`): Rheon's HTTP status and its parsed JSON body (`null` when it is empty). Do this for every answer Rheon gives, refusals and server errors included: the module reads Rheon's error envelope to raise `RheonApiError` (4xx) or `ProviderError` (5xx).
3. Throw (or reject) only when Rheon could not be reached or the answer could not be read. The module passes that error on as it is. Anything else than `{ status, body }` with an integer status and a `body` field is a `RheonCallbackError`; a 2xx whose body is not a JSON object is a `RheonApiError`.

**What your backend should check in production** (Rheon cannot tell your users apart; your backend can):

- Forward only the calls the module makes (see "Network calls and telemetry"), and refuse the rest.
- Forward a quote or a customer only for the signed-in user: the `externalId` (or `customerId`) and `email` in the body must be that user's.
- Forward `GET /v1/transactions/{id}` and the Apple Pay submit only for that user's transactions, and `simulate-checkout` not at all with a production key.
- For widget sessions, bind `externalUserId`, `externalOrderId`, wallet and return pages to the authenticated user/order. Restrict order lookup to that user's orders. The example backend does not implement these authorization checks and must not be exposed publicly as-is. Forward session creation server-to-server, never with browser Origin/Sec-Fetch headers or a secret key in the app.
- Replace `userIp` in the quote and the submit with the user's IP as your backend sees it. Rheon checks that both match and refuses users by IP country.

The wallet side of the callback, against a backend route of your own:

```javascript
const request = async ({ method, path, headers, body }) => {
  const response = await fetch('https://your-backend.example.com/rheon', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${userSessionToken}` },
    body: JSON.stringify({ method, path, headers, body })
  })
  if (!response.ok) throw new Error(`The backend failed: ${response.status}`)
  return response.json() // { status, body }: Rheon's answer, also when Rheon refused the call
}
```

The callback can also call Rheon directly when the module itself runs on your server, for example to quote from a backend. [`examples/backend.js`](examples/backend.js) is a minimal backend with the path allowlist and the `userIp` replacement; it has no user authentication.

### Native Apple Pay

- **Who gets it.** Rheon refuses native Apple Pay to users in the EEA and the UK, by country of residence, IP and billing country (`RheonApiError` `no_route`, `details.reason: 'not_available_for_user'`), and each route can block more countries. `getSupportedCountries()` says where buying is possible; the quote decides for one user.
- **The user.** `externalId` is your id for the user. When Rheon has no customer for it yet, `quoteApplePay` creates one (native Apple Pay needs only the id: the provider verifies the user itself) and quotes again. With `customerId` the module never creates one.
- **The sheet.** Build the Apple Pay payment request from `applePay` (see "Showing the Apple Pay sheet"), and show `termsLinks` before the user pays. Submit before `applePay.expiresAt`; after it, or after the quote's `expiresAt`, quote again (`quote_expired`).
- **After the submit** (`detail.metadata.status`):
  - `processing`: the provider has the payment, which is not yet proof that it was taken or that the crypto was sent. Poll `getTransactionDetail` until `completed` or `failed`.
  - `action_required` with `metadata.instructions` `{ type: 'open_url', purpose: 'provider_kyc', url, paymentHold }`: the provider must verify the user first. Open `url`; the payment is held until `paymentHold.until` (`paymentHold.status: 'held_until'`), or was dropped (`'cancelled'`).
  - `unknown`: Rheon could not tell whether the payment went through. Close the sheet as a success and poll; never start a new payment for the user meanwhile.
  - `manual_review`: Rheon is checking it. Poll.
- **Status.** `completed` only when the crypto reached the wallet (`metadata.deliveredAmount`); `failed` when it failed, expired or was refunded; `in_progress` otherwise, including statuses the module does not know.
- **Retries.** Every POST carries an `Idempotency-Key`: a random UUID, or `config.idempotencyKey`. Sending a call again with the same key answers what the first answered and never charges twice.

### Showing the Apple Pay sheet

`createApplePayPayment` returns everything the sheet needs except your merchant id. The values use Apple Pay's own names (`visa`, `masterCard`, `supports3DS`, `postalAddress`), the same as Apple Pay on the web; map them to the PassKit constants on iOS.

| `applePay` field | Apple Pay payment request (iOS `PKPaymentRequest`) |
|---|---|
| `amount`, `currency` | one summary item for `amount` (label: your app, paid to `processorName`), `currencyCode` |
| `merchantCountryCode` | `countryCode` (the processor's country, not the user's) |
| `supportedNetworks` | `supportedNetworks` |
| `merchantCapabilities` | `merchantCapabilities` |
| `requiredBillingContactFields` | `requiredBillingContactFields` (name and postal address) |
| `requiredShippingContactFields` | `requiredShippingContactFields` (the email) |
| (your app) | `merchantIdentifier`: your Apple Pay merchant id, which Rheon's provider must accept |

From the authorized payment, pass to `submitApplePayPayment`:

| `authorization` field | From the Apple Pay payment (iOS `PKPayment`) |
|---|---|
| `paymentToken` | `token.paymentData`, base64-encoded (the payment data alone, not the whole token) |
| `email` | `shippingContact.emailAddress`; it must be the transaction's email |
| `firstName`, `lastName` | `billingContact.name.givenName`, `billingContact.name.familyName` |
| `billingAddress` | `billingContact.postalAddress`: `isoCountryCode` as `countryCode`, `street` as `streetLine1` (a second line as `streetLine2`), `state` as `stateCode`, `city`, `postalCode` as `zipCode` |
| `userIp` | the same IP as the quote's (your backend can fill it) |

Close the sheet with success when `submitApplePayPayment` resolves `in_progress` (also for Rheon's `unknown`: the next step is in the result, not in the sheet), and with failure when it resolves `failed` or Rheon refuses the payment (`RheonApiError`). When the answer is lost or Rheon fails (`ProviderError`), send the same call again with the same `idempotencyKey`; never start a new payment for it.

### Sandbox

The example needs a sandbox account that Rheon has enabled for simulated pricing; a sandbox key alone does not select it. The firm quote then has `metadata.simulated: true`, and its amounts are simulated, not a price. The simulated rate asks the payment processor nothing, so it checks the declared `country` but not the country of `userIp`: a UK IP is quoted in the sandbox and refused in production; `examples/wallet.js` checks this before creating a payment and generates a fresh documented test token for each purchase.

After submitting the test token, simulate `paid` first, then `delivered` with `simulateCheckout(transactionId, outcome)`. The submit alone does not record a paid payment: simulating delivery first is refused with `simulate_paid_first`. A simulated delivery ends as `completed`, with `deliveredAmount` matching the quote and `deliveryProof: null`. Nothing is charged and no real crypto is sent. A production key refuses `simulateCheckout` (`permission_denied`, `details.reason: 'sandbox_only'`).

### Amounts and quotes

Amounts are `number | bigint` in base units: cents for fiat (ISO 4217 decimals, 0 for JPY), on-chain base units for crypto. Quotes return `bigint` base units and a decimal-string `rate` (fiat units per crypto unit).

- Native Apple Pay is priced by fiat amount only (`exact_in`): a `cryptoAmount` is refused.
- `fiatAmount` is what the user pays, every fee included; `fee` is Rheon's total fee in the fiat currency, already inside `fiatAmount`; `cryptoAmount` is what reaches the wallet.
- `quoteBuy` is Rheon's estimate, without a user: it does not tell whether the user gets native Apple Pay, and the user's quote can differ. Use `quoteApplePay` for the price the user pays.
- A price for another amount or other assets than requested is refused.

## Configuration

| Option | Type | Default | Description |
|---|---|---|---|
| `request` | `(request: RheonRequest) => Promise<RheonResponse>` | required | Sends one call to Rheon's partner API from your backend. |
| `cacheTime` | `number` | `600000` | How long, in ms, your account's routes (`GET /v1/config`) are cached. |
| `assetDecimals` | `Record<string, number>` | built-in table | On-chain decimals by `<code>:<chain>` in Rheon's codes (e.g. `{ 'USDC:arbitrum': 6 }`), added to the built-in table. |
| `merchantTransactionId` | `string` | generated UUID | Default widget order id; persist it for status lookup. Override per operation for a new order. |

Per call, under `config`:

| Option | Methods | Description |
|---|---|---|
| `chain` | quotes, `buy`, `sell` | Rheon's chain of the token (e.g. `solana`, `base`), when your account has the token on several chains. |
| `routeId` | quotes only | Use this route of your account only; widget session creation refuses it. |
| `method` | `quoteBuy`, `quoteSell`, `buy`, `sell` | Select `bank`, `card` or `apple_pay_hosted` (buy only) for `buy`/`sell`. Quotes take `bank` or `apple_pay` (native Apple Pay, buy only); `card` and `apple_pay_hosted` throw `ValueError`, as Rheon prices them only inside the widget. |
| `merchantTransactionId` | `buy`, `sell` | Override the instance's widget order id. |
| `idempotencyKey` | `buy`, `sell`, `quoteApplePay`, `createApplePayPayment`, `submitApplePayPayment`, `simulateCheckout` | At most 190 characters. Widget default: a digest of the order id; native default: a random UUID. Keep it stable for retries. |

## Supported networks and assets

The supported native Apple Pay and widget buy/sell routes of your Rheon account whose quotes are on (`GET /v1/config`), for tokens whose on-chain decimals the module knows: USDC on `solana`, `base`, `ethereum`; USDT on `ethereum`, `tron`; and their test chains (`solana-sandbox`, `base-sepolia`, `ethereum-sepolia`). Add others with `assetDecimals`. Which routes your account has, and their limits, is set by Rheon for your account. Pricing availability does not grant permission to make a payment.

## API reference

| Method | Returns |
|---|---|
| `quoteBuy(options)` | `Promise<RheonBuyQuote>` (Rheon's estimate; bank and native Apple Pay routes only) |
| `quoteApplePay(options)` | `Promise<RheonApplePayQuote>` (with `quoteId` and `expiresAt`) |
| `createApplePayPayment({ quoteId, email })` | `Promise<RheonApplePayPayment>` (`transactionId` and the `applePay` sheet) |
| `submitApplePayPayment(transactionId, authorization)` | `Promise<RheonTransactionDetail>` |
| `buy(options)`, `sell(options)` | `Promise<{ buyUrl }>` / `Promise<{ sellUrl }>` (Rheon widget) |
| `quoteSell(options)` | `Promise<RheonSellQuote>` (indicative estimate; bank routes only) |
| `getTransactionDetail(merchantTransactionIdOrNativeTransactionId)` | `Promise<RheonTransactionDetail>` |
| `simulateCheckout(transactionId, outcome)` | `Promise<RheonSimulation>` (sandbox only) |
| `getSupportedCryptoAssets()` | `Promise<RheonSupportedCryptoAsset[]>` (one entry per token and chain) |
| `getSupportedFiatCurrencies()` | `Promise<RheonSupportedFiatCurrency[]>` |
| `getSupportedCountries()` | `Promise<SupportedCountry[]>` (ISO 3166-1 alpha-2) |

All types are exported from the package and declared in `types/`.

## Errors

| Error | From | When |
|---|---|---|
| `ValueError` (`@tetherto/wdk-wallet`) | all | Invalid input: a crypto amount, no fiat amount or one that is not a positive integer, a token, chain or fiat currency your account has no native Apple Pay route for, a missing email, IP or country, not exactly one of `externalId` and `customerId`, no recipient, an empty transaction id or payment token. Thrown before any call to Rheon, except for the route checks, which read your routes first. |
| `NoSuchElementError` (`@tetherto/wdk-wallet`) | `getTransactionDetail` | Rheon has no transaction of your account with the id. |
| `RheonApiError` | all | Rheon refused the call (4xx) or answered something the module cannot use (e.g., a body that is not a JSON object, or a price without a positive decimal rate). `status`, `code` (e.g. `no_route`, `identity_required`, `quote_expired`, `invalid_state`), `details`, `retry` (`{ safe, afterMs, action }`) and `requestId` (for Rheon support) come from Rheon's error envelope. |
| `ProviderError` (`@tetherto/wdk-wallet`) | all | Rheon failed with a server error (5xx), reason `INTERNAL_SERVER_ERROR`; Rheon's answer is the `cause`. |
| `RheonCallbackError` | all | `request` resolved to anything but `{ status, body }` (an integer status and a `body` field, `null` when empty). |
| `RheonConfigurationError` | constructor, quotes | No configuration or no `request` callback, or a token whose on-chain decimals are unknown. |

An error the `request` callback throws is passed on as it is.

## Network calls and telemetry

The module makes no network call itself and sends no telemetry. Every call goes through `request`, to these paths of Rheon's partner API ([reference](https://api.rheon.io/docs)):

| Call | Made by |
|---|---|
| `GET /v1/config` | the route lookups (cached for `cacheTime`) |
| `POST /v1/estimate` | `quoteBuy`, `quoteSell` |
| `POST /v1/widget/sessions` | `buy`, `sell` |
| `GET /v1/widget/orders?externalOrderId=...` | `getTransactionDetail` with a merchant order id |
| `POST /v1/quote`, `POST /v1/customers` | `quoteApplePay` (the customer only when Rheon has none for the `externalId`) |
| `POST /v1/transactions` | `createApplePayPayment` |
| `POST /v1/transactions/{id}/apple-pay` | `submitApplePayPayment` |
| `GET /v1/transactions/{id}` | `getTransactionDetail` |
| `POST /v1/transactions/{id}/simulate-checkout` | `simulateCheckout` (sandbox) |

The user's email, IP, country, name and billing address go to Rheon only in the calls that need them (the quote and the payment); the module keeps none of them.

## Development

```bash
npm install
npm test               # jest, with Rheon's documented answers as fixtures (tests/fixtures)
npm run test:coverage
npm run lint           # standard
npm run build:types    # tsc -> types/
```

The tests make no network call.

## Support

Questions and integration help: hello@rheon.io. Security problems: see [SECURITY.md](SECURITY.md).

## License

Rheon Evaluation License: internal evaluation and testing only, no redistribution or production use. See [LICENSE](LICENSE).
