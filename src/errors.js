// Copyright 2026 Rheon. Evaluation use only: see LICENSE.

'use strict'

import { WdkError } from '@tetherto/wdk-wallet'

/**
 * @typedef {Object} RheonRetry
 * @property {boolean} safe - Whether the same request may be sent again.
 * @property {number | null} afterMs - How long to wait before sending it again, in milliseconds, or null.
 * @property {string} action - What to do next: 'replay', 'create_new_quote', 'fix_request', 'use_existing', 'backoff' or 'none'.
 */

/**
 * @typedef {Object} RheonApiErrorOptions
 * @property {number} status - The HTTP status code of Rheon's answer.
 * @property {string | null} code - Rheon's error code (e.g., 'quote_expired', 'identity_required'), or null when the answer carries none.
 * @property {Record<string, unknown> | null} details - Rheon's error details (e.g., `{ reason: 'not_available_for_user' }`), or null.
 * @property {RheonRetry | null} retry - Rheon's advice on retrying, or null.
 * @property {string | null} requestId - Rheon's id of the request, for Rheon support, or null.
 */

/**
 * A refusal from Rheon's API, or an answer from it that the module cannot use.
 */
export class RheonApiError extends WdkError {
  /**
   * Creates a new Rheon API error.
   *
   * @param {string} message - The error's message.
   * @param {RheonApiErrorOptions & ErrorOptions} options - The error's options.
   */
  constructor (message, options) {
    super(message, options)

    this.name = 'RheonApiError'

    /**
     * The HTTP status code of Rheon's answer.
     *
     * @type {number}
     */
    this.status = options.status

    /**
     * Rheon's error code (e.g., 'quote_expired', 'identity_required'), or null when the answer carries none.
     *
     * @type {string | null}
     */
    this.code = options.code

    /**
     * Rheon's error details (e.g., `{ reason: 'not_available_for_user' }`), or null.
     *
     * @type {Record<string, unknown> | null}
     */
    this.details = options.details

    /**
     * Rheon's advice on retrying, or null.
     *
     * @type {RheonRetry | null}
     */
    this.retry = options.retry

    /**
     * Rheon's id of the request, for Rheon support, or null.
     *
     * @type {string | null}
     */
    this.requestId = options.requestId
  }
}

/**
 * A protocol configuration that lacks a value the called method needs, or that the module cannot use.
 */
export class RheonConfigurationError extends WdkError {
  /**
   * Creates a new Rheon configuration error.
   *
   * @param {string} message - The error's message.
   */
  constructor (message) {
    super(message)

    this.name = 'RheonConfigurationError'
  }
}

/**
 * A result of the `request` backend callback that the module cannot use.
 */
export class RheonCallbackError extends WdkError {
  /**
   * Creates a new Rheon callback error.
   *
   * @param {string} message - The error's message.
   */
  constructor (message) {
    super(message)

    this.name = 'RheonCallbackError'
  }
}
