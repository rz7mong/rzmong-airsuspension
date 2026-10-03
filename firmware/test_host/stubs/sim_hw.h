// Stub perangkat keras/library untuk simulasi host firmware RZMONG.
#pragma once
#include "Arduino.h"

// ---------- I2C / SPI ----------
class TwoWire { public: bool begin(int = -1, int = -1, uint32_t = 0) { return true; } };
extern TwoWire Wire;
class SPIClass { public: void begin(int = -1, int = -1, int = -1, int = -1) {} };
extern SPIClass SPI;

// ---------- ADS1115 (meniru perilaku Adafruit ADS1X15 2.5.x) ----------
namespace sim {
extern bool adsPresent;          // false = modul hilang / kabel I2C putus
extern float adsVolts[4];        // tegangan di A0..A3
extern long adsPolls;            // jumlah polling conversionComplete berturut-turut
}
typedef enum { GAIN_TWOTHIRDS = 0x0000, GAIN_ONE = 0x0200 } adsGain_t;
constexpr uint16_t MUX_BY_CHANNEL[] = {0x4000, 0x5000, 0x6000, 0x7000};
class Adafruit_ADS1115 {
  int pendingCh = -1;
 public:
  bool begin(uint8_t = 0x48, TwoWire * = &Wire) { return sim::adsPresent; }
  void setGain(adsGain_t) {}
  void startADCReading(uint16_t mux, bool) {
    pendingCh = -1;
    for (int i = 0; i < 4; i++) if (MUX_BY_CHANNEL[i] == mux) pendingCh = i;
    sim::adsPolls = 0;
  }
  bool conversionComplete() {
    // Library asli: baca register config lewat I2C. Kalau modul tidak menjawab, bit OS tidak pernah 1.
    if (++sim::adsPolls > 200000) throw sim::Hang("ADS1115 conversionComplete() tidak pernah true (loop macet)");
    return sim::adsPresent;
  }
  int16_t getLastConversionResults() {
    if (!sim::adsPresent || pendingCh < 0) return 0;
    float v = sim::adsVolts[pendingCh];
    long raw = lround(v / 0.0001875f);
    return (int16_t)constrain(raw, -32768L, 32767L);
  }
  int16_t readADC_SingleEnded(uint8_t ch) {
    startADCReading(MUX_BY_CHANNEL[ch], false);
    while (!conversionComplete()) ;     // persis seperti library asli: tanpa batas waktu
    sim::now += 8;                      // 128 SPS ≈ 8 ms per konversi
    return getLastConversionResults();
  }
};

// ---------- Preferences (NVS di RAM) ----------
namespace sim { extern std::map<std::string, std::map<std::string, std::vector<uint8_t>>> nvs; }
class Preferences {
  std::string ns; bool open = false; bool ro = false;
  std::map<std::string, std::vector<uint8_t>> *m() { return &sim::nvs[ns]; }
  template <class T> size_t putT(const char *k, T v) { if (!open || ro) return 0; auto &x = (*m())[k]; x.assign((uint8_t *)&v, (uint8_t *)&v + sizeof(T)); return sizeof(T); }
  template <class T> T getT(const char *k, T d) { if (!open) return d; auto it = m()->find(k); if (it == m()->end() || it->second.size() != sizeof(T)) return d; T v; memcpy(&v, it->second.data(), sizeof(T)); return v; }
 public:
  bool begin(const char *n, bool readOnly = false) { if (readOnly && !sim::nvs.count(n)) return false; ns = n; open = true; ro = readOnly; return true; }
  void end() { open = false; }
  bool clear() { if (!open || ro) return false; m()->clear(); return true; }
  bool remove(const char *k) { if (!open || ro) return false; return m()->erase(k) > 0; }
  bool isKey(const char *k) { return open && m()->count(k); }
  size_t putBytes(const char *k, const void *v, size_t n) { if (!open || ro) return 0; auto &x = (*m())[k]; x.assign((const uint8_t *)v, (const uint8_t *)v + n); return n; }
  size_t getBytes(const char *k, void *buf, size_t n) { if (!open) return 0; auto it = m()->find(k); if (it == m()->end()) return 0; size_t c = std::min(n, it->second.size()); memcpy(buf, it->second.data(), c); return c; }
  size_t putInt(const char *k, int32_t v) { return putT(k, v); }
  int32_t getInt(const char *k, int32_t d = 0) { return getT(k, d); }
  size_t putUInt(const char *k, uint32_t v) { return putT(k, v); }
  uint32_t getUInt(const char *k, uint32_t d = 0) { return getT(k, d); }
  size_t putBool(const char *k, bool v) { return putT(k, (uint8_t)v); }
  bool getBool(const char *k, bool d = false) { return getT(k, (uint8_t)d); }
  size_t putString(const char *k, const String &v) { if (!open || ro) return 0; auto &x = (*m())[k]; x.assign(v.s.begin(), v.s.end()); x.push_back(0); return v.length(); }
  String getString(const char *k, const String &d = String()) { if (!open) return d; auto it = m()->find(k); if (it == m()->end() || it->second.empty()) return d; return String((const char *)it->second.data()); }
};

