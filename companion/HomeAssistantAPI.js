import * as messaging from "messaging";
import { gettext } from "i18n";
import { sendData, isEmpty } from "../common/utils";

const Groups = {
    switch: "switch",
    light: "light",
    group: "homeassistant",
    script: "script",
    automation: "automation",
    cover: "cover",
}

const NextStateOverrides = {
    script: "turn_on",
    automation: "trigger",
}

const ForcedStates = {
    turn_on: "on",
    turn_off: "off",
    close_cover: "closed",
    open_cover: "open",
}

function HomeAssistantAPI(url, port, token, force) {
    let self = this;
    self.setup(url, port, token, force);
}

HomeAssistantAPI.prototype.setup = function(url, port, token, force) {
    let self = this;
    self.changeUrl(url);
    self.changePort(port);
    self.changeToken(token);
    self.changeForce(force);
}

HomeAssistantAPI.prototype.changeUrl = function(url) {
    let self = this;
    if (url !== undefined) {
        self.url = url;
    }
    else {
        self.url = '127.0.0.1';
    }
}

HomeAssistantAPI.prototype.changePort = function(port) {
    let self = this;
    if (port !== undefined) {
        self.port = port;
    }
    else {
        self.port = '8123';
    }
}

HomeAssistantAPI.prototype.changeToken = function(token) {
    let self = this;
    if (token !== undefined) {
        self.token = token;
    }
    else {
        self.token = '';
    }
}

HomeAssistantAPI.prototype.changeForce = function(force) {
    let self = this;
    if (force !== undefined) {
        self.force = force;
    }
    else {
        self.force = false;
    }
}

HomeAssistantAPI.prototype.address = function() {
    let self = this;
    return self.url + ':' + self.port
}

HomeAssistantAPI.prototype.fetchEntity = function(entity) {
    let self = this;
    fetch(`${self.address()}/api/states/${entity}`, {
        method: "GET",
        headers: {
            "Authorization": `Bearer ${self.token}`,
            "content-type": "application/json",
        }
    })
    .then(async(response) => {
        if (response.ok) {
            let data = await response.json();
            let msgData = {
                key: "add",
                id: data["entity_id"],
                name: data["entity_id"],
                state: data["state"],
            };
            if (data["attributes"] && data["attributes"]["friendly_name"]) {
                msgData.name = data["attributes"]["friendly_name"];
            }
            if (data["entity_id"].startsWith("script")) {
                msgData.state = 'exe'
            }
            else if (data["entity_id"].startsWith("automation")) {
                msgData.state = 'exe'
            }
            sendData(msgData);
        }
        else {
            console.log(`[fetchEntity] ${gettext("error")} ${response.status}`);
        }
    })
    .catch(err => console.log('[fetchEntity]: ' + err));
}

HomeAssistantAPI.prototype.fetchApiStatus = function() {
    let self = this;
    fetch(`${self.address()}/api/config`, {
        method: "GET",
        headers: {
            "Authorization": `Bearer ${self.token}`,
            "content-type": "application/json",
        }
    })
    .then(async(response) => {
        let data = await response.json();
        if (response.status === 200) {
            sendData({key: "api", value: "ok", name: data["location_name"]});
        }
        else {
            const json = JSON.stringify({
                key: "api",
                value: `${gettext("error")} ${response.status}`
            });
            sendData(json);
        }
    })
    .catch(err => {
        console.log('[fetchApiStatus]: ' + err);
        sendData({key: "api", value: gettext("connection_error")});
    })
}

HomeAssistantAPI.prototype.changeEntity = function(entity, state) {
    let self = this;
    const json = JSON.stringify({
        entity_id: `${entity}`
    });
    const domain = entity.split('.')[0];
    const group = Groups[domain];
    state = NextStateOverrides[domain] || state;
    //DEBUG console.log(`SENT ${url}/api/services/${group}/${state} FOR ${entity}`);
    fetch(`${self.address()}/api/services/${group}/${state}`, {
        method: "POST",
        body: json,
        headers: {
            "Authorization": `Bearer ${self.token}`,
            "content-type": "application/json",
        }
    })
    .then(async(response) => {
        if (response.ok) {
            let data = await response.json();
            //DEBUG console.log('RECEIVED ' + JSON.stringify(data));
            if (self.force) {
                let msgData = {
                    key: "change",
                    id: entity,
                    state: ForcedStates[state] || state,
                };
                if (!entity.startsWith("script") && !entity.startsWith("automation")) {
                    //DEBUG console.log('FORCED ' + JSON.stringify(msgData));
                    sendData(msgData);
                }
            }
            else if (!isEmpty(data)) {
                data.forEach(element => {
                    if (element["entity_id"] === entity) {
                        let msgData = {
                            key: "change",
                            id: element["entity_id"],
                            state: element["state"],
                        };
                        if (!element["entity_id"].startsWith("script") && !element["entity_id"].startsWith("automation")) {
                            sendData(msgData);
                        }
                    }
                })
            }
        }
        else {
            console.log(`[changeEntity] ${gettext("error")} ${response.status}`);
        }
    })
    .catch(err => console.log('[changeEntity]: ' + err));
}

module.exports = HomeAssistantAPI;
