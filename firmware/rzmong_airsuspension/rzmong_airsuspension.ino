#include <Wire.h>
#include <Adafruit_ADS1X15.h>
#include <Preferences.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <BLESecurity.h>
#include <esp_gap_ble_api.h>
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
#define FW_VERSION "0.3.0"

#define AP_SSID "RZMONG-AIR"
#define AP_PASS_DEFAULT "rzmong123"
#define MDNS_NAME "rzmong-air"
#define HTTP_PORT 80
#define WS_PORT 81

// ---------- Keamanan akses (kredensial disimpan di NVS namespace "rzmsec") ----------
// Default dipakai saat pertama kali flash atau setelah reset kredensial (tahan tombol BOOT).
#define ACCESS_CODE_DEFAULT "1234"   // kode akses UI/API (4–12 karakter)
#define BT_PIN_DEFAULT 123456        // PIN pairing Bluetooth (6 digit, passkey BLE)
#define AUTH_MAX_FAIL 5              // salah kode berturut-turut sebelum dikunci
#define AUTH_LOCK_MS 30000           // lama kunci setelah terlalu banyak salah
// Tombol BOOT papan ESP32 DevKit (esp32dev) = GPIO0, aktif-low. ESP32-C3 = GPIO9 (ubah kalau ganti papan).
// Hanya dibaca saat firmware sudah jalan; menahan BOOT ketika dinyalakan tetap masuk mode download.
#define PIN_BOOT 0
#define PIN_LED 2                    // LED biru bawaan DevKit (kalau ada)
#define BOOT_RESET_MS 8000           // tahan BOOT 8 detik → reset kredensial ke default

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

// Kredensial akses (jangan pernah dikirim di status JSON).
Preferences secPrefs;
String accessCode = ACCESS_CODE_DEFAULT;
uint32_t btPin = BT_PIN_DEFAULT;
uint8_t authFails = 0;
uint32_t authLockUntil = 0;
uint32_t apRestartAt = 0;        // >0 → SoftAP dinyalakan ulang dengan sandi baru pada millis() ini
uint32_t bootHoldMs = 0;         // lama tombol BOOT ditahan (untuk layar)
uint32_t resetNoticeUntil = 0;   // tampilkan "KREDENSIAL DIRESET" di layar sampai waktu ini

// Satu sesi per koneksi: BLE (satu HP), tiap klien WebSocket, dan tiap request HTTP.
struct Session { bool authed; const char *ev; };
Session bleSession = {false, nullptr};
#define WS_SLOTS 8
Session wsSession[WS_SLOTS];

class RxCb : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *c) override {
    String v = c->getValue().c_str();
    rxLine += v;
  }
};

class ServerCb : public BLEServerCallbacks {
  void onConnect(BLEServer *) override {
    bleConnected = true;
    bleSession = {false, nullptr};
  }
  void onDisconnect(BLEServer *s) override {
    bleConnected = false;
    bleSession = {false, nullptr};
    s->startAdvertising();
  }
};