// ---------- Layar GC9A01A ----------
#define GC9A01A_BLACK 0x0000
#define GC9A01A_WHITE 0xFFFF
#define GC9A01A_CYAN 0x07FF
#define GC9A01A_RED 0xF800
#define GC9A01A_YELLOW 0xFFE0
class Adafruit_GC9A01A {
 public:
  Adafruit_GC9A01A(int, int, int) {}
  void begin(uint32_t = 0) {}
  void setRotation(int) {}
  void fillScreen(uint16_t) {}
  void drawCircle(int, int, int, uint16_t) {}
  void setTextColor(uint16_t) {}
  void setTextSize(int) {}
  void setCursor(int, int) {}
  void print(const char *) {}
  void print(const String &) {}
  void print(int) {}
  void printf(const char *, ...) {}
};

// ---------- BLE (Bluedroid) ----------
typedef uint8_t esp_bd_addr_t[6];
struct esp_ble_bond_dev_t { esp_bd_addr_t bd_addr; };
struct esp_ble_auth_cmpl_t { bool success; int fail_reason; };
enum { ESP_BLE_SM_SET_STATIC_PASSKEY = 0 };
enum { ESP_BLE_SEC_ENCRYPT_MITM = 3 };
enum { ESP_LE_AUTH_REQ_SC_MITM_BOND = 0x0d };
enum { ESP_IO_CAP_OUT = 0 };
enum { ESP_BLE_ENC_KEY_MASK = 1, ESP_BLE_ID_KEY_MASK = 2 };
enum { ESP_GATT_PERM_READ_ENC_MITM = 1 << 2, ESP_GATT_PERM_WRITE_ENC_MITM = 1 << 6 };
namespace sim { extern uint32_t blePasskey; extern int bleBonds; extern std::vector<std::string> bleNotify; }
inline int esp_ble_gap_set_security_param(int, void *v, uint8_t) { sim::blePasskey = *(uint32_t *)v; return 0; }
inline int esp_ble_get_bond_device_num() { return sim::bleBonds; }
inline int esp_ble_get_bond_device_list(int *n, esp_ble_bond_dev_t *l) { *n = std::min(*n, sim::bleBonds); memset(l, 0, sizeof(*l) * *n); return 0; }
inline int esp_ble_remove_bond_device(uint8_t *) { if (sim::bleBonds) sim::bleBonds--; return 0; }

class BLECharacteristic;
class BLEServer;
class BLECharacteristicCallbacks { public: virtual ~BLECharacteristicCallbacks() {} virtual void onWrite(BLECharacteristic *) {} };
class BLEServerCallbacks { public: virtual ~BLEServerCallbacks() {} virtual void onConnect(BLEServer *) {} virtual void onDisconnect(BLEServer *) {} };
class BLESecurityCallbacks {
 public:
  virtual ~BLESecurityCallbacks() {}
  virtual uint32_t onPassKeyRequest() = 0;
  virtual void onPassKeyNotify(uint32_t) = 0;
  virtual bool onConfirmPIN(uint32_t) = 0;
  virtual bool onSecurityRequest() = 0;
  virtual void onAuthenticationComplete(esp_ble_auth_cmpl_t) = 0;
};
class BLEDescriptor { public: virtual ~BLEDescriptor() {} void setAccessPermissions(int) {} };
class BLE2902 : public BLEDescriptor {};
class BLECharacteristic {
 public:
  enum { PROPERTY_WRITE = 8, PROPERTY_NOTIFY = 16 };
  std::string value; BLECharacteristicCallbacks *cb = nullptr; std::string uuid;
  void setAccessPermissions(int) {}
  void setCallbacks(BLECharacteristicCallbacks *c) { cb = c; }
  void addDescriptor(BLEDescriptor *) {}
  void setValue(uint8_t *d, size_t n) { value.assign((char *)d, n); }
  std::string getValue() { return value; }
  void notify() { sim::bleNotify.push_back(value); }
};
namespace sim { extern BLECharacteristic *bleRx; extern BLEServerCallbacks *bleSrvCb; extern BLEServer *bleSrv; }
class BLEAdvertising { public: void start() {} };
class BLEService {
 public:
  BLECharacteristic *createCharacteristic(const char *u, uint32_t) { auto *c = new BLECharacteristic(); c->uuid = u; if (strstr(u, "6e400002")) sim::bleRx = c; return c; }
  void start() {}
};
class BLEServer {
 public:
  BLEAdvertising adv;
  void setCallbacks(BLEServerCallbacks *c) { sim::bleSrvCb = c; }
  BLEService *createService(const char *) { return new BLEService(); }
  BLEAdvertising *getAdvertising() { return &adv; }
  void startAdvertising() {}
};
class BLESecurity {
 public:
  void setStaticPIN(uint32_t p) { sim::blePasskey = p; }
  void setAuthenticationMode(int) {}
  void setCapability(int) {}
  void setInitEncryptionKey(int) {}
  void setRespEncryptionKey(int) {}
};
class BLEDevice {
 public:
  static void init(const char *) {}
  static void setEncryptionLevel(int) {}
  static void setSecurityCallbacks(BLESecurityCallbacks *) {}
  static BLEServer *createServer() { sim::bleSrv = new BLEServer(); return sim::bleSrv; }
};

