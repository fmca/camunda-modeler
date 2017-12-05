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
                var states = getStates(result)
                var transitions = JSPath.apply('.."bpmn:sequenceFlow"', result)
                var rewards = JSPath.apply('.."camunda:property"{.."name"==="prism:reward:name"}', result)
                console.log('rewards', rewards)
                transitions.forEach(function(element) {
                  setRate(element)
                  checkSync(element, result)            
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

var getStates = function(model) {
  var tasks = JSPath.apply('.."bpmn:task"', model)
  tasks.forEach(e => e.$.tag='task')
  var exclusiveGateways = JSPath.apply('.."bpmn:exclusiveGateway"', model)
  exclusiveGateways.forEach(e => e.$.tag='exclusiveGateway')
  var parallelGateways = JSPath.apply('.."bpmn:parallelGateway"', model)
  parallelGateways.forEach(e => e.$.tag='parallelGateway')
  var startEvents = JSPath.apply('.."bpmn:startEvent"', model)
  startEvents.forEach(e => e.$.tag='startEvent')
  var endEvents = JSPath.apply('.."bpmn:endEvent"', model)
  endEvents.forEach(e => e.$.tag='endEvent')
  var states = startEvents.concat(tasks).concat(exclusiveGateways).concat(parallelGateways).concat(endEvents)
  return states
}

var setRate = function(transition) {
  var rate = undefined
  var customRates =
    JSPath.apply('.."camunda:property"{.."name"==="prism:rate"}', transition)
  if (customRates.length) {
    rate = customRates[0].$.value
  }
  transition.rate = rate
}

var checkSync = function (transition, model) {
  var source = transition.$.sourceRef
  var paralellGateways = JSPath.apply(`.."bpmn:exclusiveGateway"{.."id"==="${source}"}`, model)
  if (paralellGateways.length) {
    transition.syncLabel = `${source}_${transition.$.id}`
  }
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
  state.reward = reward
}

PRISMEditor.prototype.renderTemplate = function (process, modelType, states, transitions, rewards) {
  var template = `  
  {{modelType}}

  {% for state in states %}
  module {{state.$.id}}_module
    {{state.$.id}}: [0..1] init 0;
    {%- set hasIncomingTransition = false %}
    {% for transition in transitions %}
    {%- if transition.$.targetRef === state.$.id %}
    {%- set hasIncomingTransition = true %}
    [{{transition.syncLabel if transition.syncLabel else transition.$.sourceRef}}] {{state.$.id}}=0 -> {% if transition.rate %}{{transition.rate}}:{%- endif %}({{state.$.id}}' = 1);
    {%- if state.$.tag !== 'exclusiveGateway' %}
    [{{state.$.id}}] {{state.$.id}}=1 -> ({{state.$.id}}' = 0);    
    {%- endif %}
    {%- endif %}
    {%- if transition.$.sourceRef === state.$.id and state.$.tag == 'exclusiveGateway' %}
    [{{state.$.id}}_{{transition.$.id}}] {{state.$.id}}=1 -> ({{state.$.id}}' = 0);
    {%- endif %}
    {%- endfor %}
    {%- if not hasIncomingTransition %}
    [{{state.$.id}}] {{state.$.id}}=0 -> ({{state.$.id}}'=1);
    {%- endif %}
  
  endmodule
  {% endfor %}

  {% for reward in rewards %}
  rewards "{{reward.$.value}}"
    {%- for state in states %}
    {%- if state.reward.name === reward.$.value %}
    {{state.$.id}} = 1 : {{state.reward.value}};
    {%- endif %}
    {%- endfor %}
  endrewards
  {% endfor %}

  rewards "tasks"
    {%- for state in states %}
    {%- if state.$.tag === 'task' %}
    {{state.$.id}} = 1 : 1;
    {%- endif %}
    {%- endfor %}
  endrewards

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