// Pairing BLE dengan passkey statis (PIN 6 digit). Karakteristik RX/TX butuh link terenkripsi + MITM,
// jadi HP wajib pairing dengan PIN yang benar sebelum bisa kirim perintah atau menerima status.
class SecCb : public BLESecurityCallbacks {
  uint32_t onPassKeyRequest() override { return btPin; }
  void onPassKeyNotify(uint32_t) override { Serial.println("BLE: HP minta pairing, masukkan PIN Bluetooth di HP"); }
  bool onConfirmPIN(uint32_t) override { return false; }  // tidak ada layar konfirmasi angka → tolak numeric comparison
  bool onSecurityRequest() override { return true; }
  void onAuthenticationComplete(esp_ble_auth_cmpl_t r) override {
    if (r.success) Serial.println("BLE: pairing OK");
    else Serial.printf("BLE: pairing GAGAL (alasan 0x%x) — PIN salah?\n", r.fail_reason);
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

void buildStatus(JsonDocument &doc, Session *s = nullptr);
void applyWifiSta();

// ---------- kredensial ----------
bool sameSecret(const String &a, const char *b) {
  // Bandingkan tanpa berhenti di karakter pertama yang beda (mengurangi kebocoran waktu).
  size_t lb = strlen(b), n = a.length() > lb ? a.length() : lb;
  uint8_t diff = a.length() != lb;
  for (size_t i = 0; i < n; i++) diff |= (uint8_t)(i < a.length() ? a[i] : 0) ^ (uint8_t)(i < lb ? b[i] : 0);
  return diff == 0;
}

bool validCode(const String &c) {
  if (c.length() < 4 || c.length() > 12) return false;
  for (char ch : c) if (ch < 0x21 || ch > 0x7e) return false;  // ASCII terlihat, tanpa spasi
  return true;
}

bool validApPass(const String &p) {
  if (p.length() < 8 || p.length() > 63) return false;  // batas WPA2-PSK
  for (char ch : p) if (ch < 0x20 || ch > 0x7e) return false;
  return true;
}

bool credsAreDefault() {
  return accessCode == ACCESS_CODE_DEFAULT || btPin == BT_PIN_DEFAULT || apPass == AP_PASS_DEFAULT;
}

void applyBtPin() {
  uint32_t pk = btPin;
  esp_ble_gap_set_security_param(ESP_BLE_SM_SET_STATIC_PASSKEY, &pk, sizeof(pk));
}

// Hapus semua HP yang sudah pairing → HP wajib pairing ulang dengan PIN (baru).
void clearBleBonds() {
  int n = esp_ble_get_bond_device_num();
  if (n <= 0) return;
  esp_ble_bond_dev_t *list = (esp_ble_bond_dev_t *)malloc(sizeof(esp_ble_bond_dev_t) * n);
  if (!list) return;
  esp_ble_get_bond_device_list(&n, list);
  for (int i = 0; i < n; i++) esp_ble_remove_bond_device(list[i].bd_addr);
  free(list);
  Serial.printf("BLE: %d pairing lama dihapus\n", n);
}

void logoutAll() {
  bleSession.authed = false;
  for (int i = 0; i < WS_SLOTS; i++) wsSession[i].authed = false;
}

void loadCreds() {
  secPrefs.begin("rzmsec", false);
  accessCode = secPrefs.getString("code", ACCESS_CODE_DEFAULT);
  btPin = secPrefs.getUInt("btpin", BT_PIN_DEFAULT);
  if (!validCode(accessCode)) accessCode = ACCESS_CODE_DEFAULT;
  if (btPin > 999999) btPin = BT_PIN_DEFAULT;
  // Sandi SoftAP dulu disimpan di namespace "rzm" (firmware ≤0.2) → pindahkan sekali.
  if (secPrefs.isKey("appass")) apPass = secPrefs.getString("appass", AP_PASS_DEFAULT);
  else {
    Preferences old;
    old.begin("rzm", true);
    apPass = old.getString("appass", AP_PASS_DEFAULT);
    old.end();
    if (apPass != AP_PASS_DEFAULT && validApPass(apPass)) secPrefs.putString("appass", apPass);
  }
  if (!validApPass(apPass)) apPass = AP_PASS_DEFAULT;
}

// Reset HANYA kredensial (kode akses, sandi WiFi AP, PIN Bluetooth + daftar pairing).
// Kalibrasi sensor ("rzmcal"), preset, otomatis, tema, dan WiFi router (STA) tidak disentuh.
void factoryResetCredentials() {
  secPrefs.clear();
  { Preferences old; old.begin("rzm", false); old.remove("appass"); old.end(); }
  accessCode = ACCESS_CODE_DEFAULT;
  btPin = BT_PIN_DEFAULT;
  apPass = AP_PASS_DEFAULT;
  authFails = 0;
  authLockUntil = 0;
  applyBtPin();
  clearBleBonds();
  logoutAll();
  apRestartAt = millis() + 500;
  resetNoticeUntil = millis() + 4000;
  bleSession.ev = "reset";
  for (int i = 0; i < WS_SLOTS; i++) wsSession[i].ev = "reset";
  Serial.println("=== KREDENSIAL DIRESET KE DEFAULT ===");
  Serial.printf("Kode akses: %s | WiFi %s sandi: %s | PIN Bluetooth: %06u\n", ACCESS_CODE_DEFAULT, AP_SSID, AP_PASS_DEFAULT, (unsigned)BT_PIN_DEFAULT);
  Serial.println("Kalibrasi & preset tetap. Di HP: lupakan/unpair RZM-AIR lalu pairing ulang.");
}

uint32_t lockLeftMs() {
  if (!authLockUntil) return 0;
  int32_t left = (int32_t)(authLockUntil - millis());
  if (left <= 0) { authLockUntil = 0; return 0; }
  return left;
}

// Cek kode; hitung salah untuk proteksi tebak-tebakan.
bool checkCode(const char *code, Session &s) {
  if (lockLeftMs()) { s.ev = "locked"; return false; }
  if (sameSecret(accessCode, code)) { authFails = 0; return true; }
  if (++authFails >= AUTH_MAX_FAIL) {
    authFails = 0;
    authLockUntil = millis() + AUTH_LOCK_MS;
    if (!authLockUntil) authLockUntil = 1;
    s.ev = "locked";
    Serial.println("Akses: terlalu banyak kode salah, dikunci 30 detik");
  } else s.ev = "bad_code";
  return false;
}

// Ganti kredensial. Wajib menyertakan kode akses SAAT INI di field "code", walau sesi sudah login.
void handleSecurity(JsonDocument &doc, Session &s) {
  const char *cur = doc["code"] | "";
  if (!checkCode(cur, s)) return;
  s.authed = true;
  String newCode = doc["newcode"] | "";
  String newAp = doc["appass"] | "";
  String pinStr = doc["btpin"].is<const char *>() ? String((const char *)doc["btpin"]) : String("");
  if (doc["btpin"].is<int>()) { char b[8]; snprintf(b, sizeof(b), "%06d", (int)doc["btpin"]); pinStr = b; }
  // Validasi semua dulu, simpan hanya kalau semuanya benar.
  if (newCode.length() && !validCode(newCode)) { s.ev = "bad_newcode"; return; }
  if (newAp.length() && !validApPass(newAp)) { s.ev = "bad_appass"; return; }
  bool pinOk = pinStr.length() == 6;
  for (char ch : pinStr) if (ch < '0' || ch > '9') pinOk = false;
  if (pinStr.length() && !pinOk) { s.ev = "bad_btpin"; return; }
  if (!newCode.length() && !newAp.length() && !pinStr.length()) { s.ev = "bad_input"; return; }
  if (newCode.length()) {
    accessCode = newCode;
    secPrefs.putString("code", accessCode);
    logoutAll();      // sesi lain harus login ulang dengan kode baru
    s.authed = true;  // sesi yang mengganti tetap login
    Serial.println("Akses: kode akses diganti");
  }
  if (newAp.length()) {
    apPass = newAp;
    secPrefs.putString("appass", apPass);
    apRestartAt = millis() + 2000;  // beri waktu balasan terkirim sebelum WiFi AP restart
    Serial.println("Akses: sandi WiFi AP diganti, AP restart 2 detik lagi");
  }
  if (pinStr.length()) {
    btPin = pinStr.toInt();
    secPrefs.putUInt("btpin", btPin);
    applyBtPin();
    clearBleBonds();
    Serial.println("Akses: PIN Bluetooth diganti, pairing lama dihapus");
  }
  s.ev = "saved";
}

void handleLine(const String &line, Session &s) {
  JsonDocument doc;
  if (deserializeJson(doc, line)) return;
  const char *cmd = doc["cmd"] | "";
  // Perintah tanpa kode akses: auth, logout, stop (keselamatan: menutup katup selalu boleh).
  if (!strcmp(cmd, "auth")) {
    if (checkCode(doc["code"] | "", s)) { s.authed = true; s.ev = "auth_ok"; }
    else s.authed = false;
    return;
  }
  if (!strcmp(cmd, "logout")) { s.authed = false; s.ev = "logout"; return; }
  if (!strcmp(cmd, "security")) { handleSecurity(doc, s); return; }
  // Perintah kontrol lain boleh menyertakan "code" langsung (berguna untuk HTTP tanpa sesi).
  if (!s.authed && strcmp(cmd, "stop") && doc["code"].is<const char *>()) {
    if (checkCode(doc["code"], s)) s.authed = true;
    else return;
  }
  if (!s.authed && strcmp(cmd, "stop")) { s.ev = lockLeftMs() ? "locked" : "need_auth"; return; }
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
      // Kompatibel dengan UI lama; sekarang disimpan di "rzmsec" dan langsung diterapkan.
      String p = (const char *)doc["appass"];
      if (validApPass(p)) {
        apPass = p;
        secPrefs.putString("appass", apPass);
        apRestartAt = millis() + 2000;
        s.ev = "saved";
      } else s.ev = "bad_appass";
    }
    return;
  }
  savePrefs();
}

