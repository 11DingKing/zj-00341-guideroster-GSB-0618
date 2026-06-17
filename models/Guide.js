const { makeModel, Op } = require('./dbHelper');

const Guide = makeModel('guides', 'id', ['languages', 'themes']);

module.exports = { Guide, Op };
