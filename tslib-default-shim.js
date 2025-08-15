// tslib-default-shim.js
const tslib = require('tslib');
// вернём всё как есть + подложим default
module.exports = Object.assign({}, tslib, { default: tslib });