export default class RheonProtocol extends FiatProtocol {
    /**
     * Creates a new interface to interact with Rheon without binding it to a wallet account.
     *
     * @overload
     * @param {undefined} account - The wallet account to use to interact with the protocol.
     * @param {RheonProtocolConfig} config - The Rheon protocol configuration.
     * @throws {RheonConfigurationError} If the configuration has no `request` callback.
     */
    constructor(account: undefined, config: RheonProtocolConfig);
    /**
     * Creates a new read-only interface to interact with Rheon.
     *
     * @overload
     * @param {IWalletAccountReadOnly} account - The wallet account whose address receives the bought crypto.
     * @param {RheonProtocolConfig} config - The Rheon protocol configuration.
     * @throws {RheonConfigurationError} If the configuration has no `request` callback.
     */
    constructor(account: IWalletAccountReadOnly, config: RheonProtocolConfig);
    /**
     * Creates a new interface to interact with Rheon.
     *
     * @overload
     * @param {IWalletAccount} account - The wallet account whose address receives the bought crypto.
     * @param {RheonProtocolConfig} config - The Rheon protocol configuration.
     * @throws {RheonConfigurationError} If the configuration has no `request` callback.
     */
    constructor(account: IWalletAccount, config: RheonProtocolConfig);
    /** @private */
    private _request;
    /** @private */
    private _cacheTime;
    /** @private */
    private _assetDecimals;
    /** @private */
    private _routesCache;
    /** The default widget order id. Persist it before opening the URL; no API secret is stored. @type {string} */
    merchantTransactionId: string;
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
    quoteBuy(options: RheonQuoteBuyOptions): Promise<RheonBuyQuote>;
    /**
     * Open a Rheon widget visit, with its receiving wallet, asset, fiat and pay amount locked.
     *
     * @param {RheonBuyOptions} options - Fiat amount in base units; recipient defaults to the account.
     * @returns {Promise<BuyResult>} Only the widget URL; save config.merchantTransactionId or the instance's generated id for status.
     */
    buy(options: RheonBuyOptions): Promise<BuyResult>;
    /**
     * Estimate a sale by crypto pay amount, on a bank route (card is priced only inside the widget, `sell`). Fee is converted to fiat, half-up to its minor unit.
     *
     * @param {Omit<RheonSellOptions, 'refundAddress' | 'config'> & { config?: RheonRouteParams }} options - Crypto amount in base units.
     * @returns {Promise<RheonSellQuote>} Indicative sell quote; rate is fiat units per token, to 18 decimal places.
     */
    quoteSell(options: Omit<RheonSellOptions, "refundAddress" | "config"> & {
        config?: RheonRouteParams;
    }): Promise<RheonSellQuote>;
    /**
     * Open a Rheon sell widget. The account/refundAddress is the fixed source and refund wallet; no signing occurs.
     *
     * @param {RheonSellOptions} options - Crypto pay amount in base units.
     * @returns {Promise<SellResult>} Only the widget URL.
     */
    sell(options: RheonSellOptions): Promise<SellResult>;
    /** @private */
    private _sellAmount;
    /** @private */
    private _widgetUrl;
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
    quoteApplePay(options: RheonApplePayQuoteOptions): Promise<RheonApplePayQuote>;
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
    createApplePayPayment({ quoteId, email, config }: RheonApplePayPaymentOptions): Promise<RheonApplePayPayment>;
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
    submitApplePayPayment(transactionId: string, authorization: RheonApplePayAuthorization, config?: RheonRequestParams): Promise<RheonTransactionDetail>;
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
    getTransactionDetail(txId: string): Promise<RheonTransactionDetail>;
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
    simulateCheckout(transactionId: string, outcome: "paid" | "failed" | "delivered", config?: RheonRequestParams): Promise<RheonSimulation>;
    /**
     * Retrieves a list of supported crypto assets from the provider: the tokens of the buy/sell routes your
     * account can quote, once per chain, whose on-chain decimals the module knows.
     *
     * @returns {Promise<RheonSupportedCryptoAsset[]>} An array of supported crypto assets.
     * @throws {RheonApiError} If Rheon refuses the read of your account's routes or answers it unreadably.
     * @throws {RheonCallbackError} If the `request` callback resolves to anything but `{ status, body }`.
     * @throws {ProviderError} If Rheon fails with a server error.
     */
    getSupportedCryptoAssets(): Promise<RheonSupportedCryptoAsset[]>;
    /**
     * Retrieves a list of supported fiat currencies from the provider: the currencies the buy/sell routes your
     * account can quote take, with their ISO 4217 decimals.
     *
     * @returns {Promise<RheonSupportedFiatCurrency[]>} An array of supported fiat currencies.
     * @throws {RheonApiError} If Rheon refuses the read of your account's routes or answers it unreadably.
     * @throws {RheonCallbackError} If the `request` callback resolves to anything but `{ status, body }`.
     * @throws {ProviderError} If Rheon fails with a server error.
     */
    getSupportedFiatCurrencies(): Promise<RheonSupportedFiatCurrency[]>;
    /**
     * Retrieves indicative country support from enabled pricing routes and their blocked-country lists. Native Apple
     * Pay also excludes the EEA/UK. Widget buy and sell have independent flags; the provider can still refuse a user.
     *
     * @returns {Promise<RheonSupportedCountry[]>} Every ISO 3166-1 alpha-2 country, with whether buying and selling are allowed.
     * @throws {RheonApiError} If Rheon refuses the read of your account's routes or answers it unreadably.
     * @throws {RheonCallbackError} If the `request` callback resolves to anything but `{ status, body }`.
     * @throws {ProviderError} If Rheon fails with a server error.
     */
    getSupportedCountries(): Promise<RheonSupportedCountry[]>;
    /** @private */
    private _createCustomer;
    /** @private */
    private _toQuote;
    /** @private */
    private _checkTransaction;
    /** @private */
    private _toDetail;
    /** @private */
    private _findRoute;
    /** @private */
    private _getRoutes;
    /** @private */
    private _call;
}
export type IWalletAccount = import("@tetherto/wdk-wallet").IWalletAccount;
export type IWalletAccountReadOnly = import("@tetherto/wdk-wallet").IWalletAccountReadOnly;
export type BuyCommonOptions = import("@tetherto/wdk-wallet/protocols").BuyCommonOptions;
export type BuyWithFiatAmountOptions = import("@tetherto/wdk-wallet/protocols").BuyWithFiatAmountOptions;
export type BuyResult = import("@tetherto/wdk-wallet/protocols").BuyResult;
export type SellResult = import("@tetherto/wdk-wallet/protocols").SellResult;
export type FiatQuote = import("@tetherto/wdk-wallet/protocols").FiatQuote;
export type FiatTransactionStatus = import("@tetherto/wdk-wallet/protocols").FiatTransactionStatus;
export type FiatTransactionDetail = import("@tetherto/wdk-wallet/protocols").FiatTransactionDetail;
export type SupportedCryptoAsset = import("@tetherto/wdk-wallet/protocols").SupportedCryptoAsset;
export type SupportedFiatCurrency = import("@tetherto/wdk-wallet/protocols").SupportedFiatCurrency;
export type SupportedCountry = import("@tetherto/wdk-wallet/protocols").SupportedCountry;
/**
 * One call to Rheon's partner API, for the `request` callback to send with your Rheon API key.
 */
