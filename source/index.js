'use strict';

const CDP = require("chrome-remote-interface")
const fs = require("fs")
const request = require('request')
const sp  = require('child_process')
const os = require('os')
const path = require('path')

let AWS = require('aws-sdk')
// AWS.config.loadFromPath('./awsconfig.json')
let s3 = new AWS.S3()

const hat = require('hat')

const userAgentList = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36",
  "Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:57.0) Gecko/20100101 Firefox/57.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_1) AppleWebKit/604.3.5 (KHTML, like Gecko) Version/11.0.1 Safari/604.3.5"
]


class Chrome{

  constructor(params){
    this.chrome = null
    this.debugLevel = 'DEVELOPPEMENT'
    this.viewPort = {width:1200,height:800}
    this.userAgent = this.getRandomUserAgent()
    this.mainParams = null
    this.proxyConfiguration = null
    this.debugRequest = false
    //params.CHROME_PATH||process.env.GOOGLE_CHROME_BIN||process.env.GOOGLE_CHROME_SHIM
    this.CHROME_PATH = path.resolve(__dirname+'/headless-chromium')
    if(params.CHROME_PATH)
      this.CHROME_PATH = params.CHROME_PATH
    this.currentProcess
    this.browserContextId 
    this.chromePort
    if(params && params.DEBUG)
      this.debugLevel = params.DEBUG
    if(params && params.userAgent)
      this.userAgent = params.userAgent
    else
      this.userAgent = userAgentList[Math.floor(Math.random()*userAgentList.length)]
    if(params && params.port){
      this.chromePort = params.port
    }
    this.CanaryArgs = [
      '--headless',
      '--remote-debugging-port='+(params.port||9222),
      '--disable-gpu'
    ]
    console.log(this.CanaryArgs)
    if(params && params.proxyConfiguration){
      this.proxyConfiguration = params.proxyConfiguration
      if(this.proxyConfiguration.host && this.proxyConfiguration.port){
        this.proxyConfiguration.url = 'http://'+this.proxyConfiguration.host+':'+this.proxyConfiguration.port
        this.CanaryArgs.push('--proxy-server='+this.proxyConfiguration.host+':'+this.proxyConfiguration.port)
      }
    }
    if(params && params.debugRequest)
      this.debugRequest = params.debugRequest
    if(params && params.viewPort && params.viewPort.width && params.viewPort.height){
      this.viewPort = {width:params.viewPort.width,height:params.viewPort.height}
      this.CanaryArgs.push('--window-size='+params.viewPort.width+','+params.viewPort.height+'')
    }
    else{
      this.CanaryArgs.push('--window-size=1280,800')
    }
  }

  getAvailablePort(port){
    return new Promise((resolve, reject) => {
      if(!port){
        port = 9222
      }
      request({url:'http://127.0.0.1:'+port+'/json'},(err,body)=>{
        if(err){
          console.log('err port',err)
          resolve(port)
        }else{
          this.getAvailablePort(port+1)
          .then((result)=>{
            this.chromePort = port
            resolve(result)
          })
          .catch((e)=>{
            reject(e)
          })
        }
      })
    })
  }
	/*
		Display message on console when app is in Developpement
	*/
	logDev(message){
		if(this.debugLevel==='DEVELOPPEMENT')
			console.log(message)
	}

  logRequest(request){
    if(this.debugRequest)
      console.log(request)
  }

	/*
		Save file to local
	*/
	saveLocalFile(fileUrl,data,type){
		return new Promise((resolve, reject) => {
			fs.writeFile(fileUrl, data, type,(err,result)=>{
				if(err){
					this.logDev(err)
					reject(err)
				}
				resolve(fileUrl)
			})
		})
	}
	/*
    Read file
  */
  readFile(filePath){
    return new Promise((resolve, reject) => {
      fs.exists(filePath, (exists)=>{
          if(exists){ // results true
              fs.readFile(filePath, {encoding: "utf8"}, (err, data)=>{
                if(err){
                  logDev(err)
                    resolve(null)
                }              
                resolve(data)
            })
          }else{
            resolve(null)
          }
      });   
    })
  }
	/*
		Get a valid and recent userAgent list
	*/
	getRandomUserAgent(){
		const idx = Math.floor(Math.random() * userAgentList.length-1)
		return userAgentList[idx]||userAgentList[0]
	}	
	/*
		Configuration of params
	*/

