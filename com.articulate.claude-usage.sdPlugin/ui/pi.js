/* Shared Property Inspector runtime: registration, settings binding, messaging. */
/* global document, window, WebSocket */
"use strict";

let websocket = null;
let piUUID = null;
let actionInfo = null;
let settings = {};
const messageHandlers = [];

function sendJson(payload) {
  if (websocket && websocket.readyState === 1) websocket.send(JSON.stringify(payload));
}

function saveSettings() {
  sendJson({ event: "setSettings", context: piUUID, payload: settings });
}

window.piOnMessage = function piOnMessage(handler) {
  messageHandlers.push(handler);
};

window.piSendToPlugin = function piSendToPlugin(payload) {
  sendJson({
    event: "sendToPlugin",
    action: actionInfo && actionInfo.action,
    context: piUUID,
    payload,
  });
};

function applySettingsToForm() {
  document.querySelectorAll("[data-setting]").forEach((el) => {
    const key = el.getAttribute("data-setting");
    const value = settings[key];
    if (el.type === "checkbox") el.checked = Boolean(value);
    else if (value !== undefined && value !== null) el.value = String(value);
  });
}

function bindForm() {
  document.querySelectorAll("[data-setting]").forEach((el) => {
    const key = el.getAttribute("data-setting");
    const handler = () => {
      let value;
      if (el.type === "checkbox") value = el.checked;
      else if (el.type === "number") {
        value = el.value === "" ? undefined : Number(el.value);
        if (Number.isNaN(value)) value = undefined;
      } else value = el.value;
      if (value === undefined || value === "") delete settings[key];
      else settings[key] = value;
      saveSettings();
    };
    el.addEventListener("change", handler);
    if (el.tagName === "TEXTAREA" || el.type === "text") el.addEventListener("input", handler);
  });
}

window.connectElgatoStreamDeckSocket = function (inPort, inUUID, inRegisterEvent, inInfo, inActionInfo) {
  piUUID = inUUID;
  actionInfo = JSON.parse(inActionInfo);
  settings = (actionInfo.payload && actionInfo.payload.settings) || {};
  websocket = new WebSocket("ws://127.0.0.1:" + inPort);

  websocket.onopen = () => {
    sendJson({ event: inRegisterEvent, uuid: inUUID });
    applySettingsToForm();
    bindForm();
    if (window.piReady) window.piReady();
  };

  websocket.onmessage = (msg) => {
    let data;
    try {
      data = JSON.parse(msg.data);
    } catch {
      return;
    }
    if (data.event === "didReceiveSettings") {
      settings = (data.payload && data.payload.settings) || {};
      applySettingsToForm();
    }
    if (data.event === "sendToPropertyInspector") {
      messageHandlers.forEach((h) => h(data.payload));
    }
  };
};
