let counter = 0;

function generateId() {
  return 'p_' + Date.now().toString(36) + '_' + (counter++).toString(36);
}

module.exports = { generateId };