	chromeIsRunning(){
		return new Promise((resolve, reject) => {
			request({url:'http://127.0.0.1:'+this.chromePort+'/json'},(err,result,body)=>{
				if(err){
					reject(err)
				}else{
					resolve(body)
				}
			})			
		})
	}
	/*
		Wait chrome launch
	*/
	waitForChrome(retry,maxRetry){
		return new Promise((resolve, reject) => {
			if(retry<=maxRetry){
				this.chromeIsRunning()
				.then((result)=>{
          console.log('Result',result)
					resolve({statut:true})
				})
				.catch((e)=>{
					this.logDev('**************\nWaiting for chrome\nAttempt n°'+retry+'\n**************')
					setTimeout(()=>{
						this.waitForChrome(retry+1,maxRetry)
						.then((result)=>{
							resolve(result)
						})
						.catch((err)=>{
							reject(err)
						})
					},100)
				})
			}else{
				reject(new Error('Timeout while waiting for Chrome process'))
			}
		})
	}
	/*
		Launch Chrome process
	*/
	async launchChromeProcess(){
	if(this.CHROME_PATH){
			let chrome = null
      try{
        console.log('temp dir',os.tmpdir())
        console.log('SPAWN CHROME',this.CanaryArgs)
        chrome = sp.spawn(
        	this.CHROME_PATH,
	        this.CanaryArgs,
          {
            cwd: os.tmpdir(),
            detached: true,
            stdio: 'ignore'
          }
	      )
        // .on('close', () => console.log('CHROME_PROCESS_CLOSE'))
        // .on('error', e => console.log('CHROME_PROCESS_ERROR', e))
        // .on('exit', (e, z, a) => console.log('CHROME_PROCESS_EXIT', e, z, a))
        // .on('data', (data) => {console.log('data is',data)})
        if(chrome){
          chrome.unref()
          console.log('PID value',chrome.pid)
          this.currentProcess = chrome
        }
        return {statut:true}
      }catch(e){
        console.log('Error here',e)
        return {statut:false}
      }
		}else{
      console.log('Throwing new error : Chrome path not defined')
			throw new Error('Chrome path not defined')
		}
	}

  async getWebSocketDebuggerUrl(){
    return new Promise((resolve, reject) => {
      request({url:'http://127.0.0.1:'+this.chromePort+'/json/version','method':'GET'},(err,response,body)=>{
        if(err){
          reject(err)
        }else{
          if(typeof body==="string"){
            try{
              body = JSON.parse(body)
            }catch(e){
              body = body
            }
          }
          if(body && body.webSocketDebuggerUrl){
            resolve(body.webSocketDebuggerUrl)
          }else if(body && body.length>0){
            resolve(body[0].webSocketDebuggerUrl)
          }else{
            resolve(null)
          }
        }
      })
    });
  }

