Node-RED Watson Nodes for IBM Cloud
=====================================

[![Codacy Badge](https://api.codacy.com/project/badge/Grade/4f98536040924add9da4ca1deecb72b4)](https://www.codacy.com/app/BetaWorks-NodeRED-Watson/node-red-node-watson?utm_source=github.com&amp;utm_medium=referral&amp;utm_content=watson-developer-cloud/node-red-node-watson&amp;utm_campaign=Badge_Grade)
[![npm-version](https://img.shields.io/npm/v/node-red-node-watson.svg)](https://www.npmjs.com/package/node-red-node-watson)
[![npm-downloads](https://img.shields.io/npm/dm/node-red-node-watson.svg)](https://www.npmjs.com/package/node-red-node-watson)

<a href="https://cla-assistant.io/watson-developer-cloud/node-red-node-watson"><img src="https://cla-assistant.io/readme/badge/watson-developer-cloud/node-red-node-watson" alt="CLA assistant" /></a>


### New in version 0.10.3
- fix bug in cloud bound STT configuration

### New in version 0.10.2
- fix bug in cloud bound TTS configuration

### New in version 0.10.1
- README update

### New in version 0.10.0
- Bump of dependencies
  - ibm-watson to 6.2.2
- Min version of Node is 12.20.0
- Drop Personality Insights node
- Drop Visual Recognition nodes
- Remove Username / Password fields from all nodes
- Bump to latest version of services
- New Discovery V2 node
- Add Classifications to Natural Language Understanding node


### Watson Nodes for Node-RED
A collection of nodes to interact with the IBM Watson services in [IBM Cloud](http://cloud.ibm.com).

# Nodes

- Assistant (formerly Conversation)
    - Add conversational capabilities into applications.
- Discovery
    - List environments created for the Discovery service
- Language Identification
    - Detects the language used in text
- Language Translator
    - Translates text from one language to another    
- Natural Language Classifier
    - Uses machine learning algorithms to return the top matching predefined classes for short text inputs.
- Natural Language Understanding
    - Analyze text to extract meta-data from content such as concepts, entities, keywords ...
- Speech To Text
    - Convert audio containing speech to text
- Text To Speech
    - Convert text to audio speech
- Tone Analyzer
    - Discover, understand, and revise the language tones in text.

### Usage
Example usage flows can be found here [node-red-labs](https://github.com/watson-developer-cloud/node-red-labs)

### Contributing

For simple typos and fixes please just raise an issue pointing out our mistakes.
If you need to raise a pull request please read our [contribution guidelines](https://github.com/watson-developer-cloud/node-red-node-watson/blob/master/CONTRIBUTING.md)
before doing so.

### Copyright and license

Copyright 2018, 2022 IBM Corp. under [the Apache 2.0 license](LICENSE).