export type RheonRequest = {
    /**
     * - The HTTP method.
     */
    method: "GET" | "POST";
    /**
     * - The path on Rheon's API host, with its query (e.g., '/v1/quote').
     */
    path: string;
    /**
     * - Headers to send as they are (e.g., `Idempotency-Key` on every POST).
     */
    headers: Record<string, string>;
    /**
     * - The JSON body of a POST.
     */
    body?: Record<string, unknown>;
};
/**
 * Rheon's answer to one call, as the `request` callback received it.
 */
export type RheonResponse = {
    /**
     * - The HTTP status code of Rheon's answer.
     */
    status: number;
    /**
     * - The parsed JSON body of Rheon's answer (null when it has none).
     */
    body: unknown;
};
export type RheonProtocolConfig = {
    /**
     * - Sends one call to Rheon's partner API from your backend, adding your Rheon API key as `Authorization: Bearer <key>`, and resolves to Rheon's status and JSON body. Your backend decides the host: `https://api.sandbox.rheon.io` for a sandbox key, `https://api.rheon.io` for a production key.
     */
    request: (request: RheonRequest) => Promise<RheonResponse>;
    /**
     * - How long, in milliseconds, the account's routes from `GET /v1/config` are cached (default: 600,000, 10 minutes).
     */
    cacheTime?: number;
    /**
     * - On-chain decimals of crypto assets, keyed by `<code>:<chain>` in Rheon's codes (e.g., `{ 'USDC:base': 6 }`). Extends and overrides the module's built-in table.
     */
    assetDecimals?: Record<string, number>;
    /**
     * - Your order id (1–180 characters, not beginning `txn_`). Defaults to a UUID, readable on the instance. Use one instance per order, or override it in each buy/sell config.
     */
    merchantTransactionId?: string;
};
/**
 * An asset as Rheon writes it: a fiat currency (code only) or a token on a chain.
 */
