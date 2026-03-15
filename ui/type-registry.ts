window.SpliceRack = window.SpliceRack || {};
window.SpliceRack.types = {};

window.SpliceRack.registerType = function (name, definition) {
  SpliceRack.types[name] = definition;
};
