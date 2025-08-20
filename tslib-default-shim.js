// tslib-default-shim.js
// Берём ESM-версию, где корректные именованные экспорты.
const all = require('tslib/tslib.es6.js');

// Экспортируем и именованные, и default:
module.exports = all;
module.exports.default = all;
