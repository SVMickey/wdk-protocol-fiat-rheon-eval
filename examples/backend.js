// Copyright 2026 Rheon. Evaluation use only: see LICENSE.

// A minimal backend for the module's `request` callback, with Node.js only (no dependencies):
//
//   POST /rheon   { "method", "path", "headers", "body" }  ->  { "status", "body" }
//
// It holds your Rheon API key, which the wallet must never see, and forwards only the calls the module makes.
// Run it with: node --env-file=.env examples/backend.js
//
// A local sandbox demo only. It has no user authentication, so it listens on 127.0.0.1 (HOST) and refuses
// Rheon's production host. A real backend authenticates its users, and only forwards quotes and customers whose
// `externalId` and `email` belong to the signed-in user, and only transactions that user made. This example
// does neither: do not expose it to a network.

'use strict'

import { createServer, request as httpRequest } from 'http'
import { request as httpsRequest } from 'https'

const { RHEON_API_KEY, PORT = '8787', HOST = '127.0.0.1' } = process.env

// A sandbox key (rk_test_...) works on the sandbox host only, a production key on the production host only.
const RHEON_API_BASE = process.env.RHEON_API_BASE ?? 'https://api.sandbox.rheon.io'

const ID = '[A-Za-z0-9_-]+'

/** The calls the module makes, and nothing else. */
const ALLOWED = [
  ['GET', /^\/v1\/config$/],
  ['POST', /^\/v1\/estimate$/],
  ['POST', /^\/v1\/quote$/],
  ['POST', /^\/v1\/customers$/],
  ['POST', /^\/v1\/widget\/sessions$/],
  ['GET', /^\/v1\/widget\/orders\?externalOrderId=(?:[A-Za-z0-9_.!~*'()-]|%[0-9A-Fa-f]{2})+$/],
  ['POST', /^\/v1\/transactions$/],
  ['POST', new RegExp(`^/v1/transactions/${ID}/apple-pay$`)],
  ['GET', new RegExp(`^/v1/transactions/${ID}$`)],
  // Sandbox only: Rheon refuses it on a production key.
  ['POST', new RegExp(`^/v1/transactions/${ID}/simulate-checkout$`)]
]

/**
 * The public IP of the user calling this backend. Behind a proxy, read it from the proxy's header instead.
 * A loopback address (local testing) gives null: the IP the wallet sent is then kept.
 *
 * @param {import('http').IncomingMessage} request - The user's request.
 * @returns {string | null} The IP, or null.
 */
function userIpOf (request) {
  const ip = request.socket.remoteAddress?.replace(/^::ffff:/, '')

  return ip === undefined || ip === '127.0.0.1' || ip === '::1' ? null : ip
}

/**
 * Forwards one call of the module to Rheon with the API key.
 *
 * @param {{ method: string, path: string, headers?: Record<string, string>, body?: Record<string, unknown> }} call - The module's call.
 * @param {string | null} userIp - The user's IP as this backend sees it.
 * @returns {Promise<{ status: number, body: unknown }>} Rheon's status and JSON body.
 */
export async function forward ({ method, path, headers = {}, body }, userIp) {
  if (!ALLOWED.some(([allowedMethod, pattern]) => allowedMethod === method && pattern.test(path))) {
    return { status: 403, body: { error: { code: 'not_forwarded', message: `${method} ${path} is not forwarded` } } }
  }

  const outgoing = { accept: 'application/json', authorization: `Bearer ${RHEON_API_KEY}` }

  if (method === 'POST') {
    outgoing['content-type'] = 'application/json'
    outgoing['idempotency-key'] = String(headers['Idempotency-Key'] ?? '')

    // Rheon compares the quote's IP with the payment's: send the IP this backend sees, not one the app claims.
    if (userIp && body && typeof body.userIp === 'string') body = { ...body, userIp }
  }

  // Node fetch adds Sec-Fetch-Mode automatically. Widget partner endpoints deliberately refuse
  // every Sec-Fetch-* header, so use the server HTTP client without browser fetch metadata.
  const url = new URL(path, RHEON_API_BASE)
  return new Promise((resolve, reject) => {
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest
    const request = send(url, { method, headers: outgoing }, response => {
      let text = ''
      response.setEncoding('utf8')
      response.on('data', chunk => { text += chunk })
      response.on('error', reject)
      response.on('end', () => {
        try { resolve({ status: response.statusCode, body: text ? JSON.parse(text) : null }) } catch (error) { reject(error) }
      })
    })
    request.on('error', reject)
    request.setTimeout(30_000, () => request.destroy(new Error('Rheon request timed out; retry with the same idempotency key')))
    request.end(method === 'POST' ? JSON.stringify(body ?? {}) : undefined)
  })
}

async function readJson (request) {
  let body = ''

  for await (const chunk of request) {
    body += chunk
  }

  return JSON.parse(body)
}

function send (response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!RHEON_API_KEY) throw new Error('Set RHEON_API_KEY in .env')
  if (new URL(RHEON_API_BASE).hostname === 'api.rheon.io') {
    throw new Error('This example has no user authentication and forwards to the sandbox only: use a sandbox key with https://api.sandbox.rheon.io')
  }

  const server = createServer(async (request, response) => {
    try {
      if (request.method === 'POST' && request.url === '/rheon') {
        return send(response, 200, await forward(await readJson(request), userIpOf(request)))
      }

      send(response, 404, { error: 'not found' })
    } catch (error) {
      send(response, 502, { error: error.message })
    }
  })

  server.listen(Number(PORT), HOST, () => console.log(`Rheon example backend on http://${HOST}:${server.address().port} (local only, no user authentication), forwarding to ${RHEON_API_BASE}`))
}
