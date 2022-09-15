/**
 * Copyright 2013,2022 IBM Corp.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
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
  const SERVICE_IDENTIFIER = 'tone-analyzer',
    ToneAnalyzerV3 = require('ibm-watson/tone-analyzer/v3'),
    { IamAuthenticator } = require('ibm-watson/auth');

  var pkg = require('../../package.json'),
    serviceutils = require('../../utilities/service-utils'),
    payloadutils = require('../../utilities/payload-utils'),
    toneutils = require('../../utilities/tone-utils'),
    apikey = '', sApikey = '',
    endpoint = '',
    sEndpoint = 'https://gateway.watsonplatform.net/tone-analyzer/api',
    service = null;

  service = serviceutils.getServiceCreds(SERVICE_IDENTIFIER);

  if (service) {
    sApikey = service.apikey ? service.apikey : '';
    sEndpoint = service.url;
  }

  // Node RED Admin - fetch and set vcap services
  RED.httpAdmin.get('/watson-tone-analyzer/vcap', function (req, res) {
    res.json(service ? {bound_service: true} : null);
  });


  // Check that the credentials have been provided
  // Credentials are needed for each the service.
  var checkCreds = function(credentials) {
    var taSettings = {};

    apikey = sApikey || credentials.apikey;

    if (apikey) {
      taSettings.iam_apikey = apikey;
    } else {
      taSettings = null;
    }

    return taSettings;
  }


  // Function that checks the configuration to make sure that credentials,
  // payload and options have been provied in the correct format.
  var checkConfiguration = function(msg, node) {
    var message = null,
      taSettings = null;

    taSettings = checkCreds(node.credentials);

    if (!taSettings) {
      message = 'Missing Tone Analyzer service credentials';
    } else if (msg.payload) {
      message = toneutils.checkPayload(msg.payload);
    } else  {
      message = 'Missing property: msg.payload';
    }

    if (message) {
      return Promise.reject(message);
    } else {
      return Promise.resolve(taSettings);
    }
  };


  function invokeService(config, options, settings) {
    let authSettings  = {};

    let serviceSettings = {
      version: '2017-09-21',
      headers: {
        'User-Agent': pkg.name + '-' + pkg.version
      }
    };

    if (settings.iam_apikey) {
      authSettings.apikey = settings.iam_apikey;
    }

    serviceSettings.authenticator = new IamAuthenticator(authSettings);

    endpoint = sEndpoint;
    if (config['service-endpoint']) {
      endpoint = config['service-endpoint'];
    }

    if (endpoint) {
      serviceSettings.url = endpoint;
    }

    if (config['interface-version']) {
      serviceSettings.version = config['interface-version'];
    }

    const tone_analyzer = new ToneAnalyzerV3(serviceSettings);

    var p = new Promise(function resolver(resolve, reject){
      var m = 'tone';
      switch (config['tone-method']) {
      case 'generalTone' :
        break;
      case 'customerEngagementTone' :
        m = 'toneChat';
        break;
      }

      tone_analyzer[m](options)
        .then((response) => {
          resolve(response);
        })
        .catch((err) => {
          reject(err);
        })
    });

    return p;
  }

  // function when the node recieves input inside a flow.
  // Configuration is first checked before the service is invoked.
  var processOnInput = function(msg, send, done, config, node) {
    checkConfiguration(msg, node)
      .then(function(settings) {
        var options = toneutils.parseOptions(msg, config);
        options = toneutils.parseLanguage(msg, config, options);
        node.status({fill:'blue', shape:'dot', text:'requesting'});
        return invokeService(config, options, settings);
      })
      .then(function(data){
        node.status({})
        if (data && data.result) {
          msg.response = data.result;
        } else {
          msg.response = data;
        }
        send(msg);
        node.status({});
        done();
      })
      .catch(function(err){
        payloadutils.reportError(node,msg,err);
        send(msg);
        done(err);
      });
  }


  // This is the Tone Analyzer Node.
  function Node (config) {
    RED.nodes.createNode(this, config);
    var node = this;

    // Invoked when the node has received an input as part of a flow.
    this.on('input', function(msg, send, done) {
      processOnInput(msg, send, done, config, node);
    });
  }

  RED.nodes.registerType('watson-tone-analyzer-v3', Node, {
    credentials: {
      apikey: {type:'password'}
    }
  });
};