  async createTarget(host,port,secure){
    return new Promise((resolve, reject) => {
      CDP.New({host,port,secure},function (err, target) {
          if(err){
            console.log('Error here',err)
            resolve(null)
          }else{
            resolve(target)
          }
      })
    })
  }
	/*
		Launch instance of Chrome headless navigator
	*/
	async launch(params){
		try{
			/*
				Lancement de canary
			*/
      let isAlreadyRunning
      this.logDev('New attempt to launch Chrome')
      let portAvailable
      console.log("chromePort",this.chromePort)
      if(!this.chromePort)
        portAvailable = await this.getAvailablePort()
      else
        portAvailable = this.chromePort
      console.log('available port',portAvailable)
      if(!portAvailable){
        throw new Error('No port available')
      }
      this.CanaryArgs[1] = '--remote-debugging-port='+portAvailable
      this.chromePort = portAvailable
      let isLaunch = await this.launchChromeProcess()
      if(!isLaunch || (isLaunch && !isLaunch.statut)){
        return {statut:false,message:'An error occured while launching Chrome'}
      }
      // try{
      //   isAlreadyRunning = await this.chromeIsRunning()
      //   this.logDev('Chrome is already running',isAlreadyRunning)
      // }catch(e){
      //   this.logDev('Chrome is not running')
      //   this.launchChromeProcess()
      //   await this.waitForChrome(0,100)
      // }
      await this.waitForChrome(0,250)
      console.log('Here')
      let debugUrl
      try{
        debugUrl = await this.getWebSocketDebuggerUrl()
        console.log(debugUrl)
      }catch(e){
        return {statut:false,message:`${e.message}`}
      }
      
      // const browser = await CDP({target:debugUrl})
      // const {Target} = browser
      // const {browserContextId} = await Target.createBrowserContext()
      // const {targetId} = await Target.createTarget({url:'about:blank',browserContextId})

      // const targets = await Target.getTargets()

      // console.log('browserContextId',browserContextId)
      // console.log('targetId',targetId)

      // console.log('targets',targets)

      // const targetInfo = await browser.Target.getTargetInfo({targetId})
      // console.log('targetInfo',targetInfo.targetInfo)
      console.log('port',this.chromePort)
      // target:debugUrl
      const target = await this.createTarget('localhost',this.chromePort,false)
      console.log(target)
			this.chrome = await CDP({remote: true,host:'localhost',port:this.chromePort,target})
      console.log('Error here')
      // console.log(this.chrome)
      // this.browserContextId = await this.chrome.Target.createBrowserContext()
      //await this.chrome.Target.createTarget({url:'about:blank',browserContextId:this.browserContextId.browserContextId})
      this.logDev('0) New context created. Session is now isolated.')
			this.logDev('1) Chrome launched')
      try{
        console.log('Then')
        await this.chrome.Page.enable()
      }catch(e){
        console.log('Error ')
      }
			// console.log(await )
      console.log('testing')
      console.log('Enable chrome log',await this.chrome.Log.enable())
      // console.log(this.chrome.entryAdded)
      await this.chrome.Console.clearMessages();
      this.chrome.Console.messageAdded((params) => {
          console.log(params);
      });
      this.chrome.Log.entryAdded(function(logEntry){
        console.log(logEntry)
      })
			this.logDev('2) Page domain notification enabled')
			await this.chrome.Network.enable()
			this.logDev('3) Network enabled')
			await this.chrome.Network.setUserAgentOverride({userAgent:this.userAgent})
			this.logDev('4) UserAgent set'+this.userAgent)
      // console.log(this.chrome.Network)
      // {enabled:true}
      if(this.chrome.Network.setRequestInterception && typeof this.chrome.Network.setRequestInterception==="function"){
        await this.chrome.Network.setRequestInterception({patterns:[{urlPattern:'https://*'}]})
      }else{
        await this.chrome.Network.setRequestInterceptionEnabled({enabled:true})
      }
			
			this.logDev('5) Request intercepted enabled')
			this.chrome.Network.requestIntercepted(this.interceptRequest.bind(this))
			this.logDev('6) Watching request now')
			this.chrome.Network.clearBrowserCookies()
			this.logDev('7) Cookies deleted')
      // const jQueryData = await this.readFile('./resources/jquery.min.js')
      // await this.chrome.Page.addScriptToEvaluateOnLoad({ scriptSource: 'console.log(Lol);alert("ok")'});
      // await this.chrome.Page.addScriptToEvaluateOnLoad({ scriptSource: jQueryData});
      // await this.delay(2000)

      // console.log(jQueryData)
      // await this.chrome.Page.addScriptToEvaluateOnLoad({ scriptSource: jQueryData });
      // await this.chrome.Page.addScriptToEvaluateOnLoad({ scriptSource: "const jQuery = jQuery.noConflict();" });
      // await this.chrome.Page.addScriptToEvaluateOnLoad({ scriptSource: "console.log(jQuery);" });
      
			// const jQueryData = await this.readFile('./resources/jquery.min.js')
			// console.log(jQueryData)
			// let temp = await this.chrome.Page.addScriptToEvaluateOnNewDocument({source:jQueryData})
      // console.log(temp)
			// await this.chrome.Page.addScriptToEvaluateOnNewDocument({source:'window.test = true;'})
			// await this.chrome.Page.addScriptToEvaluateOnNewDocument({source:'window.$j = jQuery.noConflict()'})
			// this.logDev('8) Add jQuery for enrich library')
			return {statut:true}
		}catch(err){
      // console.log('Error whil')
			this.logDev(err)
      try{
        await this.killProcess(this.currentProcess.pid)
      }catch(e){
        console.log(e)
      }
			return {statut:false,message:`${err.message}`}
		}
	}
	/*
		Open an url and set scroll position to 0,0 (top of page)
	*/
	async open(url){
		try{
			await this.chrome.Page.navigate({url:url})
			this.logDev('Page open')
			await this.chrome.Page.loadEventFired()
			this.logDev('Page loaded')
			const js = "window.scrollTo(0,0)"
			const result = await this.chrome.Runtime.evaluate({expression: js,userGesture:true})
      let syn = await this.readFile(path.resolve(__dirname,'/lib/syn.js'))
      await this.chrome.Runtime.evaluate({expression: syn,userGesture:true})
      let jQuery = await this.readFile(path.resolve(__dirname,'/lib/jquery.min.js'))
      await this.chrome.Runtime.evaluate({expression: jQuery,userGesture:true})
			this.logDev('Scroll to 0,0')
			return {statut:true}
		}catch(err){
			this.logDev(err)
			return {statut:false,message:`${err.message}`}
		}
	}
	/*
		Set Aws credentials - todo
	*/
	setAwsCredentials(){

	}

