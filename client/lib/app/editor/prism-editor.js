var inherits = require('inherits'),
domify = require('domify'),
parseString = require('xml2js').parseString,
JSPath = require('jspath'),
nunjuncks = require('nunjucks'),
fs = require('fs'),
exec = require('child_process').exec;

var BaseEditor = require('./base-editor');
var debug = require('debug')('prism-editor');

var _code, _formula, _formulaBtn;
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
      console.log('the new xml', newXML)
      this.getParser().parse(newXML)
    
      this.emit('updated', newXML);
    };


PRISMEditor.prototype.triggerAction = function(action, options) {

};


PRISMEditor.prototype.saveXML = function(done) {


  done(null, '');
};


PRISMEditor.prototype.destroy = function() {
  
};

PRISMEditor.prototype.getParser = function () {
  var self = this;
    return {
        parse: function (str) {
            parseString(str, function (err, result) {
                console.log('parsed', err, result)
                var tasks = JSPath.apply('.."bpmn:task"', result)
                var startEvents = JSPath.apply('.."bpmn:startEvent"', result)
                var endEvents = JSPath.apply('.."bpmn:endEvent"', result)
                var states = tasks.concat(startEvents).concat(endEvents)
                var transitions = JSPath.apply('.."bpmn:sequenceFlow"', result)
                var defaultRate = "1"
                transitions.forEach(function(element) {
                  var rate = defaultRate
                  var customRates = JSPath.apply('.."camunda:property"{.."name"==="prism:rate"}', element)
                  if (customRates.length) {
                    rate = customRates[0].$.value
                  }
                  element.rate = rate
                }, this);
                var renderedTemplate = self.renderTemplate(states, transitions)
                self.getCodeElement().innerText = renderedTemplate                
            })
        }
    }
}


PRISMEditor.prototype.renderTemplate = function (states, transitions) {
  var template = `
  ctmc
  
  {% for state in states %}
  const int {{state.$.id}} = {{loop.index - 1}};
  {%- endfor %}

  module bpmn

      state: [0..{{ states.length - 1}}] init 0;

      {% for transition in transitions %}
      [] state={{transition.$.sourceRef}} -> {{transition.rate}}:(state'={{transition.$.targetRef}});
      {%- endfor %}
  
  endmodule
  `
  return nunjuncks.renderString(template, { states, transitions })

}

PRISMEditor.prototype.getCodeElement = function () {
  var self = this
  if (_code) {
    return _code
  }

  _formula = domify('<input type="text" placeholder="Formula" />')
  _formulaBtn = domify('<button className="formula-button">Check</button>')
  _formulaBtn.onclick = function () {
    console.log('formula', _formula.value)
    self.checkProperty(_code.innerText, _formula.value)
  }
  _code = domify('<pre><code></code></pre>');
  this.$el.appendChild(_formula)
  this.$el.appendChild(_formulaBtn)
  this.$el.appendChild(_code)

  return _code
}

PRISMEditor.prototype.checkProperty = function (prismModel, prismProperty) {
  var filename = '/tmp/prismmodel.prism'
  fs.writeFile(filename, prismModel , function(err) {
      if(err) {
          return console.log(err);
      }

      exec(`prism ${filename} -pf '${prismProperty}'`, (err, stdout, stderr) => {
        if (err) {
          console.log(err)
          return;
        }
      
        // the *entire* stdout and stderr (buffered)
        console.log(`stdout: ${stdout}`);
        console.log(`stderr: ${stderr}`);
      });

  }); 
}