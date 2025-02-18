const hbx = require("../hbxBridge.js")
const Disposable = require("./disposable.js");
const TextEditor = require("./texteditor.js").TextEditor;
const OutputChannel = require('./sashview.js').OutputChannel;
const workspace = require("./workspace");

let messageCallbacks = {};
let messageId = 0;

let g_viewId2DataProvider = new Map();
let g_treeItemId = 0;
let g_treeId2Item = new Map();

function _init(connection){
	connection.onRequest("window/setSelectedItem",function(params){
		if(params.id in messageCallbacks){
			messageCallbacks[params.id](params.item);
			delete messageCallbacks[params.id];
		}
	});

	connection.onRequest("treeview/getChildren", function(params) {
		return getChildren(params.viewid, params.data);
	});

	connection.onRequest("treeview/showItem", function(params) {
		return showTreeItem(params.viewid, params.data, params.preview);
	});
}

/**
 * @param {String} text
 * @param {Number} hideAfterTimeout
 */
function setStatusBarMessage(text, hideAfterTimeout, level) {
	hbx.request("window.setStatusBarMessage", {
		text: text,
		hideAfterTimeout: hideAfterTimeout,
		level: level
	});
	return new Disposable(function(){
		hbx.request("window.clearStatusBarMessage");
	});
}

function clearStatusBarMessage(){
	hbx.request("window.clearStatusBarMessage");
}

/**
 * @param {String} message
 * @param {String[]} buttons
 */
function _showMessage(type,message, buttons) {
	let id = "message-" + (messageId++);
	let result = new Promise((resolve, reject) => {
		hbx.request("window.showMessage", {
			type:type,
			message: message,
			buttons:buttons,
			id:id
		}).then((show)=>{
			if(show){
				messageCallbacks[id] = resolve;
			}
		},reject);
	});
	return result;
	
}
function showQuickPick(items,options){
	let id = "quick-pick-" + (messageId++);
	let result = new Promise((resolve, reject) => {
		hbx.request("window.showQuickPick", {
			items:items,
			options: options,
			id:id
		}).then((success)=>{
			if(success){
				messageCallbacks[id] = resolve;
			}
		},reject);
	});
	return result;
}
/**
 * @param {String} message
 * @param {String[]} buttons
 */
function showErrorMessage(message, buttons) {
	return _showMessage("error",message,buttons);
}

function showWarningMessage(message, buttons){
	return _showMessage("warn",message,buttons);
}
/**
 * @param {String} message
 * @param {String[]} buttons
 */
function showInformationMessage(message, buttons) {
	return _showMessage("info",message,buttons);
}

function getActiveTextEditor() {
	let result = new Promise((resolve, reject) => {
		hbx.request("window.getActiveTextEditor").then((resp)=>{
			let editor = new TextEditor(resp);
			resolve(editor);
		},reject);
	});
	return result;
}

function showTextDocument(doc){
	return hbx.request("window.showTextDocument",doc);
}

function createOutputChannel(channel){
	return new OutputChannel(channel);
}

/**
 * 
 * @param {String} id 
 * @param {TreeDataProvider} provider 
 */
function createTreeView(id, options) {
	g_viewId2DataProvider.set(id, options.treeDataProvider);

	if(options.treeDataProvider.onDidChangeTreeData) {
		options.treeDataProvider.onDidChangeTreeData(async function(item) {
			await hbx.request("view.refresh", {
				innerId: item ? item.innerId: -1,
				id: id});

			//if(item && item.hasOwnProperty("isDirectory") && !item.isDirectory) {
				if(item.resourceUri)
					workspace.closeTextDocument(item.resourceUri.external);
			//}
		})
	}
}

/**
 * 
 * @param {String} id 
 * @param {TreeViewOptions<unknown>} options 
 */
function registerTreeDataProvider(id, options) {
	g_viewId2DataProvider.set(id, options);

	if(options.treeDataProvider.onDidChangeTreeData) {
		options.treeDataProvider.onDidChangeTreeData(async function(innerId) {
			await hbx.request("view.refresh", {
				innerId: item ? item.innerId: -1,
				id: id});
			if(item.resourceUri)
				workspace.closeTextDocument(item.resourceUri.external);
		})
	}
}

/**
 * 
 * @param {String} id 
 */
function getTreeDataProvider(id) {
	return g_viewId2DataProvider.get(id);
}

/**
 * 
 * @param {String} id 
 * @param {any} element 
 */
async function getChildren(id, element) {
	let treeDataProvider = g_viewId2DataProvider.get(id);
	let items = [];
	if(treeDataProvider) {	

		if(element)
			element = g_treeId2Item.get(element.innerId);

		let result = await treeDataProvider.getChildren(element);
		for (let i = 0; i < result.length; ++i) {
			let item = result[i];
			let treeItem = treeDataProvider.getTreeItem(item);

			item.innerId = g_treeItemId;
			treeItem.innerId = g_treeItemId;
			g_treeId2Item.set(g_treeItemId++, item);

			items.push(treeItem);
		}
		return items;
	}
}

async function showTreeItem(id, element, preview) {
	let treeDataProvider = g_viewId2DataProvider.get(id);
	if(element)
		element = g_treeId2Item.get(element.innerId);
	if(treeDataProvider) {
		let document = await treeDataProvider.provideTextDocumentContent(element.resource.uri);
		hbx.request("workspace.openRemoteDocument", {
			uri: element.resource.uri.toString(),
			context: document,
			preview: preview
		});
	}	
}

/**
 * 
 * @param {String} id containerid
 */
function showView(params) {
	hbx.request("window.showView", params);
}

let activeWindow = new Proxy({
	init:_init,
	setStatusBarMessage: setStatusBarMessage,
	clearStatusBarMessage:clearStatusBarMessage,
	showErrorMessage: showErrorMessage,
	showInformationMessage: showInformationMessage,
	showWarningMessage:showWarningMessage,
	showQuickPick:showQuickPick,
	getActiveTextEditor: getActiveTextEditor,
	showTextDocument:showTextDocument,
	createOutputChannel:createOutputChannel,
	createTreeView:createTreeView,
	registerTreeDataProvider:registerTreeDataProvider,
	showView:showView
}, {
	get: function(target, name) {
		if (name in target) {
			return target[name];
		}
		let getProperty = {
			activeTextEditor: function() {
				return new Proxy({}, {
					get: function(target, name) {
						if (name in TextEditor) {
							return TextEditor[name]();
						}
						return undefined;
					}
				});
			}
		}
		if (name in getProperty) {
			return getProperty[name]();
		}
		return undefined;
	}
});

module.exports = activeWindow;
