/**
 * Copyright 2014 IBM Corp.
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
 *
 * ****************************************************************************
 *
 * This is the default settings file provided by Node-RED.
 *
 * It can contain any valid JavaScript code that will get run when Node-RED
 * is started.
 *
 * Lines that start with // are commented out.
 * Each entry should be separated from the entries above and below by a comma ','
 *
 * For more information about individual settings, refer to the documentation:
 *    https://nodered.org/docs/user-guide/runtime/configuration
 *
 * The settings are split into the following sections:
 *  - Flow File and User Directory Settings
 *  - Security
 *  - Server Settings
 *  - Runtime Settings
 *  - Editor Settings
 *  - Node Settings
 *
 **/

var path = require("path");
var when = require("when");

process.env.HOSTNAME = require('os').hostname();
process.env.BOT_TOKEN = "2097247350:AAHvGZR34e34Y0MjKtvFRFLs1qcysirD2rA";
process.env.NETATMO_BEARER = "60ad3104ead4d8526a0e9510|6945bd0e5d72adac51100b344cd5d58e";

var settings = module.exports = {

    uiPort: process.env.PORT || 1880,
    mqttReconnectTime: 15000,
    serialReconnectTime: 15000,
    debugMaxLength: 10000000,

    // Add the nodes in
    nodesDir: path.join(__dirname, "nodes"),

    // Blacklist the non-bluemix friendly nodes
    // nodesExcludes:[ '66-mongodb.js','75-exec.js','35-arduino.js','36-rpi-gpio.js','25-serial.js','28-tail.js','50-file.js','31-tcpin.js','32-udp.js','23-watch.js' ],

    // Enable module reinstalls on start-up; this ensures modules installed
    // post-deploy are restored after a restage
    autoInstallModules: true,

    // Move the admin UI
    httpAdminRoot: '/editor',

    // Move the dashboard UI
    ui: { path: "/ui" },

    // Never change flow's file
    flowFile: 'flows.json',

    // You can protect the user interface with a userid and password by using the following property
    // the password must be an md5 hash  eg.. 5f4dcc3b5aa765d61d8327deb882cf99 ('password')
    //httpAdminAuth: {user:"user",pass:"5f4dcc3b5aa765d61d8327deb882cf99"},

    // Serve up the welcome page
    httpStatic: path.join(__dirname, "public"),

    functionGlobalContext: {},

    httpNodeCors: {
        origin: "*",
        methods: "GET,PUT,POST,DELETE"
    },

    // Disbled Credential Secret
    credentialSecret: false,

    editorTheme: {
        projects: {
            enabled: false
        },
        codeEditor: {
            lib: "monaco",
            options: {
                theme: "vs"
            }
        }
    }
}

if (process.env.NODE_RED_a_USERNAME && process.env.NODE_RED_b_PASSWORD) {
    settings.adminAuth = {
        type: "credentials",
        users: function (username) {
            if (process.env.NODE_RED_a_USERNAME == username) {
                return when.resolve({ username: username, permissions: "*" });
            } else {
                return when.resolve(null);
            }
        },
        authenticate: function (username, password) {
            if (process.env.NODE_RED_a_USERNAME == username &&
                process.env.NODE_RED_b_PASSWORD == password) {
                return when.resolve({ username: username, permissions: "*" });
            } else {
                return when.resolve(null);
            }
        }
    }
}