	async evaluate(script){
		try{
			const result = await this.chrome.Runtime.evaluate({expression:script,userGesture:true})
      console.log('result evaluation',result)
			return {statut:true,result}	
		}catch(e){
      console.log(e)
			return {statut:false,error:e}
		}
	}
	/*
		Save current page to pdf - todo
	*/
	async saveToPdf(fileUrl){

	}
	/*
		Send request
	*/
	async send(params){
		let configRequest = {
			method:'GET'
		}
		let method = 'GET'
		let rep
		if(params.method)
			configRequest.method = params.method
		if(params.qs)
			configRequest.qs = params.qs
		if(params.proxy)
			configRequest.proxy = params.proxy
		if(params.headers)
			configRequest.headers = params.headers
		if(!params.url)
			return {statut:false,message:'Missing url in params'}
		if(params.url)
			configRequest.url = params.url
		if(params.form){
			configRequest.form = params.form
		}
		if(params.json){
			configRequest.json = params.json
		}
		try{
			rep = await request(configRequest)
		}catch(e){
			this.logDev(e)
			throw e
		}
		console.log(rep)
		return {statut:true}
	}	
	/*
		Take a screenshot of the page
	*/
	async screenshot(fileUrl,format=null,params=null){
		let base64Data 
		let writeResult
		const formatAllowed = ['jpeg','jpg','png']
		try{
			if(!format)
				format = 'jpeg'
			//clip:{x:0,y:0,width:this.viewPort.width,height:this.viewPort.height,scale:0.5}
			let paramsForCapture = {format:'jpeg',fromSurface:true}
			if(params && params.format && formatAllowed.indexOf(params.format)!=-1){
				paramsForCapture.format = params.format
			}
			if(params && params.clip && typeof params.clip.x==='number' && typeof params.clip.y==='number' && params.clip.width==='number' && params.clip.height==='number' && params.clip.scale==='number'){
				paramsForCapture.clip = clip
			}
			base64Data = await this.chrome.Page.captureScreenshot(paramsForCapture)
			this.logDev('Page captured')
		}catch(err){
			return {statut:false,message:`${err.message}`}
		}
		try{
			writeResult = await this.saveLocalFile(fileUrl,base64Data.data,'base64')
		}catch(err){
			this.logDev(err)
			return {statut:false,message:`${err.message}`}
		}
		this.logDev('File saved : '+fileUrl)
		return {statut:true,fileUrl:fileUrl}
	}

  async screenshotBase64(){
    let base64Data 
    let format = 'png'
    try{
      let paramsForCapture = {format:'png',fromSurface:true}
      base64Data = await this.chrome.Page.captureScreenshot(paramsForCapture)
      return {statut:true,data:'data:image/png;base64,'+base64Data.data}
    }catch(err){
      return {statut:false,message:`${err.message}`}
    }
  }

  async getPdf(){

  }

	async getCookies(url){
		let cookies
		if(url){
			cookies = await this.chrome.Network.getCookies(url)
		}else{
			cookies = await this.chrome.Network.getAllCookies()
		}
		return cookies
	}

	async setCookies(cookies){
		if(!cookies){
			return {statut:false,message:`cookies missing`}
		}
    let result = false
		// url, name, value, domain, path, secure, httpOnly, sameSite (Strict,lax), expirationDate
    // console.log(this.chrome.Network)
    if(cookies.length){
      try{
        for(let cookie in cookies){
          result = await this.chrome.Network.setCookie(cookie)
        }
        return {statut:true}
      }catch(err){
        this.logDev(err)
        return {statut:false,message:`${err.message}`}
      }
    }else{
      try{
        result = await this.chrome.Network.setCookie(cookies)
        return {statut:true}
      }catch(err){
        this.logDev(err)
        return {statut:false,message:`${err.message}`}
      }
    }
	}	

	async exists(selector){
		let js
		if(selector && selector.indexOf('/')!=-1){
			js = "document.evaluate('"+selector+"', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue"
		}else if(selector){
			js = "document.querySelector('"+selector+"')"
		}else{
			return {statut:false,message:`Missing selector`}
		}
    // console.log('js',js)
		const result = await this.chrome.Runtime.evaluate({expression:js})
    // console.log('Result exist is',result)
		if(result && result.result && result.result.objectId){
		    return {statut:true}
		}else{
		    return {statut:false,message:`selector ${selector} not found`}
		}	
	}

	async extract(data){
		// {
		// 	name:'name',
		// 	selector:'selector',
		// 	regex:'apply regex',
		// 	multi:true
		// 	children:[
		// 		{
		// 			name:'name',
		// 			selector:'',
		// 			regex:'apply regex',
		// 			multi:false
		// 		},
		// 		{
		// 			name:'name5',
		// 			selector:'selector_children_2',
		// 			multi:true
		// 			children:[
		// 				{
		// 					name:'experience_title'
		// 				}
		// 			]
		// 		}
		// 	]
		// }
	}


	async fetchText(selector){
		let js
		js = await this.exists(selector)
		if(!js.statut){
			return {statut:false}
		}
		if(selector && selector.indexOf('/')!=-1){
			js = "document.evaluate('"+selector+"', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue.innerHTML"
		}else if(selector){
			js = "document.querySelector('"+selector+"').innerHTML"
		}else{
			return {statut:false,message:`Missing selector`}
		}
		const result = await this.chrome.Runtime.evaluate({expression:js})
		console.log(result)
		if(result && result.result && result.result.value){
		    return {statut:true,value:result.result.value}
		}else{
		    return {statut:false,message:`No value found for ${selector}`}
		}
	}

