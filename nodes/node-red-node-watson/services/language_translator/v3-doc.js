/**
 * Copyright 2018, 2022 IBM Corp.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

module.exports = function (RED) {
  const request = require('request'),
    SERVICE_IDENTIFIER = 'language-translator',
    SERVICE_VERSION = '2018-05-01',
    LanguageTranslatorV3 = require('ibm-watson/language-translator/v3'),
    { IamAuthenticator } = require('ibm-watson/auth');

  var pkg = require('../../package.json'),
    fs = require('fs'),
    fileType = require('file-type'),
    temp = require('temp'),
    serviceutils = require('../../utilities/service-utils'),
    payloadutils = require('../../utilities/payload-utils'),
    translatorutils = require('./translator-utils'),
    apikey = null,
    sApikey = null,
    endpoint = '',
    sEndpoint = 'https://gateway.watsonplatform.net/language-translator/api',
    service = serviceutils.getServiceCreds(SERVICE_IDENTIFIER);

  if (service) {
    sApikey = service.apikey ? service.apikey : '';
    sEndpoint = service.url;
  }

  // Node RED Admin - fetch and set vcap services
  RED.httpAdmin.get('/watson-doc-translator/vcap', function (req, res) {
    res.json(service ? {bound_service: true} : null);
  });


  // API used by widget to fetch available models
  RED.httpAdmin.get('/watson-doc-translator/models', function (req, res) {
    endpoint = req.query.e ? req.query.e : sEndpoint;
    var lt = null,
      authSettings = {},
      serviceSettings = {
        version: SERVICE_VERSION,
        url: endpoint,
        headers: {
          'User-Agent': pkg.name + '-' + pkg.version
        }
      };

    if (sApikey || req.query.key) {
      authSettings.apikey = sApikey ? sApikey : req.query.key;
    }
    serviceSettings.authenticator = new IamAuthenticator(authSettings);

    lt = new LanguageTranslatorV3(serviceSettings);

    lt.listModels({})
      .then((response) => {
        let models = [];
        if (response && response.result && response.result.models) {
          models = response.result;
        }
        res.json(models);
      })
      .catch((err) => {
        res.json(err);
      });
  });

  function Node (config) {
    var node = this;
    RED.nodes.createNode(this, config);

    function payloadCheck(msg, mode) {
      var message = null;
      switch (mode) {
      case 'listDocuments':
      case 'documentStatus':
      case 'deleteDocument':
      case 'getDocument':
      case 'translateSubmittedDocument':
        break;
      case 'translateDocument':
        if (!msg.payload) {
          message = 'Missing property: msg.payload';
        }
        break;
      default:
        message = 'Unexpected Mode';
        break;
      }
      if (message) {
        return Promise.reject(message);
      }
      return Promise.resolve();
    }

    function docID(msg) {
      if (msg.payload && 'string' === typeof msg.payload) {
        return msg.payload;
      }
      if (msg.payload &&
            'object' === typeof msg.payload &&
               msg.payload.document_id) {
        return msg.payload.document_id;
      }
      return config['document-id'];
    }

    function paramCheck(msg, mode) {
      var message = null;
      switch (mode) {
      case 'listDocuments':
      case 'translateDocument':
        break;
      case 'documentStatus':
      case 'deleteDocument':
      case 'getDocument':
      case 'translateSubmittedDocument':
        if (!docID(msg)) {
          message = 'Document ID is required';
        }
        break;
      default:
        break;
      }
      if (message) {
        return Promise.reject(message);
      }
      return Promise.resolve();
    }

    function getService() {
      let authSettings = {},
        serviceSettings = {
          version: '2018-05-01',
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

      return new LanguageTranslatorV3(serviceSettings);
    }


    function buildAuthSettings () {
      var authSettings = {};
      if (apikey) {
        authSettings.user = 'apikey';
        authSettings.pass = apikey;
      }
      return authSettings;
    }

    function executeRequest(uriAddress, method) {
      return new Promise(function resolver(resolve, reject){
        var authSettings = buildAuthSettings();

        request({
          uri: uriAddress,
          method: method,
          auth: authSettings
        }, (error, response, body) => {
          if (error) {
            reject(error);
          } else {
            switch (response.statusCode) {
            case 200:
              let data = null;
              try {
                data = JSON.parse(body);
              } catch(e) {
                data = body;
              }
              resolve(data);
              break;
            case 204:
              resolve(body);
              break;
            case 404:
              reject('Document not found ' + response.statusCode);
              break;
            default:
              reject('Error Invoking API ' + response.statusCode);
              break;
            }
          }
        });

      });
    }

    function executeGetRequest(uriAddress) {
      return executeRequest(uriAddress, 'GET');
    }

    function executeDeleteRequest(uriAddress) {
      return executeRequest(uriAddress, 'DELETE');
    }

    function verifyDocumentPayload (msg) {
      if (!msg.payload) {
        return Promise.reject('Missing property: msg.payload');
      } else if ( (msg.payload instanceof Buffer) ||
          (payloadutils.isJsonObject(msg.payload)) ) {
        return Promise.resolve();
      } else {
        return Promise.reject('msg.payload should be a data buffer or json object');
      }
    }

    function determineSuffix(msg) {
      var ext = '.json';

      if (msg.payload instanceof Buffer) {
        var ft = fileType(msg.payload);

        if (ft && ft.ext) {
          ext = '.' + ft.ext;
        } else {
          // We don't know what file type, so just assume .txt
          ext = '.txt';
        }
      }

      return Promise.resolve(ext);
    }

    function loadFile(suffix) {
      return new Promise(function resolver(resolve, reject){
        var options = {};
        if (suffix) {
          options.suffix = suffix;
        }
        temp.open(options, function(err, info) {
          if (err) {
            reject('Error opening temp file');
          } else {
            resolve(info);
          }
        });
      });
    }

    function syncTheFile(info, msg) {
      return new Promise(function resolver(resolve, reject){
        fs.writeFile(info.path, msg.payload, function(err) {
          if (err) {
            reject('Error processing buffer');
          }
          resolve();
        });
      });
    }

    function createStream(info) {
      //var theStream = fs.createReadStream(info.path, 'utf8');
      var theStream = fs.readFileSync(info.path, 'utf8');
      return Promise.resolve(theStream);
    }

    function whatName(msg, suffix){
      var name = 'Doc ' + (new Date()).toString(); // + suffix;
      if (msg && msg.filename) {
        name = msg.filename;
      } else if (config && config.filename ) {
        name = config.filename;
      }
      name = name.replace(/[^0-9a-z]/gi, '');
      return (name + suffix);
    }

    function sourceLang(msg) {
      if (msg.payload &&
            'object' === typeof msg.payload &&
            msg.payload.source) {
        return msg.payload.source;
      }
      return msg.srclang ? msg.srclang : config.srclang;
    }

    function executePostRequest(uriAddress, params, msg) {
      return new Promise(function resolver(resolve, reject){
        var authSettings = buildAuthSettings();

        request({
          uri: uriAddress,
          method: 'POST',
          auth: authSettings,
          formData: params
        }, (error, response, body) => {
          if (!error && response.statusCode === 200) {
            let data = JSON.parse(body);
            resolve(data);
          } else if (error) {
            reject(error);
          } else {
            reject('Error performing request ' + response.statusCode + ' ' + body);
          }
        });
      });
    }

    function executeUnknownMethod(msg) {
      return Promise.reject('Unable to process as unknown mode has been specified');
    }

    function executeListDocuments(msg) {
      let uriAddress = `${endpoint}/v3/documents?version=${SERVICE_VERSION}`;
      return executeGetRequest(uriAddress);
    }

    function executeGetDocumentStatus(msg) {
      var docid = docID(msg);
      let uriAddress = `${endpoint}/v3/documents/${docid}?version=${SERVICE_VERSION}`;

      return executeGetRequest(uriAddress);
    }

    function executeGetDocument(msg) {
      return new Promise(function resolver(resolve, reject){
        let lt = getService(),
          docid = docID(msg);

        lt.getTranslatedDocument({documentId : docid})
          .then((response) => {
            msg.payload = response;
            if (response && response.result) {
              msg.payload = response.result;
            }
            return payloadutils.checkForStream(msg);
          })
          .then(() => {
            resolve(msg.payload);
          })
          .catch((err) => {
            reject(err);
          });
      });
    }

    function executeDeleteDocument(msg) {
      var docid = docID(msg);
      //let uriAddress = endpoint + '/v3/documents/' + docid + '?version=' + SERVICE_VERSION;
      let uriAddress = `${endpoint}/v3/documents/${docid}?version=${SERVICE_VERSION}`;

      return executeDeleteRequest(uriAddress);
    }

    function executeTranslateSubmittedDocument(msg) {
      let uriAddress = `${endpoint}/v3/documents?version=${SERVICE_VERSION}`;
      var params = {
        'source' : sourceLang(msg),
        'target' : msg.destlang ? msg.destlang : config.destlang,
        'document_id' : docID(msg)
      };
      return executePostRequest(uriAddress, params, msg);
    }

    function executeTranslateDocument(msg) {
      var p = null,
        fileInfo = null,
        fileSuffix = '';
      let uriAddress = `${endpoint}/v3/documents?version=${SERVICE_VERSION}`;

      p = verifyDocumentPayload(msg)
        .then (() => {
          return determineSuffix(msg);
        })
        .then ((suffix) => {
          //return loadFile(uriAddress, msg, ext);
          fileSuffix = suffix;
          return loadFile(suffix);
        })
        .then ((info) => {
          fileInfo = info;
          return syncTheFile(fileInfo, msg);
        })
        .then(function(){
          return createStream(fileInfo);
        })
        .then(function(theStream){
          //params.file = theStream;
          //var fname = 'temp' + fileSuffix;
          var params = {
            'source' : msg.srclang ? msg.srclang : config.srclang,
            'target' : msg.destlang ? msg.destlang : config.destlang
          };
          var fname = whatName(msg, fileSuffix);

          params.file = {
            value: theStream,
            options: {
              filename: fname
            }
          };

          //return Promise.reject('temp disabled');
          return executePostRequest(uriAddress, params, msg);
        });

      return p;
    }


    function executeAction(msg, action) {
      var f = null;

      const execute = {
        'listDocuments' : executeListDocuments,
        'translateDocument' : executeTranslateDocument,
        'translateSubmittedDocument' : executeTranslateSubmittedDocument,
        'documentStatus' : executeGetDocumentStatus,
        'deleteDocument' : executeDeleteDocument,
        'getDocument' : executeGetDocument
      };

      f = execute[action] || executeUnknownMethod;
      node.status({ fill: 'blue', shape: 'dot', text: 'processing' });
      return f(msg);
    }

    function processResponse(msg, data) {
      msg.payload = data;
      return Promise.resolve();
    }

    function doit(msg, send) {
      let action = msg.action || config.action;

      translatorutils.credentialCheck(apikey)
        .then(function(){
          return translatorutils.checkForAction(action);
        })
        .then(function(){
          return payloadCheck(msg, action);
        })
        .then(function(){
          return paramCheck(msg, action);
        })
        .then(function(){
          node.status({fill:'blue', shape:'dot', text:'executing'});
          return executeAction(msg, action);
        })
        .then( (data) => {
          node.status({ fill: 'blue', shape: 'dot', text: 'processing response' });
          return processResponse(msg, data);
        })
        .then(function(){
          temp.cleanup();
          node.status({});
          send(msg);
        })
        .catch(function(err){
          temp.cleanup();
          payloadutils.reportError(node, msg, err);
          send(msg);
        });
    }

    this.on('input', function(msg, send, done) {
      // The dynamic nature of this node has caused problems with the password field. it is
      // hidden but not a credential. If it is treated as a credential, it gets lost when there
      // is a request to refresh the model list.
      // Credentials are needed for each of the modes.
      apikey = sApikey || this.credentials.apikey || config.apikey;

      endpoint = sEndpoint;
      if (config['service-endpoint']) {
        endpoint = config['service-endpoint'];
      }

      node.status({});
      temp.track();

      if ('object' === typeof msg.payload &&
            msg.payload.documents &&
            Array.isArray(msg.payload.documents)) {
        let len = msg.payload.documents.length;

        msg.payload.documents.forEach((e, i) => {
          let msgClone = Object.assign({}, msg),
            pos = i+1;
          node.status({ fill: 'blue', shape: 'dot', text: `Processing document ${pos} of ${len}` });
          msgClone.payload = e;
          doit(msgClone, send);
        });

      } else {
        doit(msg, send);
      }
      done();
    });
  }

  RED.nodes.registerType('watson-doc-translator', Node, {
    credentials: {
      apikey: {type:'password'}
    }
  });
};
