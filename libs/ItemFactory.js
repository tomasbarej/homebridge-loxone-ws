"use strict";
var exports = module.exports = {};
exports.AbstractItem = require('../items/AbstractItem.js');
//Important: name the exports identical to Loxone type to have an automatic match
//If not possible, define in checkCustomAttrs which will override in certain cases
exports.TemperatureSensor = require('../items/TemperatureSensorItem.js');
exports.HumiditySensor = require('../items/HumiditySensorItem.js');
exports.Switch = require('../items/SwitchItem.js');
exports.Lightbulb = require('../items/LightbulbItem.js');
exports.Dimmer = require('../items/DimmerItem.js');
exports.Jalousie = require('../items/BlindsItem.js');
exports.Pushbutton = require('../items/PushbuttonItem.js');
exports.Colorpicker = require('../items/ColorpickerItem.js');


exports.Factory = function(LoxPlatform, homebridge) {
    this.platform = LoxPlatform;
    this.log = this.platform.log;
    this.homebridge = homebridge;
    this.itemList = {};
    this.catList = {};
    this.roomList = {};
    //this.uniqueIds = [];
};

//TODO: we could also get this information from the websocket, avoiding the need of an extra request.

exports.Factory.prototype.sitemapUrl = function() {
    var serverString = this.platform.host;
    var serverPort = this.platform.port;
    if (this.platform.username && this.platform.password) {
        serverString = encodeURIComponent(this.platform.username) + ":" + encodeURIComponent(this.platform.password) + "@" + serverString + ":" + serverPort;
    }

    return this.platform.protocol + "://" + serverString + "/data/LoxApp3.json";
};

exports.Factory.prototype.parseSitemap = function(jsonSitemap) {

    //this is the function that gets called by index.js
    //first, parse the Loxone JSON that holds all controls
    exports.Factory.prototype.traverseSitemap(jsonSitemap, this);
    //now convert these controls in accessories
    var accessoryList = [];
    for (var key in this.itemList) {
        if (this.itemList.hasOwnProperty(key)) {
            //process additional attributes
            this.itemList[key] = exports.Factory.prototype.checkCustomAttrs(this, key, this.platform, this.catList);

            if (!(this.itemList[key].type in exports)){
                this.log("Platform - The widget '" + this.itemList[key].name + "' of type " + this.itemList[key].type + " is an item not handled.");
                continue;
            }
            if (this.itemList[key].skip) {
                this.log("Platform - The widget '" + this.itemList[key].name + "' of type " + this.itemList[key].type + " was skipped.");
                continue;
            }

            var accessory = new exports[this.itemList[key].type](this.itemList[key], this.platform, this.homebridge);
            this.log("Platform - Accessory Found: " + this.itemList[key].name);

            if (accessoryList.length > 100) {
                // https://github.com/nfarina/homebridge/issues/509
                throw new Error("You have more than 100 accessories for this bridge, which is not allowed by HomeKit. Try to filer out unneeded accessories.");
            }

            accessoryList.push(accessory);
        }
    }
    return accessoryList;
};


exports.Factory.prototype.checkCustomAttrs = function(factory, itemId, platform, catList) {
    var item = factory.itemList[itemId];
    //this function will make accesories more precise based on other attributes
    //eg, all InfoOnlyAnalog items which start with the name 'Temperat' are considered temperature sensors
    if (item.name.startsWith(platform.temperaturePrefix)) {
        item.type = "TemperatureSensor";

    } else if (item.name.startsWith(platform.humidityPrefix)) {
        item.type = "HumiditySensor";

    } else if (catList[item.cat] !== undefined && catList[item.cat].image === "00000000-0000-0002-2000000000000000.svg") {
        //this is the lightbulb image, which means that this is a lightning control
        if(item.type === "Switch") {
            item.type = "Lightbulb";
        }
    } else if (item.parentType === "LightController" || item.parentType === "LightControllerV2") {
        //this is a subcontrol of a lightcontroller
        if(item.type === "Switch") {
            item.type = "Lightbulb";
        } else if (item.type === "ColorPickerV2") { // Handle the new ColorPickerV2 which replaces the colorPicker in the new LightControllerV2
            item.type = "Colorpicker";
        }
    }

    if (item.type === "EIBDimmer") {
        item.type = "Dimmer"
    }

    if(item.name.indexOf("Loxone") !== -1) {
        //this is a Loxone status or temperature, I don't need these in Siri
        item.skip = true;
    }

    item.manufacturer = "Loxone";

    return item;
};


exports.Factory.prototype.traverseSitemap = function(jsonSitmap, factory) {

    //this function will simply add every control and subControl to the itemList, holding all its information
    //it will also store category information, as we will use this to decide on correct Item Type
    for (var sectionKey in jsonSitmap) {
        if (jsonSitmap.hasOwnProperty(sectionKey)) {
            if (sectionKey === "cats") {
                var cats = jsonSitmap[sectionKey];
                for (var catUuid in cats) {
                    if (cats.hasOwnProperty(catUuid)) {
                        factory.catList[catUuid] = cats[catUuid];
                    }
                }
            } else if (sectionKey === "rooms") {
                var rooms = jsonSitmap[sectionKey];
                for (var roomUuid in rooms) {
                    if (rooms.hasOwnProperty(roomUuid)) {
                        factory.roomList[roomUuid] = rooms[roomUuid];
                    }
                }
            } else if (sectionKey === "controls") {
                var controls = jsonSitmap[sectionKey];
                for (var controlUuid in controls) {
                    if (controls.hasOwnProperty(controlUuid)) {
                        var control = controls[controlUuid],
                            controlRoom = "'No Room'";

                        // The controls room is not defined if the room "Not used" is assigned via the Config
                        if (control.room) {
                            controlRoom = factory.roomList[control.room];
                        }

                        // Append the room name to the name for better identification
                        control.name += (" in " + controlRoom.name);
                        factory.itemList[controlUuid] = control;

                        // Check if the control has any subControls like LightController(V2)
                        if (control.subControls) {
                            for (var subControlUuid in control.subControls) {
                                if (control.subControls.hasOwnProperty(subControlUuid)) {
                                    var subControl = control.subControls[subControlUuid];
                                    subControl.parentType = control.type;

                                    // Append the name of its parent control to the subControls name
                                    subControl.name += (" of " + control.name);
                                    factory.itemList[subControlUuid] = subControl;
                                }
                            }
                        }
                    }
                }
            }
        }
    }
};