	async focus(selector){
		const params = await this.chrome.DOM.getDocument()
		const options = {
		    nodeId: params.root.nodeId,
		    selector: selector
		}
		let attributes = []
		let nodeIds
		try{
			nodeIds = await this.chrome.DOM.querySelectorAll(options)
		}catch(err){
			this.logDev(err)
			throw err
		}
		nodeIds = nodeIds.nodeIds[0]
		const res = await this.chrome.DOM.focus({nodeId:nodeIds})
		console.log(res)
		return {statut:true}
	}

	async removeAttribute(selector,attribute){
    

		// const params = await this.chrome.DOM.getDocument()
		// const options = {
		//     nodeId: params.root.nodeId,
		//     selector: selector
		// }
		// let attributes = []
		// let nodeIds
		// try{
		// 	nodeIds = await this.chrome.DOM.querySelectorAll(options)
		// }catch(err){
		// 	this.logDev(err)
		// 	throw err
		// }
		// const result = await this.chrome.DOM.removeAttribute({nodeId:nodeIds.nodeIds[0],name:attribute})
    const exist = await this.exists(selector)
    if(exist){
      let js
      if(selector && selector.indexOf('/')!=-1 && attribute){
        // Xpath detected
        js = "document.evaluate("+selector+", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).removeAttribute('"+attribute+"')"
      }else if(selector && attribute){
        // Css detected 
        js = "document.querySelector('"+selector+"').removeAttribute('"+attribute+"')"
        console.log(js)
      }else{
        return {statut:false,message:`Missing selector or value`}
      }
      const result = await this.chrome.Runtime.evaluate({expression: js,userGesture:true})
      console.log(result)
      if(result.result && result.result.value){
        return {statut:true}
      }else{
        return {statut:false,message:`Selector ${selector} exists but an error occured`}
      }
    }else{
      return {statut:false,message:`selector ${selector} not found`}
    }
		return {statut:1}
	}

	async test(selector){
		const js = "document.evaluate('"+selector+"', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue"
		const result = await this.chrome.Runtime.evaluate({expression:js})
		console.log('result',result)

		if(result && result.result && result.result.objectId){
			// on recupere les attributs
			// if(typeof result.result.objectId==='string'){
			// 	try{
			// 		result.result.objectId = JSON.parse(result.result.objectId)
			// 	}catch(err){
			// 		throw err
			// 	}
			// }
			console.log('id found',result.result.objectId.id)
			const optionsNode = {
				objectId:result.result.objectId
			}
			const res = await this.chrome.DOM.requestNode(optionsNode)
			console.log('Attribute are',res)
			return true
		}else{
			console.log('ObjectId',result.result.objectId)
			console.log(typeof result.result.objectId)

			return true
		}
	}	

	async getAttributesBis(selector,attribute){
		let js
		js = await this.exists(selector)
		if(!js.statut){
			return {statut:false}
		}

		if(selector && selector.indexOf('/')!=-1){
			js = 
			"var tabElement = $x('"+selector+"');"+
			"var valueElement = [];"+
			"var cpt = 0;"+
			"for(var item of tabElement){"+
				"var res = {};"+
				"res.text = item.innerHTML;"+
				"res.value = item.value;"+
				"res.index = cpt;"+
				"cpt ++;"+
				"const attributes = item.attributes;"+
				"for(var key in attributes){"+
					"res[attributes[key].nodeName] = item.attributes[key].value;"+
				"}"+
				"valueElement.push(res);"+
			"}"+
			"window.completeAction = JSON.stringify(valueElement);"
		}else if(selector){
			js = 
			"var tabElement = document.querySelectorAll('"+selector+"');"+
			"var valueElement = [];"+
			"var cpt = 0;"+
			"for(var item of tabElement){"+
				"var res = {};"+
				"res.text = item.innerHTML;"+
				"res.value = item.value;"+
				"res.index = cpt;"+
				"cpt ++;"+
				"const attributes = item.attributes;"+
				"for(var key in attributes){"+
					"res[attributes[key].nodeName] = item.attributes[key].value;"+
				"}"+
				"valueElement.push(res);"+
			"}"+
			"window.completeAction = JSON.stringify(valueElement);"
		}else{
			return {statut:false,message:`Missing selector`}
		} 
		let result = await this.chrome.Runtime.evaluate({expression:js})
		console.log('result are',result)
		result = await this.waitForExpression('window.completeAction',5000)
		console.log('here result',result)
		if(result.statut){
			try{
				result = JSON.parse(result.value)
			}catch(e){
				result = result.value
			}
		}
		return {statut:1,value:result}
		// if(result && result.result && result.result.value){
		//     return {statut:true}
		// }else{
		//     return {statut:false,message:`No value found for ${selector}`}
		// }
	}