// ---------- WiFi / HTTP / WebSocket ----------
enum { WIFI_AP = 2, WIFI_AP_STA = 3 };
enum { WL_CONNECTED = 3, WL_DISCONNECTED = 6 };
namespace sim { extern std::vector<std::string> softApPass; }
class WiFiClass {
 public:
  void mode(int) {}
  bool softAP(const char *, const char *p) { sim::softApPass.push_back(p ? p : ""); return true; }
  bool softAPdisconnect(bool) { return true; }
  void begin(const char *, const char *) {}
  void disconnect() {}
  int status() { return WL_DISCONNECTED; }
  IPAddress localIP() { return IPAddress(); }
  IPAddress softAPIP() { return IPAddress(192, 168, 4, 1); }
};
extern WiFiClass WiFi;
class MDNSResponder { public: bool begin(const char *) { return true; } void addService(const char *, const char *, int) {} };
extern MDNSResponder MDNS;

enum HTTPMethod { HTTP_GET = 1, HTTP_POST = 3, HTTP_OPTIONS = 6 };
class WebServer {
 public:
  std::map<std::pair<std::string, int>, std::function<void()>> routes;
  std::function<void()> notFound;
  String body, curUri; int lastCode = 0; String lastBody;
  WebServer(int) {}
  void on(const char *p, HTTPMethod m, std::function<void()> f) { routes[{p, (int)m}] = f; }
  void onNotFound(std::function<void()> f) { notFound = f; }
  void begin() {}
  void handleClient() {}
  String arg(const char *) { return body; }
  String uri() { return curUri; }
  void sendHeader(const char *, const char *) {}
  void send(int code, const char * = "", const String &b = String()) { lastCode = code; lastBody = b; }
  void send_P(int code, const char *, const char *, size_t) { lastCode = code; lastBody = String("<asset>"); }
  // helper uji
  String request(const char *path, HTTPMethod m, const String &b = String()) {
    body = b; curUri = path; lastCode = 0; lastBody = String();
    auto it = routes.find({path, (int)m});
    if (it != routes.end()) it->second(); else if (notFound) notFound();
    return lastBody;
  }
};

typedef enum { WStype_ERROR, WStype_DISCONNECTED, WStype_CONNECTED, WStype_TEXT, WStype_BIN } WStype_t;
class WebSocketsServer {
 public:
  typedef std::function<void(uint8_t, WStype_t, uint8_t *, size_t)> Ev;
  Ev ev; bool conn[8] = {}; std::vector<std::string> sent[8];
  WebSocketsServer(int) {}
  void begin() {}
  void onEvent(Ev e) { ev = e; }
  void loop() {}
  bool sendTXT(uint8_t n, const String &s) { if (n < 8) sent[n].push_back(s.s); return true; }
  int connectedClients() { int c = 0; for (bool b : conn) c += b; return c; }
  bool clientIsConnected(uint8_t n) { return n < 8 && conn[n]; }
  // helper uji
  void connect(uint8_t n) { conn[n] = true; ev(n, WStype_CONNECTED, nullptr, 0); }
  void disconnect(uint8_t n) { conn[n] = false; ev(n, WStype_DISCONNECTED, nullptr, 0); }
  void text(uint8_t n, const std::string &t) { ev(n, WStype_TEXT, (uint8_t *)t.data(), t.size()); }
};
