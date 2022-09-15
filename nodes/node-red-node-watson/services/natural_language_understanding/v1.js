/**
 * Copyright 2017, 2022 IBM Corp.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

module.exports = function (RED) {
  const SERVICE_IDENTIFIER = 'natural-language-understanding',
    NaturalLanguageUnderstandingV1 = require('ibm-watson/natural-language-understanding/v1'),
    { IamAuthenticator } = require('ibm-watson/auth');

  const NLU_FEATURES = {
    'categories': 'categories',
    'classifications': 'classifications',
    'concepts': 'concepts',
    'doc-emotion': 'emotion',
    'doc-sentiment': 'sentiment',
    'entity': 'entities',
    'keyword': 'keywords',
    'metadata': 'metadata',
    'relation': 'relations',
    'semantic': 'semantic_roles',
    'syntax': 'syntax'
  };

  var pkg = require('../../package.json'),
    payloadutils = require('../../utilities/payload-utils'),
    serviceutils = require('../../utilities/service-utils'),
    service = serviceutils.getServiceCreds(SERVICE_IDENTIFIER),
    apikey = null,
    sApikey = null,
    endpoint = '',
    sEndpoint = 'https://gateway.watsonplatform.net/natural-language-understanding/api';


  function initialCheck(k) {
    if (!k) {
      return Promise.reject('Missing Watson Natural Language Understanding service credentials');
    }
    return Promise.resolve();
  }

  function payloadCheck(msg, options) {
    var message = '';
    if (!msg.payload) {
      message = 'Missing property: msg.payload';
    } else if (payloadutils.urlCheck(msg.payload)) {
      options['url'] = msg.payload;
    } else {
      options['text'] = msg.payload;
    }
    if (message) {
      return Promise.reject(message);
    }
    return Promise.resolve();
  }


  function checkAdditonalMsgOptions(msg, options) {
    if (msg.nlu_options && msg.nlu_options.language) {
      options['language'] = msg.nlu_options.language;
    }
    return Promise.resolve();
  }

  function checkNonFeatureOptions(config, options) {
    var limitCharacters = parseInt(config.limittextcharacters);

    if (! isNaN(limitCharacters) && 0 < limitCharacters) {
      options.limitTextCharacters = limitCharacters;
    }

    return Promise.resolve();
  }


  function checkFeatureRequest(config, options) {
    var message = '',
      enabled_features = null;

    enabled_features = Object.keys(NLU_FEATURES).filter(function (feature) {
      return config[feature];
    });

    if (!enabled_features.length) {
      message = 'Node must have at least one selected feature.';
    } else {
      options.features = {};
      for (var f in enabled_features) {
        options.features[NLU_FEATURES[enabled_features[f]]] = {};
      }
    }
    if (message) {
      return Promise.reject(message);
    }
    return Promise.resolve();
  }

  function processConceptsOptions(config, features) {
    if (features.concepts) {
      features.concepts.limit =
         config['maxconcepts'] ? parseInt(config['maxconcepts']) : 8;
    }
  }



  function processClassificationsOptions(msg, config, features) {
    if (features.classifications) {
      if (msg.nlu_options && msg.nlu_options.classifications_model) {
        features.classifications.model = msg.nlu_options.classifications_model;
      } else if (config['classifications-model']) {
        features.classifications.model = config['classifications-model'] ;
      }
    }
  }

  function processCategoriesOptions(config, features) {
    if (features.categories) {
      features.categories.limit =
         config['limitcategories'] ? parseInt(config['limitcategories']) : 3;
    }
  }

  function processEmotionOptions(config, features) {
    if (features.emotion && config['doc-emotion-target']) {
      features.emotion.targets = config['doc-emotion-target'].split(',');
    }
  }

  function processSentimentOptions(config, features) {
    if (features.sentiment && config['doc-sentiment-target']) {
      features.sentiment.targets = config['doc-sentiment-target'].split(',');
    }
  }

  function processEntitiesOptions(msg, config, features) {
    if (features.entities) {
      features.entities.emotion =
          config['entity-emotion'] ? config['entity-emotion'] : false;
      features.entities.sentiment =
         config['entity-sentiment'] ? config['entity-sentiment'] : false;
      if (config['maxentities']) {
        features.entities.limit = parseInt(config['maxentities']);
      }
      if (msg.nlu_options && msg.nlu_options.entity_model) {
        features.entities.model = msg.nlu_options.entity_model;
      }
    }
  }

  function processSyntaxOptions(msg, config, features) {
    if (features.syntax) {
      features.syntax.sentences =
          config['syntax-sentences'] ? config['syntax-sentences'] : false;
      if (config['syntax-tokens-lemma'] || config['syntax-tokens-pos']) {
        features.syntax.tokens = {};
        features.syntax.tokens.lemma =
           config['syntax-tokens-lemma'] ? config['syntax-tokens-lemma'] : false;
        features.syntax.tokens.part_of_speech =
              config['syntax-tokens-pos'] ? config['syntax-tokens-pos'] : false;
      }
    }
  }

  function processRelationsOptions(msg, config, features) {
    if (features.relations) {
      if (msg.nlu_options && msg.nlu_options.relations_model) {
        features.relations.model = msg.nlu_options.relations_model;
      }
    }
  }

  function processKeywordsOptions(config, features) {
    if (features.keywords) {
      features.keywords.emotion =
          config['keyword-emotion'] ? config['keyword-emotion'] : false;
      features.keywords.sentiment =
         config['keyword-sentiment'] ? config['keyword-sentiment'] : false;
      if (config['maxkeywords']) {
        features.keywords.limit = parseInt(config['maxkeywords']);
      }
    }
  }

  function processSemanticRolesOptions(config, features) {
    if (features.semantic_roles) {
      features.semantic_roles.entities =
        config['semantic-entities'] ? config['semantic-entities'] : false;
      features.semantic_roles.keywords =
        config['semantic-keywords'] ? config['semantic-keywords'] : false;
      if (config['maxsemantics']) {
        features.semantic_roles.limit = parseInt(config['maxsemantics']);
      }
    }
  }

  function checkFeatureOptions(msg, config, options) {
    if (options && options.features) {
      processConceptsOptions(config, options.features);
      processClassificationsOptions(msg, config, options.features);
      processCategoriesOptions(config, options.features);
      processEmotionOptions(config, options.features);
      processSentimentOptions(config, options.features);
      processEntitiesOptions(msg, config, options.features);
      processRelationsOptions(msg, config, options.features);
      processKeywordsOptions(config, options.features);
      processSemanticRolesOptions(config, options.features);
      processSyntaxOptions(msg, config, options.features);
    }
    return Promise.resolve();
  }

  function invokeService(options) {
    let nlu = null,
      authSettings  = {};
      serviceSettings = {
        version: '2021-08-01',
        headers: {
          'User-Agent': pkg.name + '-' + pkg.version
        }
      };

    if (apikey) {
      authSettings.apikey = apikey;
    }
    serviceSettings.authenticator = new IamAuthenticator(authSettings);

    if (endpoint) {
      serviceSettings.url = endpoint;
    }

    nlu = new NaturalLanguageUnderstandingV1(serviceSettings);

    var p = new Promise(function resolver(resolve, reject) {
      nlu.analyze(options)
        .then((response) => {
          resolve(response);
        })
        .catch((err) => {
          reject(err);
        });
    });
    return p;
  }

  if (service) {
    sApikey = service.apikey ? service.apikey : '';
    sEndpoint = service.url;
  }

  RED.httpAdmin.get('/natural-language-understanding/vcap', function (req, res) {
    res.json(service ? {bound_service: true} : null);
  });


  // This is the Natural Language Understanding Node

  function NLUNode (config) {
    RED.nodes.createNode(this, config);
    var node = this;

    this.on('input', function(msg, send, done) {
      var message = '',
        options = {};

      node.status({});

      apikey = sApikey || this.credentials.apikey;

      endpoint = sEndpoint;
      if (config['service-endpoint']) {
        endpoint = config['service-endpoint'];
      }

      initialCheck(apikey)
        .then(function(){
          return payloadCheck(msg, options);
        })
        .then(function(){
          return checkAdditonalMsgOptions(msg, options);
        })
        .then(function(){
          return checkFeatureRequest(config, options);
        })
        .then(function(){
          return checkFeatureOptions(msg, config, options);
        })
        .then(function(){
          return checkNonFeatureOptions(config, options);
        })
        .then(function(){
          node.status({fill:'blue', shape:'dot', text:'requesting'});
          return invokeService(options);
        })
        .then(function(data){
          msg.features = data;
          if (data && data.result) {
            msg.features = data.result;
          }
          send(msg);
          node.status({});
          done();
        })
        .catch(function(err){
          let errMsg = payloadutils.reportError(node, msg, err);
          done(errMsg);
        });

    });
  }

  //Register the node as natural-language-understanding to nodeRED
  RED.nodes.registerType('natural-language-understanding', NLUNode, {
    credentials: {
      apikey: {type: 'password'}
    }
  });
};