	async getAttributes(selector){
		const params = await this.chrome.DOM.getDocument()
		const options = {
		    nodeId: params.root.nodeId,
		    selector: selector
		}
		let attributes = []
		let nodeIds
		try{
			nodeIds = await this.chrome.DOM.querySelectorAll(options)
		}catch(err){
			this.logDev(err)
			throw err
		}
		if(nodeIds){
			for(let nodeId of nodeIds.nodeIds){
			    const optionsNode = {
			      nodeId: nodeId
			    }
			    let value
			    try{
			    	value =  await this.chrome.DOM.getAttributes(optionsNode)
			    	const left = await this.chrome.DOM.getOuterHTML(optionsNode)
			    	value.html = left
			    }catch(err){
			    	throw err
			    }
			    if(value && value.attributes){
			    	let attributesDetail = {}
			    	for(let i in value.attributes){
			    		if(i%2==0){
			    			attributesDetail[value.attributes[parseInt(i)]] = value.attributes[parseInt(i)+1]
			    		}
			    	}
			      	attributes.push(attributesDetail)
			    }
			}
		}
		return {statut:true,attributes}
	}

  async getAttribute(selector,attribute){
    const exist = await this.exists(selector)
    if(exist){
      let js
      if(selector && selector.indexOf('/')!=-1 && attribute){
        // Xpath detected
        js = "document.evaluate('"+selector+"', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).getAttribute('"+attribute+"')"
      }else if(selector && attribute){
        // Css detected 
        js = "document.querySelector('"+selector+"').getAttribute('"+attribute+"')"
        console.log(js)
      }else{
        return {statut:false,message:`Missing selector or value`}
      }
      const result = await this.chrome.Runtime.evaluate({expression: js,userGesture:true})
      console.log('get attribute',result)
      if(result.result && result.result.value){
        return {statut:true}
      }else{
        return {statut:false,message:`Selector ${selector} exists but an error occured`}
      }
    }else{
      return {statut:false,message:`selector ${selector} not found`}
    }
    return {statut:1}
  }

	async fill(selector,value){
		let js
		const exist = await this.exists(selector)
    const id = 'element_'+new Date().getTime()
    let result
		if(exist){
			if(selector && selector.indexOf('/')!=-1 && value){
				// Xpath detected
				js = "document.evaluate('"+selector+"', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue.value='"+value+"'"
			}else if(selector && value){
				// Css detected 
				// js = "document.querySelector('"+selector+"').value='"+value+"'"
        js = "syn.type(document.querySelector('"+selector+"'), \""+value+"\",function(){window['"+id+"']=true;})"
        console.log(js)
			}else{
				return {statut:false,message:`Missing selector or value`}
			}
			result = await this.chrome.Runtime.evaluate({expression: js,userGesture:true})
      console.log('Fill',result)

      if(result.result){
        result = await this.waitForExpression("window['"+id+"']",8000)
        console.log(result)
        if(result.statut){
          try{
            result = JSON.parse(result.value)
          }catch(e){
            result = result.value
          }
          console.log(result)
          return {statut:true}
        }else{
          return {statut:false}
        }
      }else{
        return {statut:false,message:`Selector ${selector} exists but an error occured`}
      }
		}else{
			return {statut:false,message:`selector ${selector} not found`}
		}
	}

  async getPosition(selector){
    let js
    const exist = await this.exists(selector)
    if(exist){
      if(selector && selector.indexOf('/')!=-1){
        // Xpath detected
        js = "var currentRect = document.evaluate('"+selector+"', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue.getBoundingClientRect());"
      }else if(selector){
        // Css detected 
        js = "var currentRect = document.querySelector('"+selector+"').getBoundingClientRect();"
      }else{
        return {statut:false,message:`Missing selector or value`}
      }
      js+= "window.currentRectValue = JSON.stringify({top:currentRect.top,left:currentRect.left,bottom:currentRect.bottom,width:currentRect.width,height:currentRect.height});"
      let result = await this.chrome.Runtime.evaluate({expression: js,userGesture:true})
      result = await this.waitForExpression('window.currentRectValue',5000)
      if(result.statut){
        try{
          result = JSON.parse(result.value)
        }catch(e){
          result = result.value
        }
      }
      return {statut:true,result}
      // if(result.result && result.result.value){
      //   return {statut:true,result}
      // }else{
      //   return {statut:false,message:`Selector ${selector} exists but an error occured`}
      // }
    }else{
      return {statut:false,message:`selector ${selector} not found`}
    }
  }
  

