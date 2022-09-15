/**
 * Copyright 2016, 2022 IBM Corp.
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
  const SERVICE_IDENTIFIER = 'speech-to-text';
  var temp = require('temp'),
    request = require('request'),
    url = require('url'),
    fs = require('fs'),
    WebSocket = require('ws'),
    fileType = require('file-type'),
    pkg = require('../../package.json'),
    serviceutils = require('../../utilities/service-utils'),
    payloadutils = require('../../utilities/payload-utils'),
    sttutils = require('./stt-utils'),
    { IamTokenManager } = require('ibm-watson/auth');
    muteMode = true, discardMode = false, autoConnect = true,
    apikey = '', sApikey = '',
    endpoint = '',
    sEndpoint = 'https://stream.watsonplatform.net/speech-to-text/api',
    service = serviceutils.getServiceCreds(SERVICE_IDENTIFIER);

  // Require the Cloud Foundry Module to pull credentials from bound service
  // If they are found then the key
  // the variable sApikey
  //
  // This separation between is to allow
  // the end user to modify the credentials when the service is not bound.
  // Otherwise, once set credentials are never reset, resulting in a frustrated
  // user who, when he errenously enters bad credentials, can't figure out why
  // the edited ones are not being taken.

  if (service) {
    sApikey = service.apikey ? service.apikey : '';
    sEndpoint = service.url;
  }

  // temp is being used for file streaming to allow the file to arrive so it can be processed.
  temp.track();

  // These are APIs that the node has created to allow it to dynamically fetch IBM Cloud
  // credentials, and also translation models. This allows the node to keep up to
  // date with new tranlations, without the need for a code update of this node.

  // Node RED Admin - fetch and set vcap services
  RED.httpAdmin.get('/watson-speech-to-text/vcap', (req, res) => {
    res.json(service ? {bound_service: true} : null);
  });


  // API used by widget to fetch available models
  RED.httpAdmin.get('/watson-speech-to-text/models', (req, res) => {
    var stt = sttutils.initSTTService(req, sApikey, sEndpoint);

    stt.listModels({})
      .then((response) => {
        let models = response;
        if (response.result) {
          models = response.result;
        }
        res.json(models);
      })
      .catch((err) => {
        res.json(err);
      })
  });

  // API used by widget to fetch available customisations
  RED.httpAdmin.get('/watson-speech-to-text/customs', (req, res) => {
    var stt = sttutils.initSTTService(req, sApikey, sEndpoint);

    stt.listLanguageModels({})
      .then((response) => {
        let customs = response;
        if (response.result) {
          customs = response.result;
        }
        res.json(customs);
      })
      .catch((err) => {
        res.json(err);
      })
  });


  // This is the Speech to Text Node

  function Node (config) {
    RED.nodes.createNode(this, config);
    var node = this, token = null, tokenTime = null,
      tokenPending = false,
      websocket = null,
      socketCreationInProcess = false,
      socketListening = false,
      startPacket = { action: 'start',
                       'content-type' :'audio/wav',
                       'interim_results': true
                    },
      audioStack =[];
    const HOUR = 60 * 60;

    function initialCheck(apikey) {
      if (!apikey) {
        return Promise.reject('Missing Speech To Text service credentials');
      }
      return Promise.resolve();
    }

    function configCheck() {
      var message = '';

      muteMode = config['streaming-mute'];
      discardMode = config['discard-listening'];
      autoConnect = config['auto-connect'];

      if (!config.lang) {
        message = 'Missing audio language configuration, unable to process speech.';
      } else if (!config.band) {
        message = 'Missing audio quality configuration, unable to process speech.';
      }

      if (message) {
        return Promise.reject(message);
      }
      return Promise.resolve();
    }

    // Allow the language to be overridden through msg.srclang, no check
    // for validity
    function overrideCheck(msg) {
      if (msg.srclang){
        var langCode = payloadutils.langTransToSTTFormat(msg.srclang);
        config.lang = langCode;
      }
      return Promise.resolve();
    }


    // Input is a standard msg.payload
    function payloadNonStreamCheck(msg) {
      var message = '';

      // The input comes in on msg.payload, and can either be an audio file or a string
      // representing a URL.
      if (!msg.payload instanceof Buffer || !typeof msg.payload === 'string') {
        message = 'Invalid property: msg.payload, can only be a URL or a Buffer.';
      } else if (!(msg.payload instanceof Buffer)) {
        // This check is repeated just before the call to the service, but
        // its also performed here as a double check.
        if (typeof msg.payload === 'string' && !payloadutils.urlCheck(msg.payload)) {
          message = 'Invalid URL.';
        }
      } else {
        var f = 'txt', ft = '';

        ft = fileType(msg.payload);
        if (ft) {
          f = ft.ext;
        }

        switch (f) {
        case 'wav':
        case 'flac':
        case 'ogg':
        case 'mp3':
        case 'mpeg':
          break;
        default:
          if (! ft.mime.toLowerCase().includes('audio')) {
            message = 'Audio format (' + f + ') not supported, must be encoded as WAV, MP3, FLAC or OGG.';
          }
        }
      }
      if (message) {
        return Promise.reject(message);
      }
      return Promise.resolve();
    }

    function payloadCheck(msg) {
      if (config['streaming-mode'] || config['disable-precheck']) {
        return Promise.resolve();
      }
      return payloadNonStreamCheck(msg);
    }

    function setFormat(format) {
      // if the format is being seen as either opus or vorbis, then it
      // could be one of
      //      audio/ogg;codecs=opus
      //      audio/ogg;codecs=vorbis
      //      audio/webm;codecs=opus
      //      audio/webm;codecs=vorbis
      // there isn't enough information to decide between audio/ogg and audio/webm
      // so lets go with audio/ogg
      switch (format) {
      case 'opus':
      case 'vorbis':
        return 'ogg;codecs=' + format;
      default:
        return format;
      }
    }

    function processInputBuffer(msg) {
      var p = new Promise(function resolver(resolve, reject){
        temp.open({suffix: '.' + fileType(msg.payload).ext}, (err, info) => {
          if (err) {
            reject(err);
          }
          payloadutils.stream_buffer(info.path, msg.payload, (format) => {
            var audioData = {},
              audio = fs.createReadStream(info.path);

            audioData.audio = audio;
            audioData.format = setFormat(format);

            resolve(audioData);
          });
        });
      });
      return p;
    }

    function processInputURL(msg) {
      var p = new Promise(function resolver(resolve, reject){
        temp.open({suffix: '.audio'}, (err, info) => {
          if (err) {
            reject(err);
          }
          payloadutils.stream_url(info.path, msg.payload, (err, format) => {
            if (err) {
              reject(err);
            }
            var audioData = {},
              audio = fs.createReadStream(info.path);

            audioData.audio = audio;
            audioData.format = setFormat(format);
            resolve(audioData);
          });
        });
      });
      return p;
    }

    // The input is from a websocket stream in Node-RED.
    // expect action of 'start' or 'stop' or a data blob
    // if its a blob then its going to be audio.
    function processInputStream(msg) {
      var tmp = msg.payload;

      if ('string' === typeof msg.payload) {
        msg.payload = JSON.parse(tmp);
      }
      if (msg.payload.action) {
        if ('start' === msg.payload.action) {
          startPacket = msg.payload;
        }
      } else {
        msg.payload = { 'action' : 'data', 'data' : tmp };
      }

      return Promise.resolve(msg.payload);
    }

    function processInput(msg) {
      // We are now ready to process the input data
      // If its a buffer then need to read it all before invoking the service
      if (config['streaming-mode']){
        return processInputStream(msg);
      } else if (msg.payload instanceof Buffer) {
        return processInputBuffer(msg);
      } else if (payloadutils.urlCheck(msg.payload)) {
        return processInputURL(msg);
      }
      return Promise.reject('Payload must be either an audio buffer or a string representing a url');
    }

    function determineService() {
      return sttutils.determineService(apikey, endpoint);
    }

    function getService() {
      var p = new Promise(function resolver(resolve, reject){
        let sttService = determineService();
        // preAuthenticate was a temp fix, but now that we are
        // processing IAM Keys directly, no need for this, but
        // we will keep the commented out code for now, as we
        // may come back to this.
        // if (apikey) {
        //   sttService.preAuthenticate((ready) => {
        //     if (!ready) {
        //       reject('Service is not ready');
        //     } else {
        //       resolve(sttService);
        //     }
        //   });
        // } else {
        resolve(sttService);
        // }
      });
      return p;
    }

    function determineTokenService(stt) {
      let tokenService = null;
      if (apikey) {
        tokenService = new IamTokenManager({apikey : apikey});
      }
      return tokenService;
    }

    function cloneQS(original) {
      // First create an empty object that will receive copies of properties
      let clone = {}, i = 0, keys = Object.keys(original);

      for (i = 0; i < keys.length; i++) {
        // copy each property into the clone
        clone[keys[i]] = original[keys[i]];
      }
      ['audio', 'content_type'].forEach((f) => {
        if (clone[f]) {
          delete clone[f];
        }
      });

      return clone;
    }


    function keywordParams(params) {
      // Check for keywords, which might already be an array
      if (config['keywords'] && 'string' === typeof config['keywords']) {
        // Trim any [] from edges of string
        var keywords = config['keywords'],
          start = 0,
          end = keywords.length,
          threshold = parseFloat(config['keywords_threshold']);

        if ('[' === keywords[start]) {
          start++;
        }
        if (']' === keywords[end]) {
          end--;
        }
        params.keywords = keywords.substring(start, end).split(',');
        params['keywordsThreshold'] = isNaN(threshold) ? 0 : threshold;
      }
    }

    function performSTT(speech_to_text, audioData) {
      var p = new Promise(function resolver(resolve, reject){
        var model = config.lang + '_' + config.band,
          params = {};

        // If we get to here then the audio is in one of the supported formats.
        // STT service can now automatically detect the codec of the input audio
        // and supports more than codec=opus for ogg formats.
        //if (audioData.format === 'ogg') {
        //  audioData.format += ';codecs=opus';
        //}

        params = {
          audio: audioData.audio,
          contentType: 'audio/' + audioData.format,
          model: model,
          maxAlternatives: config['alternatives'] ? parseInt(config['alternatives']) : 1,
          speakerLabels: config.speakerlabels ? config.speakerlabels : false,
          smartFormatting: config.smartformatting ? config.smartformatting : false,
          wordConfidence: config['word-confidence'] ? config['word-confidence'] : false
        };

        keywordParams(params);

        // Check the params for customisation options
        if (config.langcustom && 'NoCustomisationSetting' !== config.langcustom) {
          var weight = parseFloat(config['custom-weight']);
          params.languageCustomizationId = config.langcustom;
          params.customizationWeight = isNaN(weight) ? 0 : weight;
        }

        console.log('Invoking with params');
        console.log(params);
        // Everything is now in place to invoke the service
        speech_to_text.recognize(params)
          .then((response) => {
            let result = response;
            if (response.result) {
              result = response.result;
            }
            resolve(result);
          })
          .catch((err) => {
            reject(err);
          })

      });
      return p;
    }

    function getToken(stt) {
      var p = new Promise(function resolver(resolve, reject) {
        var now = Math.floor(Date.now() / 1000);

        var tokenService = determineTokenService(stt);

        if (tokenPending) {
          setTimeout(() => {
          }, 1000);
        }

        if (token && now > (HOUR + tokenTime)) {
          resolve();
        } else {
          // Everything is now in place to invoke the service
          tokenPending = true;

          tokenService.getToken()
            .then((t) => {
              token = t;
              tokenPending = false;
              tokenTime = now;
              resolve();
            })
            .catch((err) => {
              reject(err);
            })
        }
      });
      return p;
    }


    // This function generates a load of listeners, that if resolving or
    // rejecting promises causes problems, as nothing is waiting on those
    // promises. I had wanted to pause and socket activity until the 'open'
    // event, which was ok initially, but on subsequent socket close / Error
    // reopens caused problems.
    function processSTTSocketStart(initialConnect) {
      var p = new Promise(function resolver(resolve, reject) {
        var model = config.lang + '_' + config.band;
        var wsURI = '';

        if (endpoint) {
          var tmp = endpoint.replace('https', 'wss');
          wsURI = tmp + '/v1/recognize';
        } else {
          wsURI = 'wss://stream.watsonplatform.net/speech-to-text/api/v1/recognize';
        }

        if (apikey) {
          wsURI += '?model=' + model;
        } else {
          wsURI += '?watson-token=' + token + '&model=' + model;
        }

        //console.log('wsURI is : ', wsURI);

        if (!websocket && !socketCreationInProcess) {
          socketCreationInProcess = true;
          //console.log('Attempting creation of web socket');
          var authHeader = {};
          if (apikey) {
            authHeader.headers = { authorization: 'Bearer ' + token };
          }

          var ws = new WebSocket(wsURI, authHeader);
          //console.log('Setting up listeners');
          ws.on('open', () => {
            //console.log('Socket is open');
            var streamStartPacket = startPacket;

            if (config['alternatives']) {
              streamStartPacket.maxAlternatives = parseInt(config['alternatives']);
            }
            if (config.speakerlabels) {
              streamStartPacket.speakerLabels = config.speakerlabels;
            }
            if (config.smart_formatting) {
              streamStartPacket.smartFormatting = config.smartformatting;
            }
            if (config['word-confidence']) {
              streamStartPacket.wordConfidence = config['word-confidence'];
            }

            keywordParams(streamStartPacket);

            ws.send(JSON.stringify(streamStartPacket));
            websocket = ws;
            socketCreationInProcess = false;
            // resolve();
          });

          ws.on('message', (data) => {
            // First message will be 'state': 'listening'
            // console.log('-----------------------');
            // console.log('Data Received from Input');
            // console.log(data);
            var d = JSON.parse(data);
            var newMsg = {payload : JSON.parse(data)};
            if (d) {
              if (d.error) {
                // Force Expiry of Token, as that is the only Error
                // response from the service that we have seen.
                // report the error for verbose testing
                if (!muteMode) {
                  payloadutils.reportError(node,newMsg,d.error);
                }
                // console.log('Fetching token');
                token = null;
                getToken(determineService())
                  .then(() => {
                    return;
                  });
              } else if (d && d.state && 'listening' === d.state) {
                socketListening = true;
                // Added for verbose testing
                if (!discardMode) {
                  node.send(newMsg);
                }
                //resolve();
              } else {
                node.send(newMsg);
              }
            }
          });

          ws.on('close', () => {
            websocket = null;
            socketListening = false;
            // console.log('STT Socket disconnected');
            if (!muteMode) {
              var newMsg = {payload : 'STT Connection Close Event'};
              payloadutils.reportError(node,newMsg,'STT Socket Connection closed');
            }
            if (autoConnect) {
              setTimeout(connectIfNeeded, 1000);
            }
          });

          ws.on('error', (err) => {
            socketListening = false;
            if (!muteMode) {
              var newMsg = {payload : 'STT Connection Error'};
              console.log('Socket Error ', err);
              payloadutils.reportError(node,newMsg,err);
            }
            // console.log('Error Detected');
            if (initialConnect) {
              // reject(err);
            }
          });

        }
        resolve();
      });
      return p;
    }

    // If we are going to connect to STT through websockets then its going to
    // disconnect or timeout, so need to handle that occurrence.
    function connectIfNeeded() {
      // console.log('re-establishing the connect');
      websocket = null;
      socketCreationInProcess = false;

      // The token may have expired so test for it.
      getToken(determineService())
        .then(() => {
          return processSTTSocketStart(false);
        })
        .then(() => {
          //return Promise.resolve();
          return;
        })
        .catch((err) => {
          //return Promise.resolve();
          return;
        });
    }

    // While we are waiting for a connection, stack the data input
    // so it can be processed, when the connection becomes available.
    function stackAudioFile(audioData) {
      audioStack.push(audioData);
      return Promise.resolve();
    }

    function sendTheStack() {
      if (audioStack && audioStack.length) {
        audioStack.forEach((a) => {
          if (a && a.action && 'data' === a.action) {
            //websocket.send(a.data);
            websocket.send(a.data, (error) => {
              if (error) {
                if (!muteMode) {
                  payloadutils.reportError(node,{},error);
                }
              }
            });
          }
        });
        audioStack = [];
      }
    }

    function sendAudioSTTSocket(audioData) {
      var p = new Promise(function resolver(resolve, reject) {
        // send stack First
        sendTheStack();
        if (audioData && audioData.action) {
          if ('data' === audioData.action) {
            // console.log('Sending data');
            websocket.send(audioData.data, (error) => {
              if (error) {
                // console.log('Error Sending data ', error);
                reject(error);
              } else {
                // console.log('Data was sent');
                resolve();
              }
            });
          } else if (audioData.action === 'stop') {
            websocket.send(JSON.stringify(audioData));
            socketListening = false;
          }
        }
      });
      return p;
    }

    function performStreamSTT(speech_to_text, audioData) {
      var delay = 1000;
      var p = getToken(speech_to_text)
        .then(() => {
          switch (audioData.action) {
          case 'start':
            return processSTTSocketStart(true);
          case 'stop':
            delay = 2000;
            // deliberate no break
          case 'data':
            // Add a Delay to allow the listening thread to kick in
            // Delays for Stop is longer, so that it doesn't get actioned
            // before the audio buffers.
            setTimeout(() => {
              if (socketListening) {
                return sendAudioSTTSocket(audioData);
              } else {
                return stackAudioFile(audioData);
              }
            }, delay);
          default:
            return Promise.resolve();
          }
        })
        .then(() => {
          return Promise.resolve();
        });
      return p;
    }

    function processResponse(msg, data) {
      var r = data.results;

      msg.transcription = '';
      if (r) {
        if (r.length && r[0].alternatives.length) {
          //msg.fullresult = r;
          msg.fullresult = data;
        }
        msg.transcription = '';
        r.forEach((a) => {
          msg.transcription += a.alternatives[0].transcript;
          //a.alternatives.forEach(function(t){
          //  msg.transcription += t.transcript;
          //});
        });
      }
      if (config['payload-response']) {
        msg.payload = msg.transcription;
      }

      return Promise.resolve();
    }

    this.on('input', function(msg, send, done) {
      // Credentials are needed for the service. They will either be bound or
      // specified by the user in the dialog.
      apikey = sApikey || this.credentials.apikey || config.apikey;

      endpoint = sEndpoint;
      if (config['service-endpoint']) {
        endpoint = config['service-endpoint'];
      }

      node.status({});

      let sttService = null;

      // Now perform checks on the input and parameters, to make sure that all
      // is in place before the service is invoked.
      initialCheck(apikey)
      .then(() => {
        return configCheck();
      })
      .then(() => {
        return payloadCheck(msg);
      })
      .then(() => {
        return overrideCheck(msg);
      })
      .then(() => {
        return getService();
      })
      .then((s) => {
        sttService = s;
        return processInput(msg);
      })
      .then((audioData) => {
        node.status({fill:'blue', shape:'dot', text:'requesting'});
        if (config['streaming-mode']) {
          return performStreamSTT(sttService, audioData);
        } else {
          return performSTT(sttService, audioData);
        }
      })
      .then((data) => {
        if (config['streaming-mode']) {
          return Promise.resolve();
        } else {
          return processResponse(msg, data);
        }
      })
      .then(() => {
        temp.cleanup();
        if (config['streaming-mode']) {
          node.status({fill:'blue', shape:'dot', text:'listening for socket data'});
        } else {
          node.status({});
          send(msg);
          done();
        }
      })
      .catch((err) => {
        temp.cleanup();
        payloadutils.reportError(node,msg,err);
        done(err);
      });

    });
  }

  RED.nodes.registerType('watson-speech-to-text', Node, {
    credentials: {
      apikey: {type:'password'}
    }
  });
};
