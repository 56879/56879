const hbx = require('./hbxBridge.js');
const qDebug = hbx.qDebug;
const constants = require('./constants.js');
let plugins = {}

function PluginContext(id){
    this.subscriptions = [];
    this.id = id;
    this.dispose = function(){
        if(this.subscriptions.length > 0){
            let pluginId = this.id;
            this.subscriptions.forEach(function(item){
                if(item && item.dispose && typeof item.dispose === 'function'){
                    item.dispose();
                }
            });
        }
    }
}

function _init(connection){
	connection.onRequest("plugin/activate", function(param){
	    return _activatePlugin(param)
	});
	//deactivate
	connection.onRequest("plugin/deactivate", function(param){
	    console.log("deactivate plugin:" + JSON.stringify(param));
	    return _deactivatePlugin(param)
	});
}

function _activatePlugin(pluginInfo){
    const id = pluginInfo.id;
    if(!id || id.length == 0){
        console.error("Must contains a valid id in plugin info!");
        return false;
    }
	let pluginsDir = constants.pluginsDir;
	let pluginPath = pluginsDir + '/' + id;
	if(pluginInfo.path){
		pluginPath = pluginInfo.path;
	}
	const plugin = require(pluginPath);
	if(!plugin || !plugin.activate){
		console.error("Not a valid plugin package.");
		return false;
	}
	plugins[id] = {
		instance:plugin,
		context:new PluginContext(id)
	}
	if(plugin && plugin.activate && !plugin.activated ){
		plugin.activate(plugins[id].context);
		plugin.activated = true;
	}
    return plugin.activated;
}

function _deactivatePlugin(pluginInfo){
    const id = pluginInfo.id;
    if(!id || id.length == 0){
        console.error("Must contains a valid id in plugin info!");
        return false;
    }
    try{
        const pluginBundle = plugins[id];
        if(!pluginBundle || !pluginBundle.instance){
            console.error("Not a valid plugin package.");
            return false;
        }
        let plugin = pluginBundle.instance;
        if(plugin.deactivate && plugin.activated){
            plugin.deactivate();
            plugin.activated = false;
        }
        pluginBundle.context.dispose();
        plugins[id] = undefined;
    }catch(e){
        //TODO handle the exception
        console.error(e.message);
        return false;
    }
    return true;
}

module.exports = {
	init:_init,
    activatePlugin:_activatePlugin,
    deactivatePlugin:_deactivatePlugin
}