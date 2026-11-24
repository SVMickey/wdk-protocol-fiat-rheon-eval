# Test fixtures

Synthetic examples of Rheon partner API answers, shaped as Rheon's partner API documents them
([reference](https://api.rheon.io/docs)). Every id, address, amount, processor name and link in them is
illustrative: the provider codes `example_pay` and `example_bank` and the `.example` hosts are placeholders.

| File | What it is |
|---|---|
| `config.apple-pay.json` | A `GET /v1/config` answer: a bank on-ramp route plus three native Apple Pay routes (two quotable, one switched off) |
| `estimate-apple-pay.response.json` | `POST /v1/estimate` on a native Apple Pay route |
| `create-transaction-apple-pay.response.json` | `POST /v1/transactions`: the `present_apple_pay` step |
| `submit-apple-pay-sandbox-test-token.request.json` | `POST /v1/transactions/{id}/apple-pay` with Rheon's sandbox test token (no real card) |
| `get-transaction.apple-pay-processing.response.json` | A native Apple Pay transaction after the payment was taken |
| `get-transaction.apple-pay-kyc.response.json` | A native Apple Pay transaction held for verification (`open_url`, `provider_kyc`) |
| `get-transaction.completed.response.json` | A completed transaction with its delivered amount |
| `simulate-checkout.delivered.response.json` | `POST /v1/transactions/{id}/simulate-checkout` with `delivered` |
| `error.identity-required-new-customer.response.json` | `422 identity_required`: no customer yet, `nextAction.type: create_customer` |
| `error.customer-exists.response.json` | `409 customer_exists` |
| `error.not-available-for-user.response.json` | `400 no_route`, `details.reason: not_available_for_user` |
| `error.not-found.response.json` | `404 not_found` |
| `error.apple-payment-used.response.json` | `409 invalid_state`, `details.reason: apple_payment_already_used` |
| `error.sandbox-only.response.json` | `403 permission_denied`, `details.reason: sandbox_only` |
