/**
 * Copyright 2015, 2022 IBM Corp.
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

module.exports = function(RED) {
  const SERVICE_IDENTIFIER = 'text-to-speech';

  var pkg = require('../../package.json'),
    serviceutils = require('../../utilities/service-utils'),
    payloadutils = require('../../utilities/payload-utils'),
    ttsutils = require('./tts-utils'),
    endpoint = '',
    sEndpoint = 'https://stream.watsonplatform.net/text-to-speech/api',
    apikey = '', sApikey = '';


  var service = serviceutils.getServiceCreds(SERVICE_IDENTIFIER);

  if (service) {
    sApikey = service.apikey ? service.apikey : '';
    sEndpoint = service.url;
  }

  // Node RED Admin - fetch and set vcap services
  RED.httpAdmin.get('/watson-text-to-speech/vcap', function(req, res) {
    res.json(service ? {bound_service: true} : null);
  });


  // API used by widget to fetch available models
  RED.httpAdmin.get('/watson-text-to-speech/voices', function (req, res) {
    var tts = ttsutils.initTTSService(req, sApikey, sEndpoint);

    tts.listVoices({})
      .then((response) => {
        let voices = response;
        if (response.result) {
          voices = response.result;
        }
        res.json(voices);
      })
      .catch((err) => {
        if (!err.error) {
          err.error = 'Error ' + err.code + ' in fetching voices';
        }
        res.json(err);
      });
  });

  // API used by widget to fetch available customisations
  RED.httpAdmin.get('/watson-text-to-speech/customs', function (req, res) {
    var tts = ttsutils.initTTSService(req, sApikey, sEndpoint);

    tts.listCustomModels({})
    .then((response) => {
      let customs = response;
      if (response.result) {
        customs = response.result;
      }
      res.json(customs);
    })
    .catch((err) => {
      res.json(err);
    });
  });

  function Node(config) {
    RED.nodes.createNode(this, config);
    var node = this;

    function initialCheck(apikey) {
      if (!apikey) {
        return Promise.reject('Missing Text To Speech service credentials');
      }
      return Promise.resolve();
    }

    function payloadCheck(msg) {
      if (!msg.payload) {
        return Promise.reject('Missing property: msg.payload');
      }
      return Promise.resolve();
    }

    function buildParams(msg) {
      var params = {
        text: msg.payload,
        voice: msg.voice || config.voice,
        accept: config.format
      };

      // Check the params for customisation options
      if (config.langcustom && 'NoCustomisationSetting' !== config.langcustom) {
        params.customizationId = config.langcustom;
      }
      return Promise.resolve(params);
    }

    function performTTS(msg, params) {
      var p = new Promise(function resolver(resolve, reject) {
        let tts = ttsutils.buildStdSettings(apikey, endpoint);

        tts.synthesize(params)
          .then((body) => {
            resolve(body);
          })
          .catch((err) => {
            reject(err);
          });

      });
      return p;
    }

    function processResponse(msg, data) {
      return new Promise(function resolver(resolve, reject) {
        let body = data
        if (data && data.result) {
          body = data.result;
        }

        let tmpHolder = msg.payload;
        msg.payload = body;

        payloadutils.checkForStream(msg)
          .then(() => {
            if (! config['payload-response']) {
              msg.speech = msg.payload;
              msg.payload = tmpHolder;
            }
            resolve();
          })
          .catch((err) => {
            reject(err);
          });
      });
    }

    this.on('input', function(msg, send, done) {
      apikey = sApikey || this.credentials.apikey || config.apikey;

      endpoint = sEndpoint;
      if (config['service-endpoint']) {
        endpoint = config['service-endpoint'];
      }

      node.status({});

      initialCheck(apikey)
      .then(function(){
        return payloadCheck(msg);
      })
      .then(function(){
        return buildParams(msg);
      })
      .then(function(params){
        node.status({fill:"blue", shape:"dot", text:"requesting"});
        return performTTS(msg, params);
      })
      .then(function(body){
        return processResponse(msg, body);
      })
      .then(function(){
        node.status({});
        send(msg);
        done();
      })
      .catch(function(err){
        payloadutils.reportError(node,msg,err);
        done(err);
      });
    })
  }
  RED.nodes.registerType('watson-text-to-speech', Node, {
    credentials: {
      apikey: {type:'password'}
    }
  });
};