export type RheonAsset = {
    /**
     * - The asset's code (e.g., 'USD', 'USDC').
     */
    code: string;
    /**
     * - The token's chain in Rheon's codes (e.g., 'solana', 'base-sepolia').
     */
    chain?: string;
    /**
     * - The token's contract or mint address.
     */
    contract?: string;
};
/**
 * An amount as Rheon writes it.
 */
export type RheonAmount = {
    /**
     * - The amount, as a decimal string in the asset's units.
     */
    amount: string;
    /**
     * - The asset of the amount.
     */
    asset: RheonAsset;
};
/**
 * Whether a route stage is switched on for your account.
 */
export type RheonAvailability = {
    /**
     * - Whether the stage is on.
     */
    enabled: boolean;
    /**
     * - Why it is off ('not_enabled', 'temporarily_unavailable' or 'not_supported'), or null when it is on.
     */
    reason: string | null;
};
/**
 * A route of your account, as listed by Rheon's `GET /v1/config`.
 */
export type RheonRoute = {
    /**
     * - The route's id.
     */
    routeId: string;
    /**
     * - The route's product: native Apple Pay or a widget buy/sell product.
     */
    product: string;
    /**
     * - The provider of the route.
     */
    provider: string;
    /**
     * - The provider's environment.
     */
    providerEnvironment: "sandbox" | "production";
    /**
     * - The pay asset (fiat on a buy, crypto on a sell).
     */
    from: RheonAsset;
    /**
     * - The receive asset (crypto on a buy, fiat on a sell).
     */
    to: RheonAsset;
    /**
     * - How the user pays, e.g. 'apple_pay', 'bank_transfer' or 'card'.
     */
    paymentMethod: string;
    /**
     * - Rheon's bounds in the source asset.
     */
    limits: {
        minSourceAmount?: string;
        maxSourceAmount?: string;
    };
    /**
     * - Whether quotes and payments are on for your account.
     */
    availability: {
        pricing: RheonAvailability;
        payments: RheonAvailability;
    };
    /**
     * - Upper-case ISO 3166-1 alpha-2 codes of countries whose users the route refuses.
     */
    blockedCountries: string[];
};
/**
 * A price from Rheon's `POST /v1/estimate` or `POST /v1/quote`.
 */
export type RheonPrice = {
    /**
     * - The quote's id; only on a quote.
     */
    quoteId?: string;
    /**
     * - The customer's id; only on a quote.
     */
    customerId?: string;
    /**
     * - The route that priced it.
     */
    routeId: string;
    /**
     * - The route's provider.
     */
    provider: string;
    /**
     * - The route's product.
     */
    product: string;
    /**
     * - The amount that is fixed: the source/pay amount.
     */
    exactMode: "exact_in";
    /**
     * - What the user pays, every fee included.
     */
    sourceAmount: RheonAmount;
    /**
     * - What reaches the wallet.
     */
    expectedDeliveredAmount: RheonAmount;
    /**
     * - Every fee, in the source asset, already inside `sourceAmount`.
     */
    totalFee: RheonAmount;
    /**
     * - Source units per one destination unit (token per fiat on a sell).
     */
    fxRate: string;
    /**
     * - When the quote expires, as an ISO 8601 string; only on a quote.
     */
    expiresAt?: string;
    /**
     * - True on an estimate: a user's quote can differ.
     */
    indicative?: boolean;
    /**
     * - True when Rheon's sandbox test rate priced it.
     */
    simulated?: boolean;
};
/**
 * The native Apple Pay sheet to show, from the `present_apple_pay` step of Rheon's transaction.
 */
