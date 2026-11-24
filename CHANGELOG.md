# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `RheonProtocol`, implementing `IFiatProtocol` from `@tetherto/wdk-wallet/protocols`, with a Node.js and a Bare entry point. The module makes no network call itself: every call goes to Rheon's partner API through the `request` backend callback, which holds the API key.
- Widget buy and sell: `buy` and `sell` return a Rheon widget `buyUrl` or `sellUrl` with a short-lived, one-use launch token, for the account's bank, card and hosted Apple Pay (buy only) routes, selected with `config.method`. They refuse `config.routeId`. The widget locks the amount, fiat currency, token, chain and wallet (`recipient` for buy, `refundAddress` for sell, else the account's address); selling never signs or sends crypto.
- Merchant order ids: `merchantTransactionId` in the constructor or per operation (1-180 characters, not starting `txn_`, a generated UUID by default), sent as `externalOrderId`, with an idempotency key derived from it so retries reuse the same widget session.
- `quoteBuy` (Rheon's estimate by fiat amount, for bank widget routes or native Apple Pay) and `quoteSell` (an indicative estimate by crypto amount on bank routes, with the total fee in fiat minor units and the rate as fiat units per token). Card and hosted Apple Pay have no partner estimate (Rheon prices them inside the widget): quotes for them throw `ValueError` before calling Rheon, instead of Rheon's `400 invalid_request` (`product_mismatch`).
- `getTransactionDetail` takes a merchant order id, resolved through `GET /v1/widget/orders`, or a native Rheon transaction id (`txn_...`). Before a payment exists it throws `NoSuchElementError`; an order id used for several payments is refused as `ambiguous_order`.
- Native Apple Pay purchases: `quoteApplePay` (a firm quote; creates the user's customer when Rheon has none), `createApplePayPayment` (the Apple Pay sheet to show) and `submitApplePayPayment` (the token from the sheet), with idempotency keys on every POST.
- `simulateCheckout` for Rheon's sandbox.
- `getSupportedCryptoAssets`, `getSupportedFiatCurrencies` and `getSupportedCountries` from the account's native Apple Pay and widget buy and sell routes whose quotes are on; `getSupportedCountries` reports buy and sell separately.
- Configuration: `request`, `cacheTime`, `assetDecimals` and `merchantTransactionId`; per call `config.chain`, `config.routeId` (quotes only), `config.method`, `config.merchantTransactionId`, `config.idempotencyKey`, and the widget's `returnUrl`, `cancelUrl`, `locale` and `externalUserId`.
- `RheonApiError`, `RheonConfigurationError` and `RheonCallbackError`.
- README: the contract of the `request` backend callback (what it receives, what it must resolve to, what a production backend should check) and how to build the Apple Pay sheet from `applePay` and the submit from the authorized payment.
- Examples: `examples/backend.js` (the backend callback with a path allowlist, forwarding widget calls without browser fetch headers), `examples/wallet.js` (one whole native Apple Pay purchase in the sandbox) and `examples/widget.js` (a sandbox buy or sell estimate and widget link, with `JOURNEY` and `PAYMENT_METHOD`, default `bank`, the method of Rheon's sandbox widget routes).

### Fixed

- The generated declaration now includes `getSupportedCountries` (typed `RheonSupportedCountry`), so a strict TypeScript consumer of the package compiles without `skipLibCheck`.
- `quoteBuy` and `quoteApplePay` refuse a price whose `fxRate` is not a positive decimal string, as `quoteSell` already did.
- `new RheonProtocol()` with no configuration throws `RheonConfigurationError`; a callback result without a `body` field is a `RheonCallbackError`.
- Installation from a local `npm pack` tarball (the package is not on the npm registry); `private: true` guards against publishing.
- `examples/wallet.js` with `TRANSACTION_ID` reads an existing payment again (and, with `SHOW_LINK=1`, prints its verification link) instead of creating another sandbox transaction; a held payment prints that command.
- Examples: the backend listens on `127.0.0.1` and refuses Rheon's production host (it has no user authentication); `widget.js` and `wallet.js` print one-use widget and verification links only with `SHOW_LINK=1`.
- Fixtures, tests and docs use illustrative provider codes, processor names and links.
- `examples/widget.js` treats empty variables of a copied `.env.example` (`CRYPTO_ASSET=`, `CHAIN=`, `FIAT_CURRENCY=`) as unset; before, the empty chain matched no route.
- README native Apple Pay snippet runs against Rheon's sandbox as written: USDT (the sandbox route's token) and a public `userIp`, since Rheon refuses documentation IPs such as `203.0.113.7` (`user_ip_invalid`); the sandbox section says the fixed test rate does not check the IP's country.
- Sandbox wallet example: simulate payment before delivery and use a new test payment id for each purchase, so repeated runs complete without `simulate_paid_first` or `apple_payment_already_used` refusals. Refuse non-simulated quotes before creating a payment.
