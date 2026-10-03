#include <Wire.h>
#include <Adafruit_ADS1X15.h>
#include <Preferences.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <ArduinoJson.h>
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_GC9A01A.h>
#include <WiFi.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include <WebSocketsServer.h>  // library "WebSockets" oleh Markus Sattler (links2004)
#include "web_assets.h"        // kontroler web (gzip), dibuat oleh tools/embed_web.py

// Aktif-low untuk papan relay umum. Balik jika katup terbalik.
#define RELAY_ON LOW
#define RELAY_OFF HIGH

#define PIN_FILL_F 25
#define PIN_DUMP_F 26
#define PIN_FILL_R 27
#define PIN_DUMP_R 14
#define PIN_COMP 13
#define PIN_ACC 34

#define TFT_CS 5
#define TFT_DC 16
#define TFT_RST 17

#define PSI_MIN_V 0.5f
#define PSI_MAX_V 4.5f
#define PSI_RANGE 200.0f
#define DEADBAND 2.0f
#define FILL_TIMEOUT_MS 90000
#define BAG_MIN 15
#define BAG_MAX 110
#define TANK_ON 145
#define TANK_OFF 165

#define SERVICE_UUID "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define RX_UUID "6e400002-b5a3-f393-e0a9-e50e24dcca9e"
#define TX_UUID "6e400003-b5a3-f393-e0a9-e50e24dcca9e"

// WiFi: SoftAP selalu aktif, STA (router/hotspot) opsional lewat perintah {"cmd":"wifi",...}
#define AP_SSID "RZMONG-AIR"
#define AP_PASS_DEFAULT "rzmong123"
#define MDNS_NAME "rzmong-air"
#define HTTP_PORT 80
#define WS_PORT 81

Adafruit_ADS1115 ads;
Adafruit_GC9A01A tft(TFT_CS, TFT_DC, TFT_RST);
Preferences prefs;
BLECharacteristic *txChar;
bool bleConnected = false;
bool displayOk = false;

struct Preset { int front; int rear; };
Preset presets[3] = {{25, 25}, {50, 55}, {75, 80}};
int activePreset = 1;
bool riseOnStart = true;
bool dropOnStop = false;
int theme = 1;

float tankPsi = 0, frontPsi = 0, rearPsi = 0;
bool accOn = false, accWas = false;
bool fillingF = false, fillingR = false;
uint32_t fillStartF = 0, fillStartR = 0;
String fault = "";
String rxLine;

WebServer http(HTTP_PORT);
WebSocketsServer ws(WS_PORT);
String staSsid, staPass, apPass;

class RxCb : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *c) override {
    String v = c->getValue().c_str();
    rxLine += v;
  }
};

class ServerCb : public BLEServerCallbacks {
  void onConnect(BLEServer *) override { bleConnected = true; }
  void onDisconnect(BLEServer *s) override {
    bleConnected = false;
    s->startAdvertising();
  }
};

struct Cal { float v0; float vRef; float pRef; bool ready; };
Cal cal[3] = {
  {0.50f, 4.50f, 200.0f, false},
  {0.50f, 4.50f, 200.0f, false},
  {0.50f, 4.50f, 200.0f, false}
};

float voltsToPsi(uint8_t ch, int16_t raw) {
  float v = raw * 0.0001875f;
  float span = cal[ch].vRef - cal[ch].v0;
  if (span < 0.05f) return 0;
  float psi = (v - cal[ch].v0) * (cal[ch].pRef / span);
  return constrain(psi, 0, PSI_RANGE);
}

void setValve(int pin, bool on) { digitalWrite(pin, on ? RELAY_ON : RELAY_OFF); }

void allValvesOff() {
  setValve(PIN_FILL_F, false);
  setValve(PIN_DUMP_F, false);
  setValve(PIN_FILL_R, false);
  setValve(PIN_DUMP_R, false);
}

void savePrefs() {
  prefs.putBytes("presets", presets, sizeof(presets));
  prefs.putInt("preset", activePreset);
  prefs.putBool("rise", riseOnStart);
  prefs.putBool("drop", dropOnStop);
  prefs.putInt("theme", theme);
}

