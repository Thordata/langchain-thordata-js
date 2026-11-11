"use strict";

class ThorDataError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = new.target.name;
  }
}

module.exports = { ThorDataError };
