var inherits = require('inherits'),
domify = require('domify'),
parseString = require('xml2js').parseString,
JSPath = require('jspath');

var BaseEditor = require('./base-editor');
var debug = require('debug')('prism-editor');
/**
 * A prism editor
 *
 * @param {Object} options
 */
function PRISMEditor(options) {
    BaseEditor.call(this, options);
}
    
inherits(PRISMEditor, BaseEditor);

module.exports = PRISMEditor;


PRISMEditor.prototype.render = function() {

  return (
    <div className="prism-editor" key={ this.id + '#prism' }>
      <div className="editor-container"
           tabIndex="0"
           onAppend={ this.compose('mountEditor') }
           onRemove={ this.compose('unmountEditor') }>
      </div>
      <span className="formula-group">
        <input type="text" className="formula-input" placeholder="Formula" />
        <button className="formula-button">Check</button>
      </span>
    </div>
  );
};

PRISMEditor.prototype.updateState = function() {

};


PRISMEditor.prototype.update = function() {
    
      // only do actual work if mounted
      if (!this.mounted) {
        debug('[#update] skipping (not mounted)');
    
        return;
      }
    
      var newXML = this.newXML, lastXML = this.lastXML;
    
      // reimport in XML change
      if (!newXML || lastXML === newXML) {
        debug('[#update] skipping (no change)');
    
        this.emit('updated', {});
    
        return;
      }

      this.lastXML = newXML;

      console.log(newXML)
      this.getParser().parse(newXML)
    
      this.emit('updated', {});
    };


PRISMEditor.prototype.triggerAction = function(action, options) {

};


PRISMEditor.prototype.saveXML = function(done) {


  done(null, '');
};


PRISMEditor.prototype.destroy = function() {

};

PRISMEditor.prototype.getParser = function () {
    return {
        parse: function (str) {
            parseString(str, function (err, result) {
                var tasks = JSPath.apply('.."bpmn:task"', result)
                var startEvents = JSPath.apply('.."bpmn:startEvent"', result)
                var endEvents = JSPath.apply('.."bpmn:endEvent"', result)
                console.log(tasks, startEvents, endEvents)
            })
        }
    }
}