export type RheonApplePayRequest = {
    /**
     * - The step's type.
     */
    type: "present_apple_pay";
    /**
     * - The amount of the payment, as a decimal string.
     */
    amount: string;
    /**
     * - The currency of the payment (ISO 4217).
     */
    currency: string;
    /**
     * - The `countryCode` of the Apple Pay payment request.
     */
    merchantCountryCode: string;
    /**
     * - Who processes the payment, to name on the sheet.
     */
    processorName: string;
    /**
     * - The card networks of the Apple Pay payment request.
     */
    supportedNetworks: string[];
    /**
     * - The merchant capabilities of the Apple Pay payment request.
     */
    merchantCapabilities: string[];
    /**
     * - The billing contact fields to request.
     */
    requiredBillingContactFields: string[];
    /**
     * - The shipping contact fields to request (the email).
     */
    requiredShippingContactFields?: string[];
    /**
     * - The terms to show the user before they pay.
     */
    termsLinks: {
        name: string;
        url: string;
    }[];
    /**
     * - When the sheet may no longer be submitted, as an ISO 8601 string.
     */
    expiresAt: string;
    /**
     * - Where the token goes; `submitApplePayPayment` sends it there.
     */
    submit: {
        method: string;
        path: string;
    };
};
/**
 * A transaction as Rheon's `GET /v1/transactions/{id}` shows it.
 */
export type RheonTransaction = {
    /**
     * - The transaction's id.
     */
    transactionId: string;
    /**
     * - Rheon's status ('preparing', 'action_required', 'awaiting_user', 'processing', 'manual_review', 'unknown', 'completed', 'failed', 'expired', 'refunding' or 'refunded').
     */
    status: string;
    /**
     * - The user's step, only while the user has to act: `present_apple_pay`, or `open_url` with `purpose: 'provider_kyc'`.
     */
    instructions: Record<string, unknown> | null;
    /**
     * - What the user pays.
     */
    sourceAmount?: RheonAmount;
    /**
     * - What the quote said reaches the wallet.
     */
    expectedDeliveredAmount?: RheonAmount;
    /**
     * - What reached the wallet, once it did.
     */
    deliveredAmount?: RheonAmount | null;
    /**
     * - Why the transaction failed, when it did.
     */
    failureReason?: string | null;
};
/**
 * The transaction Rheon opened for a native Apple Pay quote.
 */
export type RheonApplePayPayment = {
    /**
     * - The transaction's id, for `submitApplePayPayment` and `getTransactionDetail`.
     */
    transactionId: string;
    /**
     * - The Apple Pay sheet to show, or null when Rheon asks for no sheet (read `metadata.status`).
     */
    applePay: RheonApplePayRequest | null;
    /**
     * - The transaction as Rheon answered it.
     */
    metadata: RheonTransaction;
};
/**
 * What the Apple Pay sheet returned, for `submitApplePayPayment`.
 */
export type RheonApplePayAuthorization = {
    /**
     * - The base64 of the Apple Pay token's `paymentData` alone (iOS: `payment.token.paymentData.base64EncodedString()`).
     */
    paymentToken: string;
    /**
     * - The email from the sheet's shipping contact; the same address as the transaction's email.
     */
    email: string;
    /**
     * - The billing contact's first name.
     */
    firstName: string;
    /**
     * - The billing contact's last name.
     */
    lastName: string;
    /**
     * - The billing contact's postal address.
     */
    billingAddress: RheonBillingAddress;
    /**
     * - The user's public IP address; the same as the quote's.
     */
    userIp: string;
};
/**
 * The billing contact's postal address from the Apple Pay sheet.
 */
export type RheonBillingAddress = {
    /**
     * - The ISO 3166-1 alpha-2 country code.
     */
    countryCode: string;
    /**
     * - The first street line.
     */
    streetLine1: string;
    /**
     * - The second street line.
     */
    streetLine2?: string;
    /**
     * - The state or region code.
     */
    stateCode?: string;
    /**
     * - The city.
     */
    city: string;
    /**
     * - The postal code.
     */
    zipCode: string;
};
/**
 * What Rheon's sandbox played for `simulateCheckout`.
 */
