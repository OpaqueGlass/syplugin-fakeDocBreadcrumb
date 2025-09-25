// utils.js

// 下面这个typedf更重要
/**
 * @typedef {object} Utils
 * @property {function(number, number): number} add - Adds two numbers.
 * @property {number} PI - The value of Pi.
 */

// /** @type {Utils} */
const utils = {
  /**
   * Adds two numbers.
   * @param {number} a The first number.
   * @param {number} b The second number.
   * @returns {number} The sum of the two numbers.
   */
  add: (a, b) => a + b,
  PI: 3.14159,
};

module.exports = utils;