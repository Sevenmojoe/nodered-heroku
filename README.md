# nodered-heroku
A wrapper for deploying [Node-RED](http://nodered.org) into the [Heroku](https://www.heroku.com).

# Deploying Node-RED into Heroku
[![Deploy](https://www.herokucdn.com/deploy/button.png)](https://heroku.com/deploy?template=https://github.com/Sevenmojoe/nodered-heroku)

# Protect the Flow Editor with Password
Set the following user-defined variables.

* NODE_RED_USERNAME - replace this with Username for Flow Editor
* NODE_RED_PASSWORD - replace this with Password for Flow Editor

# How to login
* Flow Editor - [change-with-your-heroku-app-name.herokuapp.com/editor](https://change-with-your-heroku-app-name.herokuapp.com/editor)
* Dashboard UI - [change-with-your-heroku-app-name.herokuapp.com](https://change-with-your-heroku-app-name.herokuapp.com)

# Some included nodes
* Dashboard UI - node-red-dashboard
* MQTT - node-red-contrib-aedes
* Blynk Cloud - node-red-contrib-blynk-ws
* Email - node-red-node-email
* Telegram - node-red-contrib-telegrambot