export type RheonSimulation = {
    /**
     * - The simulation's id.
     */
    simulationId: string;
    /**
     * - The transaction's id.
     */
    transactionId: string;
    /**
     * - The outcome played.
     */
    outcome: "paid" | "failed" | "delivered";
    /**
     * - Rheon's status of the transaction right after it.
     */
    status: string;
    /**
     * - Always true.
     */
    simulated: true;
    /**
     * - The transaction's path on Rheon's API.
     */
    transactionUrl: string;
    /**
     * - When it was played, as an ISO 8601 string.
     */
    createdAt: string;
};
export type RheonRouteParams = {
    /**
     * - Rheon's chain of the token (e.g., 'solana'); needed when your account has the token on several chains.
     */
    chain?: string;
    /**
     * - A route id from `GET /v1/config`, to use that route only.
     */
    routeId?: string;
    /**
     * - Select a widget method, or native Apple Pay for estimates. Estimates price bank and native Apple Pay only; card and hosted Apple Pay are priced inside the widget. Native Apple Pay is never a widget method.
     */
    method?: "bank" | "card" | "apple_pay_hosted" | "apple_pay";
};
export type RheonRequestParams = {
    /**
     * - The `Idempotency-Key` of the call, at most 190 characters (default: a random UUID). Send the same key again to retry the same call safely. When a quote first creates the user's customer, those calls take this key with `-customer` and `-requote` appended.
     */
    idempotencyKey?: string;
};
export type RheonApplePayQuoteParams = RheonRouteParams & RheonRequestParams;
export type RheonQuoteBuyOptions = Omit<BuyCommonOptions, "recipient"> & BuyWithFiatAmountOptions & {
    config?: RheonRouteParams;
};
export type RheonWidgetParams = Omit<RheonRouteParams, "routeId"> & RheonRequestParams & {
    merchantTransactionId?: string;
    externalUserId?: string;
    returnUrl?: string;
    cancelUrl?: string;
    locale?: string;
};
export type RheonBuyOptions = BuyCommonOptions & BuyWithFiatAmountOptions & {
    config?: RheonWidgetParams;
};
export type RheonSellOptions = import("@tetherto/wdk-wallet/protocols").SellCommonOptions & import("@tetherto/wdk-wallet/protocols").SellExactCryptoAmountOptions & {
    config?: RheonWidgetParams;
};
export type RheonSellQuote = FiatQuote & {
    metadata: RheonPrice;
};
export type RheonApplePayUser = {
    /**
     * - The user's email; Rheon's provider identifies the user by it.
     */
    email: string;
    /**
     * - The user's public IP address.
     */
    userIp: string;
    /**
     * - The user's country of residence (ISO 3166-1 alpha-2).
     */
    country: string;
    /**
     * - Your id for the user. Rheon creates its customer with it when the quote asks for one. Give this or `customerId`.
     */
    externalId?: string;
    /**
     * - Rheon's customer id. Give this or `externalId`.
     */
    customerId?: string;
};
export type RheonApplePayQuoteOptions = BuyCommonOptions & BuyWithFiatAmountOptions & RheonApplePayUser & {
    config?: RheonApplePayQuoteParams;
};
export type RheonApplePayPaymentOptions = {
    /**
     * - The `quoteId` of a native Apple Pay quote.
     */
    quoteId: string;
    /**
     * - The user's email; the same as the quote's.
     */
    email: string;
    /**
     * - The call's options.
     */
    config?: RheonRequestParams;
};
export type RheonBuyQuote = FiatQuote & {
    metadata: RheonPrice;
};
export type RheonApplePayQuote = RheonBuyQuote & {
    quoteId: string;
    expiresAt: string;
};
export type RheonTransactionDetail = FiatTransactionDetail & {
    metadata: RheonTransaction;
};
export type RheonSupportedCryptoAsset = SupportedCryptoAsset & {
    metadata: RheonAsset;
};
export type RheonSupportedFiatCurrency = SupportedFiatCurrency & {
    metadata: RheonAsset;
};
/**
 * A country, with whether the account's routes allow buying and selling there. A named type of its own, so that
 * the generated declaration keeps `getSupportedCountries` (TypeScript drops a JavaScript override whose type
 * matches the abstract base's).
 */
export type RheonSupportedCountry = {
    /**
     * - The country's ISO 3166-1 alpha-2 code.
     */
    code: string;
    /**
     * - Whether a buy route allows the country.
     */
    isBuyAllowed: boolean;
    /**
     * - Whether a sell route allows the country.
     */
    isSellAllowed: boolean;
};
import { FiatProtocol } from '@tetherto/wdk-wallet/protocols';