void loadPrefs() {
  prefs.begin("rzm", false);
  if (prefs.isKey("presets")) prefs.getBytes("presets", presets, sizeof(presets));
  activePreset = prefs.getInt("preset", 1);
  riseOnStart = prefs.getBool("rise", true);
  dropOnStop = prefs.getBool("drop", false);
  theme = prefs.getInt("theme", 1);
}

void applyAxle(float actual, int target, int fillPin, int dumpPin, bool &filling, uint32_t &started, const char *name) {
  target = constrain(target, BAG_MIN, BAG_MAX);
  if (actual < target - DEADBAND) {
    setValve(dumpPin, false);
    setValve(fillPin, true);
    if (!filling) { filling = true; started = millis(); }
    if (millis() - started > FILL_TIMEOUT_MS) {
      setValve(fillPin, false);
      filling = false;
      fault = String(name) + " bocor";
    }
  } else if (actual > target + DEADBAND) {
    setValve(fillPin, false);
    setValve(dumpPin, true);
    filling = false;
  } else {
    setValve(fillPin, false);
    setValve(dumpPin, false);
    filling = false;
    if (fault.startsWith(name)) fault = "";
  }
}

void buildStatus(JsonDocument &doc);
void applyWifiSta();

void handleLine(const String &line) {
  JsonDocument doc;
  if (deserializeJson(doc, line)) return;
  const char *cmd = doc["cmd"] | "";
  if (!strcmp(cmd, "preset")) {
    int id = doc["id"] | 1;
    activePreset = constrain(id, 0, 2);
    fault = "";
  } else if (!strcmp(cmd, "set")) {
    const char *axle = doc["axle"] | "front";
    int psi = doc["psi"] | 40;
    if (!strcmp(axle, "front")) presets[activePreset].front = constrain(psi, BAG_MIN, BAG_MAX);
    else presets[activePreset].rear = constrain(psi, BAG_MIN, BAG_MAX);
  } else if (!strcmp(cmd, "auto")) {
    riseOnStart = doc["rise"] | riseOnStart;
    dropOnStop = doc["drop"] | dropOnStop;
  } else if (!strcmp(cmd, "theme")) {
    theme = constrain((int)(doc["id"] | 1), 0, 2);
  } else if (!strcmp(cmd, "manual")) {
    const char *axle = doc["axle"] | "front";
    const char *action = doc["action"] | "stop";
    int fill = !strcmp(axle, "rear") ? PIN_FILL_R : PIN_FILL_F;
    int dump = !strcmp(axle, "rear") ? PIN_DUMP_R : PIN_DUMP_F;
    setValve(fill, !strcmp(action, "fill"));
    setValve(dump, !strcmp(action, "dump"));
    return;
  } else if (!strcmp(cmd, "stop")) {
    allValvesOff();
    return;
  } else if (!strcmp(cmd, "wifi")) {
    // {"cmd":"wifi","ssid":"Router","pass":"rahasia"} → sambung ke router (STA). ssid kosong = matikan STA.
    // {"cmd":"wifi","appass":"minimal8"} → ganti password SoftAP (berlaku setelah restart).
    if (doc["ssid"].is<const char *>()) {
      staSsid = (const char *)doc["ssid"];
      staPass = doc["pass"] | "";
      prefs.putString("ssid", staSsid);
      prefs.putString("spass", staPass);
      applyWifiSta();
    }
    if (doc["appass"].is<const char *>()) {
      String p = (const char *)doc["appass"];
      if (p.length() >= 8) { apPass = p; prefs.putString("appass", apPass); }
    }
    return;
  }
  savePrefs();
}

void pollBle() {
  while (rxLine.indexOf('\n') >= 0) {
    int n = rxLine.indexOf('\n');
    handleLine(rxLine.substring(0, n));
    rxLine.remove(0, n + 1);
  }
  static uint32_t last = 0;
  if (!bleConnected || millis() - last < 250) return;
  last = millis();
  JsonDocument doc;
  buildStatus(doc);
  char buf[220];
  size_t len = serializeJson(doc, buf, sizeof(buf));
  buf[len++] = '\n';
  buf[len] = 0;
  txChar->setValue((uint8_t *)buf, len);
  txChar->notify();
}

