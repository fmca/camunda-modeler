'use strict';

var inherits = require('inherits');

var assign = require('lodash/object/assign');

var BpmnEditor = require('../../editor/bpmn-editor'),
    XMLEditor = require('../../editor/xml-editor'),
    PRISMEditor = require('../../editor/prism-editor'),
    MultiEditorTab = require('../multi-editor-tab');

var ensureOpts = require('util/ensure-opts');


/**
 * A tab displaying a BPMN diagram.
 *
 * @param {Object} options
 */
function BpmnTab(options) {

  if (!(this instanceof BpmnTab)) {
    return new BpmnTab(options);
  }

  ensureOpts([
    'metaData',
    'plugins'
  ], options);

  options = assign({
    editorDefinitions: [
      { id: 'diagram', label: 'Diagram', component: BpmnEditor },
      { id: 'xml', label: 'XML', isFallback: true, component: XMLEditor },
      { id: 'prism', label: 'PRISM', isFallback: true, component: PRISMEditor }
    ]
  }, options);

  MultiEditorTab.call(this, options);
}

inherits(BpmnTab, MultiEditorTab);

module.exports = BpmnTab;
