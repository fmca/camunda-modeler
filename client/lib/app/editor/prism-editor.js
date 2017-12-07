var inherits = require('inherits'),
domify = require('domify'),
parseString = require('xml2js').parseString,
JSPath = require('jspath'),
nunjuncks = require('nunjucks'),
fs = require('fs'),
exec = require('child_process').exec;

var BaseEditor = require('./base-editor');
var debug = require('debug')('prism-editor');

var _code, _formula, _formulaBtn, _errorDiv, _resultDiv;
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
  var self = this;
    return {
        parse: function (str) {
            parseString(str, function (err, result) {
                console.log('parsed', err, result)
                var defaultModelType = 'dtmc'
                var modelType = JSPath.apply('.."camunda:property"{.."name"==="prism:model:type"}', result)
                var process = JSPath.apply('.."bpmn:process"', result)[0]
                modelType = (modelType.length ? modelType[0].$.value : defaultModelType);
                var tasks = JSPath.apply('.."bpmn:task"', result)
                var exclusiveGateways = JSPath.apply('.."bpmn:exclusiveGateway"', result)
                var startEvents = JSPath.apply('.."bpmn:startEvent"', result)
                var endEvents = JSPath.apply('.."bpmn:endEvent"', result)
                var states = startEvents.concat(exclusiveGateways).concat(tasks).concat(endEvents)
                var transitions = JSPath.apply('.."bpmn:sequenceFlow"', result)
                var rewards = [... (new Set(JSPath.apply('.."camunda:property"{.."name"==="prism:reward:name"}', result).map(r => r.$.value)))]
                console.log('rewards', rewards)
                transitions.forEach(function(element) {
                  setRate(element)                  
                }, this);
                states.forEach(function(element) {
                  setRewards(element)
                })
                var renderedTemplate = self.renderTemplate(process, modelType, states, transitions, rewards)
                self.getCodeElement().innerText = renderedTemplate                
            })
        }
    }
}

var setRate = function(transition, model) {
  var rate = undefined
  var customRates =
    JSPath.apply('.."camunda:property"{.."name"==="prism:rate"}', transition)
  if (customRates.length) {
    rate = customRates[0].$.value
  }
  transition.rate = rate
}

var setRewards = function (state) {
  var reward = undefined
  var customRewardNames =
    JSPath.apply('.."camunda:property"{.."name"==="prism:reward:name"}', state)
  var customRewardValues =
    JSPath.apply('.."camunda:property"{.."name"==="prism:reward:value"}', state)

  if (customRewardNames.length) {
    reward = {
      name: customRewardNames[0].$.value,
      value: customRewardValues[0].$.value
    }
  }
  console.log(state)
  state.reward = reward
  console.log(state)
}

PRISMEditor.prototype.renderTemplate = function (process, modelType, states, transitions, rewards) {
  var template = `  
  {{modelType}}
  
  {% for state in states %}
  const int {{state.$.id}} = {{loop.index - 1}}; {% if state.$.name %} //{{state.$.name}} {%- endif %}
  {%- endfor %}

  module {{process.$.id}}

      state: [0..{{ states.length - 1}}] init 0;

      {% for transition in transitions %}
      [] state={{transition.$.sourceRef}} -> {% if transition.rate %}{{transition.rate}}:{%- endif %}(state'={{transition.$.targetRef}}); {% if transition.$.name %} //{{transition.$.name}} {%- endif %}
      {%- endfor %}
  
  endmodule

  {% for reward in rewards %}
  rewards "{{reward}}"
    {%- for state in states %}
    {%- if state.reward.name === reward %}
    state = {{state.$.id}} : {{state.reward.value}};
    {%- endif %}
    {%- endfor %}
  endrewards
  {% endfor %}
  `
  return nunjuncks.renderString(template, { process, modelType, states, transitions, rewards })

}

PRISMEditor.prototype.getCodeElement = function () {
  var self = this
  if (_code) {
    return _code
  }

  _formula = domify('<input type="text" class="prism-input" placeholder="Property" />')
  _formulaBtn = domify('<button class="prism-button">Check</button>')
  _formulaBtn.onclick = function () {
    console.log('formula', _formula.value)
    self.checkProperty(_code.innerText, _formula.value)
  }
  _code = domify('<pre><code></code></pre>');
  _errorDiv = domify('<pre class="msg error"></pre>')
  _resultDiv = domify('<pre class="msg"></pre>')
  this.$el.appendChild(_formula)
  this.$el.appendChild(_formulaBtn)
  this.$el.appendChild(_errorDiv)
  this.$el.appendChild(_resultDiv)
  this.$el.appendChild(_code)

  return _code
}

PRISMEditor.prototype.resetMessages = function () {
  _errorDiv.innerText = ''
  _resultDiv.innerText = ''
}

PRISMEditor.prototype.checkProperty = function (prismModel, prismProperty) {
  var filename = '/tmp/prismmodel.prism'
  this.resetMessages()
  fs.writeFile(filename, prismModel , function(err) {
    if(err) {
      _errorDiv.innerText = err
      return console.log(err);
    }

    exec(`prism ${filename} -pf '${prismProperty}'`, (err, stdout, stderr) => {
      if (err) {
        _errorDiv.innerText = err
        console.log(err)
      }
    
      // the *entire* stdout and stderr (buffered)
      _resultDiv.innerText = `${stdout.split('\n').filter(function (str) {
        return str.indexOf('Result') >= 0 || str.indexOf('Error') >= 0;
      })} `
      _errorDiv.innerText += `${stderr}`;
    });


  }); 
}