// Status yang sama untuk BLE dan WiFi.
void buildStatus(JsonDocument &doc) {
  doc["tank"] = round(tankPsi);
  doc["front"] = round(frontPsi);
  doc["rear"] = round(rearPsi);
  doc["preset"] = activePreset;
  doc["comp"] = digitalRead(PIN_COMP) == RELAY_ON;
  doc["rise"] = riseOnStart;
  doc["drop"] = dropOnStop;
  doc["theme"] = theme;
  doc["pf"] = presets[activePreset].front;
  doc["pr"] = presets[activePreset].rear;
  doc["fault"] = fault;
}

void drawGauge(int cx, int cy, int r, float psi, float maxPsi, const char *label, uint16_t color) {
  tft.drawCircle(cx, cy, r, color);
  tft.setTextColor(color);
  tft.setTextSize(1);
  tft.setCursor(cx - 18, cy - r + 8);
  tft.print(label);
  tft.setTextSize(2);
  tft.setCursor(cx - 16, cy - 6);
  tft.print((int)psi);
}

void drawDisplay() {
  if (!displayOk) return;
  static uint32_t last = 0;
  if (millis() - last < 200) return;
  last = millis();
  uint16_t bg = GC9A01A_BLACK;
  uint16_t fg = GC9A01A_WHITE;
  if (theme == 0) fg = GC9A01A_CYAN;
  if (theme == 2) fg = GC9A01A_RED;
  tft.fillScreen(bg);
  drawGauge(120, 120, 110, tankPsi, 200, "TANK", fg);
  tft.setTextSize(1);
  tft.setCursor(20, 200);
  tft.printf("F %d  R %d", (int)frontPsi, (int)rearPsi);
  if (fault.length()) {
    tft.setTextColor(GC9A01A_RED);
    tft.setCursor(20, 24);
    tft.print(fault);
  }
}

// ---------- WiFi: HTTP REST + WebSocket, protokol sama dengan BLE ----------
void handleLines(const String &text) {
  int start = 0;
  while (start < (int)text.length()) {
    int n = text.indexOf('\n', start);
    if (n < 0) n = text.length();
    String line = text.substring(start, n);
    line.trim();
    if (line.length()) handleLine(line);
    start = n + 1;
  }
}

String wifiStatusJson() {
  JsonDocument doc;
  buildStatus(doc);
  doc["ip"] = WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : WiFi.softAPIP().toString();
  doc["sta"] = WiFi.status() == WL_CONNECTED;
  doc["ble"] = bleConnected;
  String out;
  serializeJson(doc, out);
  return out;
}

void sendCors() {
  http.sendHeader("Access-Control-Allow-Origin", "*");
  http.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  http.sendHeader("Access-Control-Allow-Headers", "Content-Type");
  http.sendHeader("Access-Control-Allow-Private-Network", "true");
}

void serveAsset(const WebAsset &a) {
  http.sendHeader("Content-Encoding", "gzip");
  http.sendHeader("Cache-Control", "no-cache");
  http.send_P(200, a.mime, (const char *)a.data, a.len);
}

void wsEvent(uint8_t num, WStype_t type, uint8_t *payload, size_t len) {
  if (type == WStype_CONNECTED) {
    String s = wifiStatusJson() + "\n";
    ws.sendTXT(num, s);
  } else if (type == WStype_TEXT) {
    String text;
    text.reserve(len);
    for (size_t i = 0; i < len; i++) text += (char)payload[i];
    handleLines(text);
  }
}

void applyWifiSta() {
  if (staSsid.length()) {
    WiFi.mode(WIFI_AP_STA);
    WiFi.begin(staSsid.c_str(), staPass.c_str());
  } else {
    WiFi.disconnect();
    WiFi.mode(WIFI_AP);
  }
}