void pollBle() {
  if (rxLine.length() > 512) rxLine = "";  // buang sampah tanpa "\n"
  bool replied = false;
  while (rxLine.indexOf('\n') >= 0) {
    int n = rxLine.indexOf('\n');
    handleLine(rxLine.substring(0, n), bleSession);
    rxLine.remove(0, n + 1);
    replied |= bleSession.ev != nullptr;
  }
  static uint32_t last = 0;
  if (!bleConnected || (!replied && millis() - last < 250)) return;
  last = millis();
  JsonDocument doc;
  buildStatus(doc, &bleSession);
  char buf[300];
  size_t len = serializeJson(doc, buf, sizeof(buf) - 2);
  buf[len++] = '\n';
  buf[len] = 0;
  txChar->setValue((uint8_t *)buf, len);
  txChar->notify();
}

// Status yang sama untuk BLE dan WiFi. TIDAK PERNAH memuat kode akses, PIN, atau sandi WiFi.
void buildStatus(JsonDocument &doc, Session *s) {
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
  if (s) {
    doc["auth"] = s->authed;                         // sesi ini sudah memasukkan kode akses?
    if (s->authed) doc["def"] = credsAreDefault();   // masih pakai kredensial default (hanya ke sesi login)
    if (s->ev) { doc["ev"] = s->ev; s->ev = nullptr; }
  }
  uint32_t lock = lockLeftMs();
  if (lock) doc["lock"] = (lock + 999) / 1000;      // detik sisa kunci salah kode
  if (bootHoldMs) doc["boot"] = bootHoldMs / 1000;   // tombol BOOT sedang ditahan (detik)
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
  if (bootHoldMs || (resetNoticeUntil && (int32_t)(resetNoticeUntil - millis()) > 0)) {
    tft.fillScreen(GC9A01A_BLACK);
    tft.setTextColor(GC9A01A_YELLOW);
    tft.setTextSize(2);
    if (bootHoldMs) {
      tft.setCursor(40, 80);
      tft.print("TAHAN BOOT");
      tft.setCursor(40, 110);
      tft.printf("RESET %ds", (int)((BOOT_RESET_MS - min(bootHoldMs, (uint32_t)BOOT_RESET_MS) + 999) / 1000));
      tft.setTextSize(1);
      tft.setCursor(40, 145);
      tft.print("lepas = batal");
    } else {
      tft.setCursor(30, 90);
      tft.print("KREDENSIAL");
      tft.setCursor(30, 120);
      tft.print("DIRESET");
      tft.setTextSize(1);
      tft.setCursor(30, 150);
      tft.print("kode 1234  PIN 123456");
    }
    return;
  }
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
void handleLines(const String &text, Session &s) {
  int start = 0;
  while (start < (int)text.length()) {
    int n = text.indexOf('\n', start);
    if (n < 0) n = text.length();
    String line = text.substring(start, n);
    line.trim();
    if (line.length()) handleLine(line, s);
    start = n + 1;
  }
}

String wifiStatusJson(Session *s = nullptr) {
  JsonDocument doc;
  buildStatus(doc, s);
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
  if (num >= WS_SLOTS) return;
  Session &ss = wsSession[num];
  if (type == WStype_CONNECTED) {
    ss = {false, nullptr};
    String s = wifiStatusJson(&ss) + "\n";
    ws.sendTXT(num, s);
  } else if (type == WStype_DISCONNECTED) {
    ss = {false, nullptr};
  } else if (type == WStype_TEXT) {
    if (len > 1024) return;
    String text;
    text.reserve(len);
    for (size_t i = 0; i < len; i++) text += (char)payload[i];
    handleLines(text, ss);
    String s = wifiStatusJson(&ss) + "\n";  // balas langsung (membawa "auth"/"ev")
    ws.sendTXT(num, s);
  }
}

void startSoftAp() {
  WiFi.softAP(AP_SSID, apPass.c_str());
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
  // setup() menutup prefs setelah membaca kalibrasi ("rzmcal"). Buka lagi namespace utama
  // supaya savePrefs() (preset/auto/tema) dan setelan WiFi tetap tersimpan.
  prefs.begin("rzm", false);
  staSsid = prefs.getString("ssid", "");
  staPass = prefs.getString("spass", "");
  // apPass dibaca oleh loadCreds() (namespace "rzmsec").
  WiFi.mode(staSsid.length() ? WIFI_AP_STA : WIFI_AP);
  startSoftAp();
  if (staSsid.length()) WiFi.begin(staSsid.c_str(), staPass.c_str());
  MDNS.begin(MDNS_NAME);

  http.on("/api/status", HTTP_GET, []() { sendCors(); http.send(200, "application/json", wifiStatusJson()); });
  // HTTP tanpa sesi: body harus diawali {"cmd":"auth","code":"…"} (atau tiap perintah membawa "code").
  http.on("/api/cmd", HTTP_POST, []() {
    sendCors();
    Session hs = {false, nullptr};
    String body = http.arg("plain");
    if (body.length() > 2048) { http.send(413, "text/plain", "terlalu besar"); return; }
    handleLines(body, hs);
    http.send(200, "application/json", wifiStatusJson(&hs));
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
  if (apRestartAt && (int32_t)(millis() - apRestartAt) >= 0) {
    apRestartAt = 0;
    WiFi.softAPdisconnect(false);
    startSoftAp();
    Serial.printf("WiFi AP %s dinyalakan ulang dengan sandi baru\n", AP_SSID);
  }
  static uint32_t last = 0;
  if (ws.connectedClients() == 0 || millis() - last < 250) return;
  last = millis();
  // Kirim per klien supaya field "auth"/"ev" sesuai sesi masing-masing.
  for (uint8_t i = 0; i < WS_SLOTS; i++) {
    if (!ws.clientIsConnected(i)) continue;
    String s = wifiStatusJson(&wsSession[i]) + "\n";
    ws.sendTXT(i, s);
  }
}

// Tahan tombol BOOT (GPIO0) 8 detik saat firmware jalan → reset kredensial. LED berkedip makin cepat,
// Serial Monitor menghitung mundur, layar bulat menampilkan sisa detik, UI menerima field "boot".
void pollBootButton() {
  static uint32_t pressedAt = 0, lastSec = 0;
  static bool done = false;
  bool down = digitalRead(PIN_BOOT) == LOW;
  uint32_t now = millis();
  if (!down) {
    if (pressedAt && !done && now - pressedAt > 1000) Serial.println("BOOT dilepas — reset kredensial dibatalkan");
    pressedAt = 0;
    done = false;
    bootHoldMs = 0;
    if (resetNoticeUntil && (int32_t)(resetNoticeUntil - now) > 0) digitalWrite(PIN_LED, (now / 80) % 2);
    else { resetNoticeUntil = 0; digitalWrite(PIN_LED, LOW); }
    return;
  }
  if (!pressedAt) { pressedAt = now ? now : 1; lastSec = 0; }
  if (done) { bootHoldMs = 0; digitalWrite(PIN_LED, (now / 80) % 2); return; }
  uint32_t held = now - pressedAt;
  if (held < 300) return;  // abaikan tekan sebentar / pantulan
  bootHoldMs = held;
  uint32_t period = held > BOOT_RESET_MS * 3 / 4 ? 100 : held > BOOT_RESET_MS / 2 ? 200 : 400;
  digitalWrite(PIN_LED, (held / period) % 2);
  uint32_t sec = held / 1000;
  if (sec != lastSec) {
    lastSec = sec;
    Serial.printf("BOOT ditahan %u dtk — reset kredensial dalam %u dtk (lepas = batal)\n", (unsigned)sec, (unsigned)((BOOT_RESET_MS - min(held, (uint32_t)BOOT_RESET_MS)) / 1000));
  }
  if (held >= BOOT_RESET_MS) {
    done = true;
    bootHoldMs = 0;
    factoryResetCredentials();
  }
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
  pinMode(PIN_BOOT, INPUT_PULLUP);
  pinMode(PIN_LED, OUTPUT);
  digitalWrite(PIN_LED, LOW);
  Serial.printf("RZMONG Airsuspension firmware %s\n", FW_VERSION);
  loadPrefs();
  prefs.end();
  prefs.begin("rzmcal", true);
  if (prefs.isKey("cal")) prefs.getBytes("cal", cal, sizeof(cal));
  prefs.end();
  loadCreds();

  Wire.begin(21, 22);
  if (!ads.begin()) Serial.println("ADS1115 tidak ditemukan");
  ads.setGain(GAIN_TWOTHIRDS);

  SPI.begin(18, -1, 23);
  displayOk = true;
  tft.begin();  // Adafruit_GC9A01A tidak punya init(w,h); layar 240x240 tetap
  tft.setRotation(0);
  tft.fillScreen(GC9A01A_BLACK);

  BLEDevice::init("RZM-AIR");
  // Keamanan BLE: bonding + MITM dengan passkey statis (PIN Bluetooth). Modul "menampilkan" PIN,
  // HP mengetik PIN itu saat pairing. Link wajib terenkripsi untuk RX/TX.
  BLEDevice::setEncryptionLevel(ESP_BLE_SEC_ENCRYPT_MITM);
  BLEDevice::setSecurityCallbacks(new SecCb());
  BLESecurity *sec = new BLESecurity();
  sec->setStaticPIN(btPin);
  sec->setAuthenticationMode(ESP_LE_AUTH_REQ_SC_MITM_BOND);
  sec->setCapability(ESP_IO_CAP_OUT);
  sec->setInitEncryptionKey(ESP_BLE_ENC_KEY_MASK | ESP_BLE_ID_KEY_MASK);
  sec->setRespEncryptionKey(ESP_BLE_ENC_KEY_MASK | ESP_BLE_ID_KEY_MASK);
  BLEServer *server = BLEDevice::createServer();
  server->setCallbacks(new ServerCb());
  BLEService *service = server->createService(SERVICE_UUID);
  BLECharacteristic *rx = service->createCharacteristic(RX_UUID, BLECharacteristic::PROPERTY_WRITE);
  rx->setAccessPermissions(ESP_GATT_PERM_WRITE_ENC_MITM);
  rx->setCallbacks(new RxCb());
  txChar = service->createCharacteristic(TX_UUID, BLECharacteristic::PROPERTY_NOTIFY);
  BLE2902 *cccd = new BLE2902();
  cccd->setAccessPermissions(ESP_GATT_PERM_READ_ENC_MITM | ESP_GATT_PERM_WRITE_ENC_MITM);
  txChar->addDescriptor(cccd);
  service->start();
  server->getAdvertising()->start();
  setupWifi();
  Serial.println("RZM-AIR ready");
  if (credsAreDefault())
    Serial.println("PERINGATAN: masih pakai kredensial default (kode 1234 / PIN BT 123456 / WiFi rzmong123). Ganti di UI → KEAMANAN.");
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

  pollBootButton();
  pollBle();
  pollWifi();
  drawDisplay();
  delay(40);
}
