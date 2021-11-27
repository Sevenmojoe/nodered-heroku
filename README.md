# nodered-heroku
A wrapper for deploying [Node-RED](http://nodered.org) into the [Heroku](https://www.heroku.com).
* DEMO: Flow Editor - [https://nodered-heroku.herokuapp.com/editor](https://nodered-heroku.herokuapp.com/editor)
* DEMO: Dashboard UI - [https://nodered-heroku.herokuapp.com](https://nodered-heroku.herokuapp.com)


# Warning: Heroku doesn't automatically save flows, credentials and installed nodes, so they can be lost at every restart.
* To overcome this, after having deployed the new flows by the Editor, export All flows as "flows.json" file, and push it to the GitHub repo linked to Heroku. Do the same with "flows_cred.json" and "package.json" files for the credentials and nodes installed in Palette. Detail on step 5.

# 1. Deploying Node-RED into Heroku  [![Deploy](https://www.herokucdn.com/deploy/button.png)](https://heroku.com/deploy?template=https://github.com/hybuild-project/nodered-heroku)

# 2. Fork this repo, set GitHub as deploy source on Heroku setting, and enable Automatic Deployment
* Every time any file is pushed to GitHub repo, Heroku will rebuild node-red with updated files.

# 3. Set Username and Password for Node-RED Flow Editor
* NODE_RED_USERNAME - replace this with Username for Flow Editor
* NODE_RED_PASSWORD - replace this with Password for Flow Editor

# 4. Access Node-Red
* Flow Editor - [nodered-on-cloud.herokuapp.com/editor](https://nodered-on-cloud.herokuapp.com/editor)
* Dashboard UI - [nodered-on-cloud.herokuapp.com/ui](https://nodered-on-cloud.herokuapp.com/ui)
* Home page - [nodered-on-cloud.herokuapp.com](https://nodered-on-cloud.herokuapp.com)

# 5. Export all flows, credentials and installed nodes
* In Editor, to export "flows.json", click hamburger icon <code>☰</code> (top right), click Export, choose tab "All flows", then Download.
* To export all the other files, browse the <i>/app</i> folder, e.g., with this [flow](https://flows.nodered.org/flow/44bc7ad491aacb4253dd8a5f757b5407) or the [modified version](utils/file-explorer-flow.json), and download all files.
* Push downloaded "flows.json", "flows_cred.json", "package.json" file to the repo on GitHub. In this way, Node-RED will always have latest pushed "flows.json", "flows_cred.json", "package.json" when Heroku dynos are restarted.
* <strong>Updated one-shot mode (best way)</strong> Use the <code>SAVE</code> Inject node in the [first flow](utils/save-all-changes-flow.json) to directly push all files to GitHub.

# Some included nodes
* Dashboard UI - node-red-dashboard
* MQTT - node-red-contrib-aedes
* Blynk Cloud - node-red-contrib-blynk-ws
* Email - node-red-node-email
* Telegram - node-red-contrib-telegrambot-home
* InfluxDB, MongoDB, Modbus, OPC UA, Netatmo, PostgresSQL, Wordmap, etc. 