void setupWifi() {
  staSsid = prefs.getString("ssid", "");
  staPass = prefs.getString("spass", "");
  apPass = prefs.getString("appass", AP_PASS_DEFAULT);
  WiFi.mode(staSsid.length() ? WIFI_AP_STA : WIFI_AP);
  WiFi.softAP(AP_SSID, apPass.c_str());
  if (staSsid.length()) WiFi.begin(staSsid.c_str(), staPass.c_str());
  MDNS.begin(MDNS_NAME);

  http.on("/api/status", HTTP_GET, []() { sendCors(); http.send(200, "application/json", wifiStatusJson()); });
  http.on("/api/cmd", HTTP_POST, []() {
    sendCors();
    handleLines(http.arg("plain"));
    http.send(200, "application/json", wifiStatusJson());
  });
  http.on("/api/cmd", HTTP_OPTIONS, []() { sendCors(); http.send(204); });
  http.on("/api/status", HTTP_OPTIONS, []() { sendCors(); http.send(204); });
  http.on("/", HTTP_GET, []() { serveAsset(WEB_ASSETS[0]); });
  http.onNotFound([]() {
    String uri = http.uri();
    for (size_t i = 0; i < WEB_ASSET_COUNT; i++)
      if (uri == WEB_ASSETS[i].path) { serveAsset(WEB_ASSETS[i]); return; }
    sendCors();
    http.send(404, "text/plain", "tidak ada");
  });
  http.begin();
  ws.begin();
  ws.onEvent(wsEvent);
  MDNS.addService("http", "tcp", HTTP_PORT);
  Serial.printf("WiFi AP %s  IP %s\n", AP_SSID, WiFi.softAPIP().toString().c_str());
}

void pollWifi() {
  http.handleClient();
  ws.loop();
  static uint32_t last = 0;
  if (ws.connectedClients() == 0 || millis() - last < 250) return;
  last = millis();
  String s = wifiStatusJson() + "\n";
  ws.broadcastTXT(s);
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_FILL_F, OUTPUT);
  pinMode(PIN_DUMP_F, OUTPUT);
  pinMode(PIN_FILL_R, OUTPUT);
  pinMode(PIN_DUMP_R, OUTPUT);
  pinMode(PIN_COMP, OUTPUT);
  allValvesOff();
  setValve(PIN_COMP, false);
  pinMode(PIN_ACC, INPUT);
  loadPrefs();
  prefs.end();
  prefs.begin("rzmcal", true);
  if (prefs.isKey("cal")) prefs.getBytes("cal", cal, sizeof(cal));
  prefs.end();

  Wire.begin(21, 22);
  if (!ads.begin()) Serial.println("ADS1115 tidak ditemukan");
  ads.setGain(GAIN_TWOTHIRDS);

  SPI.begin(18, -1, 23);
  displayOk = true;
  tft.begin();  // Adafruit_GC9A01A tidak punya init(w,h); layar 240x240 tetap
  tft.setRotation(0);
  tft.fillScreen(GC9A01A_BLACK);

  BLEDevice::init("RZM-AIR");
  BLEServer *server = BLEDevice::createServer();
  server->setCallbacks(new ServerCb());
  BLEService *service = server->createService(SERVICE_UUID);
  BLECharacteristic *rx = service->createCharacteristic(RX_UUID, BLECharacteristic::PROPERTY_WRITE);
  rx->setCallbacks(new RxCb());
  txChar = service->createCharacteristic(TX_UUID, BLECharacteristic::PROPERTY_NOTIFY);
  txChar->addDescriptor(new BLE2902());
  service->start();
  server->getAdvertising()->start();
  setupWifi();
  Serial.println("RZM-AIR ready");
}

void loop() {
  tankPsi = voltsToPsi(0, ads.readADC_SingleEnded(0));
  frontPsi = voltsToPsi(1, ads.readADC_SingleEnded(1));
  rearPsi = voltsToPsi(2, ads.readADC_SingleEnded(2));

  bool accNow = analogRead(PIN_ACC) > 2500;
  if (accNow && !accWas && riseOnStart) activePreset = 1;
  if (!accNow && accWas && dropOnStop) activePreset = 0;
  accWas = accNow;
  accOn = accNow;

  if (tankPsi < TANK_ON) setValve(PIN_COMP, true);
  if (tankPsi > TANK_OFF) setValve(PIN_COMP, false);

  applyAxle(frontPsi, presets[activePreset].front, PIN_FILL_F, PIN_DUMP_F, fillingF, fillStartF, "depan");
  applyAxle(rearPsi, presets[activePreset].rear, PIN_FILL_R, PIN_DUMP_R, fillingR, fillStartR, "belakang");

  pollBle();
  pollWifi();
  drawDisplay();
  delay(40);
}