	async click(selector){
		let js
		const exist = await this.exists(selector)
		if(exist){
			if(selector && selector.indexOf('/')!=-1){
				// Xpath detected
				// js = "document.evaluate('"+selector+"', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue.click()"
			  js = "syn.click(document.evaluate('"+selector+"', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue))"
      }else if(selector){
				// Css detected 
        js = "syn.click(document.querySelector('"+selector+"'))"
				// js = "document.querySelector('"+selector+"').click()"
			}else{
				return {statut:false,message:`Missing selector`}
			}
			const result = await this.chrome.Runtime.evaluate({expression: js,userGesture:true})
			if(result.result && result.result.type){
				return {statut:true}
			}else{
				return {statut:false,message:`selector ${selector} exists but an error occured`}
			}
		}else{
			return {statut:false,message:`selector ${selector} not found`}
		}
	}

	delay(delay){
		return new Promise((resolve, reject) => {
			if(typeof delay==='object'){
				if(typeof delay.min==='number' && delay.max==='number'){
					// Get a number beetween min and max
					const delayValue = Math.floor(Math.random() * (delay.max - delay.min + 1) + delay.min)
					this.logDev(`Alea time generated : ${delayValue}`)
					setTimeout(()=>{
						this.logDev(`Wait : ${delayValue} ms`)
						resolve({statut:true})
					},delayValue)		
				}else{
					setTimeout(()=>{
						this.logDev(`Wait : ${delayValue} ms`)
						resolve({statut:true})
					},1000)		
				}
			}else if(typeof delay==='number'){
				setTimeout(()=>{
					this.logDev(`Wait : ${delay} ms`)
					resolve({statut:true})
				},delay)	
			}else{
				setTimeout(()=>{
					this.logDev(`Wait : ${delay} ms`)
					resolve({statut:true})
				},1000)	
			}
		})
	}

	async currentUrl(){
		let js = "window.location.href"
		const result = await this.chrome.Runtime.evaluate({expression: js,userGesture:true})
		if(result.result && result.result.value){
			return {statut:false,value:result.result.value}
		}else{
			return {statut:false,mesage:'An error occured while getting current url'}
		}
	}

	async scrollTo(params){
		// Set scrollView
		if(params && typeof params.x==="number" && typeof params.y==="number"){
			const js = "window.scrollTo(0,0)"
			const result = await this.chrome.Runtime.evaluate({expression: js,userGesture:true})
			this.logDev(`Scroll to ${JSON.stringify(params,null,"")}`)
			return {statut:true}
		}else{
			return {statut:false,message:'Missing params.'}
		}
	}

	async scrollToBottom(speed='slow'){
		// we get the final height of document
		let js
		let jsTab = []
		let result
		this.logDev(`Scroll begin with speed ${speed}`)
		const SCROLL_PARAMS = {slow:{interval:250,delay:30},fast:{interval:500,delay:10}}
		/*
			Getting scroll window height
		*/
		js = "document.body.scrollHeight"
		result = await this.chrome.Runtime.evaluate({expression: js,userGesture:true})
		if(!result || !result.result || result.result.type!='number'){
			return {statut:false,message:'No result found'}
		}
		let scrollHeight = result.result.value
		/*
			Getting scroll position
		*/
		js = "window.scrollY"
		result = await this.chrome.Runtime.evaluate({expression: js,userGesture:true})
		if(!result || !result.result || result.result.type!='number'){
			return {statut:false,message:'No result found'}
		}
		let scrollPosition =  result.result.value
		scrollHeight = scrollHeight - scrollPosition
		/*
			Setting maxInterval for scrolling with effect
		*/
		const maxInterval = Math.floor(scrollHeight / SCROLL_PARAMS[speed].interval)
		for(let i=0;i<maxInterval;i++){
			let interval = SCROLL_PARAMS[speed].interval+ Math.ceil(SCROLL_PARAMS[speed].interval*Math.random())
			let delayValue = SCROLL_PARAMS[speed].delay+ Math.ceil(SCROLL_PARAMS[speed].delay*Math.random())
			if(scrollHeight-interval>0){
				scrollHeight = scrollHeight - interval
				scrollPosition += interval
				jsTab.push({js:"setTimeout(function(){window.scrollTo(0,"+scrollPosition+");},"+delayValue+");",delay:delayValue})
			}else{
				interval = scrollHeight
				scrollHeight = 0
				scrollPosition += interval
				jsTab.push({js:"setTimeout(function(){window.scrollTo(0,"+scrollPosition+");},"+delayValue+");",delay:delayValue})
				break
			}
		}
		for(let item of jsTab){
			await this.chrome.Runtime.evaluate({expression:item.js,userGesture:true})	
			await this.delay(item.delay)
		}
		this.logDev(`Scroll end with`)
		return {statut:true}
	}

	async waitForElement(element,timeout){
		let found = (await this.exists(element)).statut
		console.log('Found ',found)
		let shouldContinue = true
		if(!timeout)
			timeout = 3000

		const timer = setTimeout(()=>{
			shouldContinue = false
		},timeout)	

		while(!found && shouldContinue){
			found = (await this.exists(element)).statut
			console.log(found)
		}
		if(found){
			clearTimeout(timer)
			return {statut:true}
		}else{
			return {statut:false,message:`Timeout while waiting for ${element} after ${timeout} ms`}
		}
	}

