# Security Policy

## Reporting a vulnerability

Please do not open a public issue for a security problem. Email **hello@rheon.io** with:

- what the problem is and what it lets an attacker do,
- how to reproduce it,
- the package version.

We confirm receipt within 3 working days and agree a fix and disclosure date with you. Please give us reasonable time to ship a fix before disclosing it.

## Scope

This policy covers this package: quotes, native Apple Pay payments and reading transaction status through Rheon's partner API. The module holds no secret by design: your Rheon API key belongs on your backend, behind the `request` callback, and the Apple Pay token is passed to Rheon once and kept nowhere. Report problems in `@tetherto/wdk-wallet` or other WDK packages to their maintainers.
