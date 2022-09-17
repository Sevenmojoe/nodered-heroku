/**
 * Copyright 20016 IBM Corp.
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

module.exports = function(RED) {

  const SERVICE_IDENTIFIER = 'discovery';
  var discoveryutils = require('./discovery-utils'),
    serviceutils = require('../../utilities/service-utils'),
    dservice = serviceutils.getServiceCreds(SERVICE_IDENTIFIER),
    sUsername = null,
    sPassword = null,
    sApikey = null,
    sEndpoint = '';


  if (dservice) {
    sUsername = dservice.username ? dservice.username : '';
    sPassword = dservice.password ? dservice.password : '';
    sApikey = dservice.apikey ? dservice.apikey : '';
    sEndpoint = dservice.url ? dservice.url : '';
  }

  RED.httpAdmin.get('/watson-discovery-v1-query-builder/vcap', function(req, res) {
    res.json(serviceutils.checkServiceBound(SERVICE_IDENTIFIER));
  });

  function processResponse(response, field) {
    let reply = response;
    if (response) {
      if (response.result) {
        if (response.result[field]) {
          reply = response.result[field];
        } else {
          reply = response.result;
        }
      }
    }
    return reply;
  }

  // API used by widget to fetch available environments
  RED.httpAdmin.get('/watson-discovery-v1-query-builder/environments', function(req, res) {

    let discovery = discoveryutils.buildService(sUsername ? sUsername : req.query.un,
                                         sPassword ? sPassword : req.query.pwd,
                                         sApikey ? sApikey : req.query.key,
                                         req.query.endpoint ? req.query.endpoint : sEndpoint);

    discovery.listEnvironments({})
      .then((response) => {
        res.json(processResponse(response,'environments'));
      })
      .catch((err) => {
        res.json(err);
      });
  });

  // API used by widget to fetch available collections in environment
  RED.httpAdmin.get('/watson-discovery-v1-query-builder/collections', function(req, res) {
    let discovery = discoveryutils.buildService(sUsername ? sUsername : req.query.un,
                                         sPassword ? sPassword : req.query.pwd,
                                         sApikey ? sApikey : req.query.key,
                                         req.query.endpoint ? req.query.endpoint : sEndpoint);

    discovery.listCollections({environmentId: req.query.environment_id})
      .then((response) => {
        res.json(processResponse(response,'collections'));
      })
      .catch((err) => {
        res.json(err);
      });
  });


  // API used by widget to fetch available collections in environment
  RED.httpAdmin.get('/watson-discovery-v1-query-builder/schemas', function(req, res) {
    let discovery = discoveryutils.buildService(sUsername ? sUsername : req.query.un,
                                         sPassword ? sPassword : req.query.pwd,
                                         sApikey ? sApikey : req.query.key,
                                         req.query.endpoint ? req.query.endpoint : sEndpoint);

    discovery.listCollectionFields({
      environmentId: req.query.environment_id,
      collectionId: req.query.collection_id
    })
      .then((response) => {
        let fieldList = discoveryutils.buildFieldList(response);
        res.json(fieldList);
      })
      .catch((err) => {
        res.json(err);
      });

  });

  function Node(config) {
    var node = this;
    RED.nodes.createNode(this, config);

    this.on('input', function(msg) {
      // Simply return params for query on msg object
      msg.discoveryparams = discoveryutils.buildMsgOverrides(msg, config);
      node.send(msg);
    });
  }

  RED.nodes.registerType('watson-discovery-v1-query-builder', Node, {
    credentials: {
      username: {
        type: 'text'
      },
      password: {
        type: 'password'
      },
      apikey: {
        type: 'password'
      }
    }
  });
};
