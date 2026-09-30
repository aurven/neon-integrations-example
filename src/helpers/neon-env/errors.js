'use strict';

class NoNeonEnvError extends Error {
  constructor(validIds = []) {
    super(
      'No Neon environment selected for this request. Use an environment-bound apikey, ' +
      `or the admin apikey with ?env=<id>${validIds.length ? ` (valid: ${validIds.join(', ')})` : ''}`
    );
    this.name = 'NoNeonEnvError';
    this.statusCode = 400;
  }
}

class NeonEnvConfigError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.name = 'NeonEnvConfigError';
    this.statusCode = statusCode;
  }
}

class RegistryFormatError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RegistryFormatError';
  }
}

module.exports = { NoNeonEnvError, NeonEnvConfigError, RegistryFormatError };