	async waitForExpression(expression,timeout){
		let found = await this.chrome.Runtime.evaluate({expression,userGesture:true})
		if(found && found.result)
			found = found.result.value
		if(!found){
			let shouldContinue = true
			const INTERVAL = 100
			let cpt = 0
			if(!timeout || typeof timeout !='number')
				timeout = 1000
			let maxCpt = Math.floor(timeout/INTERVAL)
			for(let i=0;i<maxCpt;i++){
				found = await this.chrome.Runtime.evaluate({expression,userGesture:true})
				if(found.result)
					found = found.result.value
				cpt ++
				if(found){
					break
				}else if(cpt>maxCpt){
					break
				}
				await this.delay(INTERVAL)
			}
			if(found){
				return {statut:true,value:found}	
			}else{
				return {statut:false,message:`Timeout while waiting for expression ${expression} after ${timeout} ms`}
			}
		}else{
			return {statut:true,value:found}
		}
	}

	async waitForNewPage(timeout){
		let shouldContinue = true
		if(!timeout)
			timeout = 3000
		const timer = setTimeout(()=>{
			shouldContinue = false
		},timeout)	
		let currentUrl = (await this.currentUrl()).value
		let newUrl = currentUrl
		while(currentUrl === newUrl && shouldContinue){
			newUrl = (await this.currentUrl()).value
			// console.log(newUrl)
		}
		if(newUrl != currentUrl){
			clearTimeout(timer)
			return {statut:true}	
		}else{
			return {statut:false,message:`Timeout while waiting for a new page after ${timeout} ms`}
		}
	}

  async injectJquery(){
    let result
    const jQueryData = await this.readFile('./resources/jquery.min.js')
    console.log('jQuery inject',await this.chrome.Runtime.evaluate({expression: jQueryData}))
    await this.delay(1500)
    console.log('jQuery inject step 2',await this.chrome.Runtime.evaluate({expression:'const jQuery = jQuery.noConflict();'}))
    result = await this.chrome.Runtime.evaluate({expression: 'jQuery'})
    console.log('jQuery value',result)
    return true
  }
	// 
	async interceptRequest(params){
		this.logRequest(params)
		let continueParams = {interceptionId:params.interceptionId}
    try{
      if(params.authChallenge && params.authChallenge.source==='Proxy'){
        	if(this.proxyConfiguration && params.authChallenge.origin===this.proxyConfiguration.url){
  	        continueParams.authChallengeResponse = {
  		        response:'ProvideCredentials',
  		        username:this.proxyConfiguration.username,
  		        password:this.proxyConfiguration.password
  	        }
        	}else{
  	        // Stop navigation
  	        continueParams.authChallengeResponse = {
  	          response:'CancelAuth'
  	        }
        	}
        	this.logRequest('************************\nResponse to '+continueParams.interceptionId+'\n'+JSON.stringify(continueParams,null,"")+'\n************************')
        	this.chrome.Network.continueInterceptedRequest(continueParams)
      }else{
      	  this.logRequest('************************\nResponse to '+continueParams.interceptionId+'\n'+JSON.stringify(continueParams,null,"")+'\n************************')
        	try{
            this.chrome.Network.continueInterceptedRequest(continueParams)
          }catch(e){
            console.log(e)
          }
      }
    }catch(e){
      console.log('An error occured in interceptRequest')
      console.log(e)
    }
	}

  killProcess(pid){
    return new Promise((resolve, reject) => {
      if(pid){
        console.log('pid to kill',pid)
        console.log(this.currentProcess.kill())
        resolve(true)
        // process.kill(pid)
        // sp.exec(`kill ${pid}`,(err,stdout,stderr)=>{
        //   if(err){
        //     console.log('kill process error',err)
        //     reject(err)
        //   }
        //   resolve({stdout,stderr})
        // })
      }
    });
  }

	async close(){
      this.logDev('Closing Chrome')
      try{
        await this.chrome.close()
      }catch(e){
        console.log('Already closed')
        console.log(e)
      }
      try{
        await this.killProcess(this.currentProcess.pid)
      }catch(e){
        console.log(e)
      }
      return true
				
	}

  uploadToS3(data){
    return new Promise((resolve, reject) => {
      let name = 'screenshot_'+hat()+'_'+(new Date()).getTime()+'.png'
      const params = {
        Key : name,
        Body : data,
        Bucket : 'cynthiagrowthmachine',
        ACL:'public-read-write',
        ContentType: "image/png",
        ContentEncoding: "base64"
      }
      s3.putObject(params, function(err, response) {
        if(err){
          resolve(null)
        }else{
          response.fileName = name
          resolve(response)
        }
      })
    })
  }
}

module.exports = Chrome