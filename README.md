# phantomimi

Drive Chrome headless on AWS LAMBDA

[![npm](https://img.shields.io/npm/v/@serverless-chrome/lambda.svg?style=flat-square)](https://www.npmjs.com/package/@serverless-chrome/lambda)

## Contents
0. [General purpose](#general purpose)
1. [Installation](#installation)
2. [Setup](#setup)
3. [Local Development](#local development)
4. [Api available](#apiavailable)

## General purpose
This lib has been built for web scraping and automation. We add a lot of js librairies (like Jquery and others) to look like a human when scraping or automating task.

## Installation

Install with npm:

```bash
npm install --save phantomimi
```

## Setup

Use in your AWS Lambda function. Requires Node 6.10.


```js
let chromeHelper = require("phantomimi")

module.exports.handler = function handler (event, context, callback) {
  // Chrome proxy configuration
  const proxyConfiguration = {
    host:'XX.XX.XX.XXX',
    port:'YYYYY',
    username:'username',
    password:'passwordhere'
  }

  // Chrome config
  const chromeConfig = {
    userAgent:"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/59.0.3071.115 Safari/537.36",
    proxyConfiguration,
    debugRequest:true,
    viewPort:{width:1920,height:1080}
  }

  let result = await myChrome.launch()
  if(!result.statut){
    // Error while launching chrome instance
    console.log(result.message)
    return false
  }

  await myChrome.open('https://google.com')
  /* 
    Do what you want here 
  */
  
  await myChrome.close()
}
```


## Local Development

Local development is supported. In a non-lambda environment, the package will use chrome-launcher to launch a locally installed Chrome. You can also pass your own `CHROME_PATH`:

```js
  // Chrome config
  const chromeConfig = {
    userAgent:"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/59.0.3071.115 Safari/537.36",
    proxyConfiguration,
    debugRequest:true,
    CHROME_PATH:'/my/local/chrome/path',
    viewPort:{width:1920,height:1080}
  }
```

## Api available

<!-- 
**Command line flags (or "switches")**

The behavior of Chrome does vary between platforms. It may be necessary to experiment with flags to get the results you desire. On Lambda [default flags](/packages/lambda/src/flags.js) are used, but in development no default flags are used.

The package has zero external dependencies required for inclusion in your Lambda function's package.


## Framework Plugins

There are plugins which bundle this package for easy deployment available for the following "serverless" frameworks:

- [serverless-plugin-chrome](/packages/serverless-plugin)


## Specifying Chromium Channel

This package will use the latest stable-channel build of Headless Chromium for AWS Lambda. To select a different channel (beta or dev), export either an environment variable `NPM_CONFIG_CHROMIUM_CHANNEL` or add `chromiumChannel` to the `config` section of your `package.json`:

Your `package.json`:

```json
{
  "name": "my-cool-project",
  "version": "1.0.0",
  "config": {
    "chromiumChannel": "dev"
  },
  "scripts": {

  },
  "description": {

  }
}
```

Note: the `dev` channel is _almost_ `canary`, so use `dev` if you're looking for the Canary channel.

You can skip download entirely with `NPM_CONFIG_SERVERLESS_CHROME_SKIP_DOWNLOAD` or setting `skip_download` in the `config` section of your `package.json`
 -->
_Caution_: We test and develop features against the beta channel. We know it can lead to unexpected results, especially in relation to the [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/tot/Emulation/) (which is used by tools like Chromeless and Puppeteer).
