// Simulasi host firmware RZMONG Airsuspension.
// Firmware ASLI (rzmong_airsuspension.ino) dikompilasi di PC dengan stub Arduino/ESP32 (folder stubs/),
// lalu dijalankan dengan waktu virtual: sensor, tombol BOOT, ACC, BLE, WebSocket, dan HTTP disimulasikan.
// Tiap tes berjalan di proses terpisah (fork) supaya variabel global firmware selalu bersih.
// Jalankan: ./run.sh   (lihat docs/EDIT-GUIDE.md bagian "Tes firmware tanpa ESP32")
#include "stubs/sim_hw.h"
#include <ArduinoJson.h>
#include <sys/wait.h>
#include <unistd.h>
#include <thread>
#include <atomic>

namespace sim {
uint32_t now = 0;
int pinMode_[40], pinOut[40], pinIn[40], analog[40];
std::string serialLog;
bool echoSerial = false, loopWdtEnabled = false;
bool adsPresent = true;
float adsVolts[4] = {0.5f, 0.5f, 0.5f, 0.5f};
long adsPolls = 0;
std::map<std::string, std::map<std::string, std::vector<uint8_t>>> nvs;
uint32_t blePasskey = 0;
int bleBonds = 0;
std::vector<std::string> bleNotify;
BLECharacteristic *bleRx = nullptr;
BLEServerCallbacks *bleSrvCb = nullptr;
BLEServer *bleSrv = nullptr;
std::vector<std::string> softApPass;
int tasksCreated = 0;
uint32_t rnd = 1;
}
EspClass ESP;
HardwareSerial Serial;
TwoWire Wire;
SPIClass SPI;
WiFiClass WiFi;
MDNSResponder MDNS;

#include "../rzmong_airsuspension/rzmong_airsuspension.ino"

// ---------------- kerangka uji kecil ----------------
static int g_fail = 0;
#define CHECK(cond, ...) do { if (!(cond)) { g_fail++; fprintf(stderr, "    GAGAL %s:%d: %s — ", __FILE__, __LINE__, #cond); fprintf(stderr, __VA_ARGS__); fputc('\n', stderr); } } while (0)

static float psiToV(float psi) { return 0.5f + psi * 4.0f / 200.0f; }
static void setPsi(float tank, float front, float rear) { sim::adsVolts[0] = psiToV(tank); sim::adsVolts[1] = psiToV(front); sim::adsVolts[2] = psiToV(rear); }
static bool on(int pin) { return sim::pinMode_[pin] == OUTPUT && sim::pinOut[pin] == RELAY_ON; }
static bool anyValve() { return on(PIN_FILL_F) || on(PIN_DUMP_F) || on(PIN_FILL_R) || on(PIN_DUMP_R); }
static long invariantBad = 0;
static void checkInvariants() {
  if (on(PIN_FILL_F) && on(PIN_DUMP_F)) invariantBad++;
  if (on(PIN_FILL_R) && on(PIN_DUMP_R)) invariantBad++;
}
// Jalankan loop() selama ms milidetik waktu virtual. Kembalikan false kalau firmware macet.
static bool run(uint32_t ms) {
  uint32_t start = sim::now;
  try {
    while ((uint32_t)(sim::now - start) < ms) { loop(); checkInvariants(); }
  } catch (sim::Hang &h) { fprintf(stderr, "    MACET: %s\n", h.what()); return false; }
  return true;
}
static void boot(uint32_t startMs = 1000) {
  sim::now = startMs;
  setPsi(150, 50, 55);       // tangki 150, as sesuai preset Jalan (50/55)
  sim::analog[PIN_ACC] = 0;
  setup();
  run(300);
}
static JsonDocument parse(const std::string &s) { JsonDocument d; deserializeJson(d, s); return d; }
// BLE: tulis dipotong 20 byte seperti UI, lalu satu putaran loop memproses & membalas.
static void bleConnect() { sim::bleSrvCb->onConnect(sim::bleSrv); }
static void bleDisconnect() { sim::bleSrvCb->onDisconnect(sim::bleSrv); }
static JsonDocument ble(const std::string &line, bool chunk = true) {
  std::string l = line + "\n";
  for (size_t i = 0; i < l.size(); i += chunk ? 20 : l.size()) { sim::bleRx->value = l.substr(i, chunk ? 20 : l.size()); sim::bleRx->cb->onWrite(sim::bleRx); }
  sim::bleNotify.clear();
  run(1);
  if (sim::bleNotify.empty()) run(300);   // perintah tanpa "ev" dibalas oleh status berkala (250 ms)
  return parse(sim::bleNotify.empty() ? "{}" : sim::bleNotify.back());
}
static JsonDocument wsSend(uint8_t n, const std::string &t) { ws.text(n, t); return parse(ws.sent[n].back()); }
static JsonDocument post(const std::string &b) { return parse(http.request("/api/cmd", HTTP_POST, String(b)).s); }

// ---------------- tes ----------------
static void t_boot_default() {
  boot();
  CHECK(sim::serialLog.find("RZM-AIR ready") != std::string::npos, "boot tidak selesai");
  CHECK(accessCode == "1234" && btPin == 123456 && apPass == "rzmong123", "default kredensial salah");
  CHECK(!sim::softApPass.empty() && sim::softApPass[0] == "rzmong123", "SoftAP tidak dimulai dengan sandi default");
  CHECK(sim::blePasskey == 123456, "passkey BLE %u", sim::blePasskey);
  CHECK(sim::serialLog.find("PERINGATAN") != std::string::npos, "peringatan kredensial default tidak muncul");
  CHECK(!anyValve(), "katup terbuka padahal tekanan sudah sesuai preset");
}

static void t_auth_lockout() {
  boot();
  bleConnect();
  auto r = ble("{\"cmd\":\"preset\",\"id\":2}");
  CHECK(r["ev"] == "need_auth" && r["preset"] == 1, "perintah tanpa kode harus ditolak");
  for (int i = 0; i < 4; i++) { r = ble("{\"cmd\":\"auth\",\"code\":\"0000\"}"); CHECK(r["ev"] == "bad_code", "percobaan %d", i); }
  r = ble("{\"cmd\":\"auth\",\"code\":\"0000\"}");
  CHECK(r["ev"] == "locked" && r["lock"] == 30, "salah ke-5 harus mengunci 30 dtk");
  r = ble("{\"cmd\":\"auth\",\"code\":\"1234\"}");
  CHECK(r["ev"] == "locked" && r["auth"] == false, "kode benar saat terkunci harus tetap ditolak");
  run(29000);
  r = ble("{\"cmd\":\"auth\",\"code\":\"1234\"}");
  CHECK(r["ev"] == "locked", "kunci berakhir terlalu cepat");
  run(1200);
  r = ble("{\"cmd\":\"auth\",\"code\":\"1234\"}");
  CHECK(r["ev"] == "auth_ok" && r["auth"] == true, "kunci tidak berakhir setelah 30 dtk");
  // Perintah HTTP membawa code salah juga dihitung
  for (int i = 0; i < 5; i++) post("{\"cmd\":\"preset\",\"id\":0,\"code\":\"9999\"}");
  CHECK(lockLeftMs() > 0, "HTTP salah 5x harus mengunci");
}

static void t_lockout_millis_wrap() {
  boot(0xFFFFFFFFu - 10000);   // millis() akan meluap (49,7 hari) di tengah masa kunci
  for (int i = 0; i < 5; i++) post("{\"cmd\":\"auth\",\"code\":\"x000\"}");
  CHECK(lockLeftMs() > 25000, "kunci tidak aktif dekat overflow");
  run(20000);
  CHECK(lockLeftMs() > 0 && lockLeftMs() <= 10000, "kunci salah setelah overflow: %u", lockLeftMs());
  run(11000);
  CHECK(lockLeftMs() == 0, "kunci tidak pernah lepas setelah overflow");
  auto r = post("{\"cmd\":\"auth\",\"code\":\"1234\"}");
  CHECK(r["ev"] == "auth_ok", "login setelah overflow gagal");
}

static void t_security_validation() {
  boot();
  bleConnect();
  ws.connect(0);
  wsSend(0, "{\"cmd\":\"auth\",\"code\":\"1234\"}");
  const char *badCodes[] = {"", "abc", "1234567890123", "12 34", "ab\\u00e9d"};
  auto r = ble("{\"cmd\":\"security\",\"code\":\"1234\"}");
  CHECK(r["ev"] == "bad_input", "tanpa field baru harus bad_input (dapat %s)", (const char *)(r["ev"] | "-"));
  for (int i = 1; i < 5; i++) {
    r = ble(std::string("{\"cmd\":\"security\",\"code\":\"1234\",\"newcode\":\"") + badCodes[i] + "\"}");
    CHECK(r["ev"] == "bad_newcode", "newcode '%s' harus ditolak", badCodes[i]);
  }
  r = ble("{\"cmd\":\"security\",\"code\":\"1234\",\"appass\":\"1234567\"}");
  CHECK(r["ev"] == "bad_appass", "appass 7 karakter harus ditolak");
  r = ble("{\"cmd\":\"security\",\"code\":\"1234\",\"appass\":\"" + std::string(64, 'a') + "\"}");
  CHECK(r["ev"] == "bad_appass", "appass 64 karakter harus ditolak");
  const char *badPins[] = {"\"12345\"", "\"12a456\"", "1234567", "-12345", "\"1234567\""};
  for (auto p : badPins) {
    r = ble(std::string("{\"cmd\":\"security\",\"code\":\"1234\",\"btpin\":") + p + "}");
    CHECK(r["ev"] == "bad_btpin", "btpin %s harus ditolak (dapat %s)", p, (const char *)(r["ev"] | "-"));
  }
  // Satu field salah → tidak ada yang disimpan
  r = ble("{\"cmd\":\"security\",\"code\":\"1234\",\"newcode\":\"5678\",\"btpin\":\"12\"}");
  CHECK(accessCode == "1234", "kode tersimpan walau btpin salah");
  sim::bleBonds = 2;
  r = ble("{\"cmd\":\"security\",\"code\":\"1234\",\"newcode\":\"Abc!def~1234\",\"appass\":\"" + std::string(63, 'z') + "\",\"btpin\":42}");
  CHECK(r["ev"] == "saved" && r["auth"] == true, "simpan kredensial valid gagal");
  CHECK(accessCode == "Abc!def~1234" && btPin == 42 && apPass.length() == 63, "nilai baru tidak dipakai");
  CHECK(sim::blePasskey == 42 && sim::bleBonds == 0, "passkey/bond tidak diperbarui");
  CHECK(Preferences().begin("rzmsec", true), "namespace rzmsec tidak ada");
  CHECK(wsSession[0].authed == false, "sesi WebSocket lain harus logout setelah kode diganti");
  size_t ap0 = sim::softApPass.size();
  run(1500);
  CHECK(sim::softApPass.size() == ap0, "AP restart terlalu cepat (balasan belum terkirim)");
  run(1000);
  CHECK(sim::softApPass.size() == ap0 + 1 && sim::softApPass.back() == std::string(63, 'z'), "AP tidak restart dengan sandi baru");
  // Rahasia tidak boleh bocor di status / serial
  std::string all = http.request("/api/status", HTTP_GET).s + ws.sent[0].back();
  for (auto &n : sim::bleNotify) all += n;
  CHECK(all.find("Abc!def~1234") == std::string::npos && all.find("zzzzzzzz") == std::string::npos, "rahasia bocor di status");
  CHECK(sim::serialLog.find("Abc!def~1234") == std::string::npos && sim::serialLog.find("zzzzzzzz") == std::string::npos, "rahasia bocor di serial");
  // Reboot: kredensial dibaca dari NVS
  loadCreds();
  CHECK(accessCode == "Abc!def~1234" && btPin == 42, "kredensial tidak persist");
}

static void t_bad_json() {
  boot();
  const char *junk[] = {"", "{", "null", "[]", "123", "\"auth\"", "{\"cmd\":5}", "{\"cmd\":null}", "{\"cmd\":\"preset\",\"id\":\"2\"}",
                        "{\"cmd\":\"auth\",\"code\":1234}", "{\"cmd\":\"auth\",\"code\":null}", "{\"cmd\":\"auth\",\"code\":{\"a\":1}}",
                        "{\"cmd\":\"security\",\"code\":\"1234\",\"btpin\":1e30}", "{\"cmd\":\"security\",\"code\":\"1234\",\"btpin\":-2147483648}",
                        "\xff\xfe\x00garbage", "{\"cmd\":\"auth\",\"code\":\"" "\\u0000" "1234\"}"};
  for (auto j : junk) { post(j); bleConnect(); ble(j, false); }
  std::string deep(5000, '['); post(deep);
  authLockUntil = 0; authFails = 0;   // sampah di atas memang memicu kunci salah kode — lepas untuk lanjut uji
  std::string big = "{\"cmd\":\"auth\",\"code\":\"" + std::string(3000, 'A') + "\"}";
  http.request("/api/cmd", HTTP_POST, String(big));
  CHECK(http.lastCode == 413, "body >2048 harus 413");
  // Nilai di luar batas dibatasi
  auto r = post("{\"cmd\":\"auth\",\"code\":\"1234\"}\n{\"cmd\":\"preset\",\"id\":99}\n{\"cmd\":\"set\",\"axle\":\"front\",\"psi\":100000}\n{\"cmd\":\"set\",\"axle\":\"rear\",\"psi\":-5}\n{\"cmd\":\"theme\",\"id\":-3}");
  CHECK(r["preset"] == 2 && r["pf"] == BAG_MAX && r["pr"] == BAG_MIN && r["theme"] == 0, "batas nilai salah: %s", http.lastBody.c_str());
  CHECK(accessCode == "1234", "kode berubah oleh input sampah");
  // BLE: sampah >512 byte tanpa newline dibuang, baris berikutnya tetap jalan
  bleConnect();
  for (int i = 0; i < 40; i++) { sim::bleRx->value = std::string(20, 'x'); sim::bleRx->cb->onWrite(sim::bleRx); }
  run(1);
  r = ble("{\"cmd\":\"auth\",\"code\":\"1234\"}");
  CHECK(r["ev"] == "auth_ok", "BLE tidak pulih setelah sampah panjang");
  CHECK(run(500), "firmware macet");
}

static void t_ble_ws_http_concurrent() {
  boot();
  bleConnect(); ws.connect(0); ws.connect(1);
  ble("{\"cmd\":\"auth\",\"code\":\"1234\"}");
  auto w = wsSend(0, "{\"cmd\":\"preset\",\"id\":0}");
  CHECK(w["ev"] == "need_auth" && w["preset"] == 1, "WS tanpa login tidak boleh ikut sesi BLE");
  auto b = ble("{\"cmd\":\"preset\",\"id\":2}");
  CHECK(b["preset"] == 2, "preset via BLE gagal: %s", sim::bleNotify.empty() ? "-" : sim::bleNotify.back().c_str());
  wsSend(1, "{\"cmd\":\"auth\",\"code\":\"1234\"}\n{\"cmd\":\"preset\",\"id\":0}");
  auto h = post("{\"cmd\":\"preset\",\"id\":1}");
  CHECK(h["ev"] == "need_auth", "HTTP tanpa kode harus ditolak");
  b = ble("{\"cmd\":\"set\",\"axle\":\"front\",\"psi\":30}");
  CHECK(b["preset"] == 0 && b["pf"] == 30, "urutan perintah campur salah");
  // Satu koneksi WS putus tidak mempengaruhi BLE
  ws.disconnect(1);
  b = ble("{\"cmd\":\"preset\",\"id\":1}");
  CHECK(b["auth"] == true && b["preset"] == 1, "sesi BLE ikut hilang");
  // BLE putus → sesi BLE wajib login lagi
  bleDisconnect(); run(50); bleConnect();
  b = ble("{\"cmd\":\"preset\",\"id\":2}");
  CHECK(b["ev"] == "need_auth", "sesi BLE harus terkunci setelah reconnect");
}

static void t_stop_holds() {
  boot();
  setPsi(150, 20, 20);          // jauh di bawah target → isi
  run(200);
  CHECK(on(PIN_FILL_F) && on(PIN_FILL_R), "harusnya mengisi");
  post("{\"cmd\":\"stop\"}");    // STOP boleh tanpa kode
  CHECK(!anyValve(), "STOP tidak langsung menutup katup");
  run(5000);
  CHECK(!anyValve(), "BUG: STOP diabaikan — leveling otomatis membuka katup lagi");
  auto r = post("{\"cmd\":\"preset\",\"id\":1,\"code\":\"1234\"}");
  run(200);
  CHECK(on(PIN_FILL_F), "memilih preset harus melanjutkan leveling setelah STOP");
}

static void t_manual() {
  boot();
  bleConnect();
  ble("{\"cmd\":\"auth\",\"code\":\"1234\"}");
  ble("{\"cmd\":\"manual\",\"axle\":\"front\",\"action\":\"dump\"}");
  run(1000);
  CHECK(on(PIN_DUMP_F) && !on(PIN_FILL_F), "BUG: manual buang depan ditimpa leveling otomatis");
  ble("{\"cmd\":\"manual\",\"axle\":\"front\",\"action\":\"stop\"}");
  run(100);
  CHECK(!on(PIN_DUMP_F), "manual stop tidak menutup katup");
  // HP putus saat tombol ditahan → katup harus tertutup (tidak ada pesan 'stop' yang datang)
  ble("{\"cmd\":\"manual\",\"axle\":\"rear\",\"action\":\"fill\"}");
  run(300);
  CHECK(on(PIN_FILL_R), "manual isi belakang tidak jalan");
  bleDisconnect();
  run(300);
  CHECK(!on(PIN_FILL_R), "katup manual tetap terbuka setelah BLE putus");
  // Dead-man: pesan 'stop' hilang → katup menutup sendiri
  bleConnect(); ble("{\"cmd\":\"auth\",\"code\":\"1234\"}");
  ble("{\"cmd\":\"manual\",\"axle\":\"rear\",\"action\":\"fill\"}");
  run(30000);
  CHECK(!on(PIN_FILL_R), "katup manual terbuka >30 dtk tanpa batas waktu");
  // Manual isi berhenti di batas aman BAG_MAX
  ble("{\"cmd\":\"manual\",\"axle\":\"front\",\"action\":\"fill\"}");
  setPsi(150, BAG_MAX + 5, 55);
  run(200);
  CHECK(!on(PIN_FILL_F), "manual isi melewati BAG_MAX");
}

static void t_fill_timeout_latch() {
  boot();
  setPsi(150, 10, 55);   // balon depan bocor: tekanan tidak pernah naik
  run(91000);
  auto r = post("{}");
  CHECK(String((const char *)(r["fault"] | "")).startsWith("depan"), "fault bocor tidak muncul: %s", http.lastBody.c_str());
  long openMs = 0;
  for (int i = 0; i < 60000 / 40; i++) { run(40); if (on(PIN_FILL_F)) openMs += 40; }
  CHECK(openMs == 0, "BUG: setelah timeout bocor katup isi depan dibuka lagi (%ld ms dari 60 dtk)", openMs);
  // millis overflow tidak membuat timeout salah
}

static void t_fill_timeout_wrap() {
  boot(0xFFFFFFFFu - 30000);
  setPsi(150, 10, 55);
  run(60000);
  CHECK(on(PIN_FILL_F), "timeout terlalu cepat saat millis overflow");
  run(35000);
  CHECK(!on(PIN_FILL_F), "timeout tidak bekerja melewati overflow");
}

static void t_sensor_fault() {
  boot();
  sim::adsVolts[1] = 0.0f;   // kabel sinyal sensor depan putus (0 V)
  run(1000);
  CHECK(!on(PIN_FILL_F) && !on(PIN_DUMP_F), "BUG: sensor depan putus (0 V) → katup depan tetap dikendalikan");
  auto r = post("{}");
  CHECK(strstr(r["fault"] | "", "sensor"), "fault sensor tidak dilaporkan: %s", http.lastBody.c_str());
  sim::adsVolts[1] = psiToV(50);
  sim::adsVolts[0] = 5.2f;   // sensor tangki korslet ke 5 V
  run(1000);
  CHECK(!on(PIN_COMP), "kompresor nyala dengan sensor tangki korslet");
  sim::adsVolts[0] = 0.0f;   // sensor tangki putus → dibaca 0 psi
  run(5000);
  CHECK(!on(PIN_COMP), "BUG: sensor tangki putus → kompresor nyala terus");
  setPsi(150, 50, 55);
  run(2000);
  r = post("{}");
  CHECK(!strstr(r["fault"] | "", "sensor"), "fault sensor tidak hilang setelah sensor normal: %s", http.lastBody.c_str());
}

static void t_ads_missing() {
  boot();
  setPsi(150, 20, 55);
  run(200);
  CHECK(on(PIN_FILL_F), "harusnya mengisi depan");
  sim::adsPresent = false;    // modul ADS1115 lepas saat katup isi terbuka
  bool alive = run(2000);
  CHECK(alive, "BUG KRITIS: loop() macet di Adafruit_ADS1X15::readADC_SingleEnded");
  if (!alive) return;
  CHECK(!anyValve() && !on(PIN_COMP), "katup/kompresor tidak dimatikan saat ADS1115 hilang");
  auto r = parse(http.request("/api/status", HTTP_GET).s);
  CHECK(http.lastCode == 200 && strstr(r["fault"] | "", "sensor"), "HTTP tidak dilayani / fault tidak dilaporkan: %s", http.lastBody.c_str());
  sim::adsPresent = true;
  run(5000);
  CHECK(on(PIN_FILL_F), "tidak pulih setelah ADS1115 tersambung lagi");
}

static void t_ads_missing_at_boot() {
  sim::adsPresent = false;
  sim::now = 1000; setPsi(150, 20, 20);
  try { setup(); } catch (sim::Hang &) { CHECK(false, "setup macet"); return; }
  CHECK(run(3000), "BUG KRITIS: tanpa ADS1115 firmware macet saat boot (UI/BLE/WiFi mati)");
  CHECK(!anyValve() && !on(PIN_COMP), "katup/kompresor jalan tanpa sensor");
  sim::adsPresent = true;
  run(3000);
  CHECK(on(PIN_FILL_F) && on(PIN_FILL_R), "tidak mulai bekerja setelah ADS1115 dipasang");
}

static void t_compressor() {
  boot();
  setPsi(140, 50, 55); run(200);
  CHECK(on(PIN_COMP), "kompresor harus nyala < 145");
  setPsi(155, 50, 55); run(200);
  CHECK(on(PIN_COMP), "histeresis: tetap nyala sampai 165");
  setPsi(170, 50, 55); run(200);
  CHECK(!on(PIN_COMP), "kompresor harus mati > 165");
  setPsi(150, 50, 55); run(200);
  CHECK(!on(PIN_COMP), "histeresis: tetap mati sampai < 145");
  // Tangki bocor: tekanan tidak pernah naik → kompresor jangan jalan tanpa batas
  setPsi(100, 50, 55);
  run(11UL * 60 * 1000);
  CHECK(!on(PIN_COMP), "kompresor jalan terus >10 menit tanpa tekanan naik");
}

static void t_ignition() {
  boot();
  post("{\"cmd\":\"auth\",\"code\":\"1234\"}\n{\"cmd\":\"auto\",\"rise\":true,\"drop\":true}\n{\"cmd\":\"preset\",\"id\":2}");
  sim::analog[PIN_ACC] = 3000; run(1000);
  CHECK(activePreset == 1, "ACC hidup + rise → preset Jalan (dapat %d)", activePreset);
  sim::analog[PIN_ACC] = 0; run(1000);
  CHECK(activePreset == 0, "ACC mati + drop → preset Parkir");
  // Starter/cranking: tegangan ACC turun sebentar (100 ms) → jangan langsung turun ke Parkir
  sim::analog[PIN_ACC] = 3000; run(1000);
  sim::analog[PIN_ACC] = 1000; run(100);
  CHECK(activePreset == 1, "BUG: kedip ACC 100 ms (starter) langsung menurunkan ke Parkir");
  sim::analog[PIN_ACC] = 3000; run(1000);
  CHECK(activePreset == 1, "kedip ACC 100 ms (starter) mengubah preset");
  post("{\"cmd\":\"auth\",\"code\":\"1234\"}\n{\"cmd\":\"auto\",\"rise\":false,\"drop\":false}\n{\"cmd\":\"preset\",\"id\":2}");
  sim::analog[PIN_ACC] = 0; run(1000); sim::analog[PIN_ACC] = 3000; run(1000);
  CHECK(activePreset == 2, "otomatis mati tapi preset berubah");
}

static void t_boot_button() {
  boot();
  post("{\"cmd\":\"auth\",\"code\":\"1234\"}\n{\"cmd\":\"security\",\"code\":\"1234\",\"newcode\":\"9876\",\"btpin\":\"111111\",\"appass\":\"rahasia99\"}\n{\"cmd\":\"preset\",\"id\":2,\"code\":\"9876\"}");
  sim::nvs["rzmcal"]["cal"] = std::vector<uint8_t>(sizeof(cal), 7);
  CHECK(accessCode == "9876", "persiapan gagal");
  sim::pinIn[PIN_BOOT] = LOW; run(200); sim::pinIn[PIN_BOOT] = HIGH; run(100);
  CHECK(accessCode == "9876", "tekan sebentar tidak boleh reset");
  sim::pinIn[PIN_BOOT] = LOW; run(5000);
  auto r = post("{}");
  CHECK(r["boot"] == 4 || r["boot"] == 5, "status boot tidak dikirim: %s", http.lastBody.c_str());
  sim::pinIn[PIN_BOOT] = HIGH; run(100);
  CHECK(accessCode == "9876", "lepas di 5 dtk harus batal");
  CHECK(sim::serialLog.find("dibatalkan") != std::string::npos, "log batal tidak ada");
  size_t ap0 = sim::softApPass.size();
  sim::pinIn[PIN_BOOT] = LOW; run(8200);
  CHECK(accessCode == "1234" && btPin == 123456 && apPass == "rzmong123", "reset 8 dtk tidak terjadi");
  int resets = 0; for (size_t p = 0; (p = sim::serialLog.find("KREDENSIAL DIRESET", p)) != std::string::npos; p++) resets++;
  run(10000);
  int resets2 = 0; for (size_t p = 0; (p = sim::serialLog.find("KREDENSIAL DIRESET", p)) != std::string::npos; p++) resets2++;
  CHECK(resets == 1 && resets2 == 1, "terus ditahan tidak boleh reset berulang (%d,%d)", resets, resets2);
  sim::pinIn[PIN_BOOT] = HIGH; run(1000);
  CHECK(sim::softApPass.size() > ap0 && sim::softApPass.back() == "rzmong123", "AP tidak restart dengan sandi default");
  CHECK(presets[2].front == 75 && activePreset == 2, "preset ikut terhapus");
  CHECK(sim::nvs["rzmcal"]["cal"].size() == sizeof(cal) && sim::nvs["rzmcal"]["cal"][0] == 7, "kalibrasi ikut terhapus");
  CHECK(Preferences().begin("rzm", true) && sim::nvs["rzm"].count("preset"), "namespace rzm hilang");
}

static void t_boot_stuck_low() {
  sim::pinIn[PIN_BOOT] = LOW;          // GPIO0 sudah LOW sejak menyala (DTR/RTS serial, tombol macet)
  sim::now = 1000; setPsi(150, 50, 55);
  setup();
  sim::pinIn[PIN_BOOT] = LOW;
  run(15000);
  CHECK(sim::serialLog.find("KREDENSIAL DIRESET") == std::string::npos, "GPIO0 macet LOW sejak boot tidak boleh mereset kredensial");
  sim::pinIn[PIN_BOOT] = HIGH; run(500);
  sim::pinIn[PIN_BOOT] = LOW; run(8500);
  CHECK(sim::serialLog.find("KREDENSIAL DIRESET") != std::string::npos, "setelah dilepas, tahan 8 dtk harus tetap bisa reset");
}

static void t_corrupt_nvs() {
  sim::nvs["rzm"]["preset"] = {7, 0, 0, 0};       // int 7 — di luar 0..2
  sim::nvs["rzm"]["theme"] = {0x40, 0, 0, 0};
  int32_t junk[6] = {-1000, 99999, 5, 5, 5, 5};
  sim::nvs["rzm"]["presets"].assign((uint8_t *)junk, (uint8_t *)junk + sizeof(junk));
  sim::nvs["rzmsec"]["code"] = {'a', 0};            // kode tidak valid (terlalu pendek)
  sim::nvs["rzmsec"]["btpin"] = {0x40, 0x42, 0x0f, 0x00}; // 1000000
  boot();
  CHECK(activePreset >= 0 && activePreset <= 2, "BUG: activePreset dari NVS rusak = %d (indeks presets[] di luar batas)", activePreset);
  CHECK(theme >= 0 && theme <= 2, "theme dari NVS rusak = %d", theme);
  CHECK(accessCode == "1234" && btPin == 123456, "kredensial rusak tidak kembali ke default");
  CHECK(run(1000), "macet");
}

static void t_status_fits_ble() {
  boot();
  bleConnect();
  fault = "belakang buang macet";
  authLockUntil = millis() + 29000;
  bleSession.authed = true; bleSession.ev = "bad_newcode";
  sim::pinIn[PIN_BOOT] = LOW; run(2000);
  sim::bleNotify.clear(); run(300);
  CHECK(!sim::bleNotify.empty(), "tidak ada notify BLE");
  if (sim::bleNotify.empty()) return;
  const std::string &s = sim::bleNotify.back();
  JsonDocument d; auto e = deserializeJson(d, s);
  CHECK(!e && s.size() < 290 && s.back() == '\n', "status BLE terpotong/terlalu besar (%zu byte): %s", s.size(), s.c_str());
}

static void t_watchdog() {
  boot();
  CHECK(sim::loopWdtEnabled, "watchdog loop tidak aktif — kalau loop macet, katup tetap di posisi terakhir");
}

static void t_fuzz_invariants() {
  boot();
  bleConnect();
  ble("{\"cmd\":\"auth\",\"code\":\"1234\"}");
  srand(12345);
  long stopBad = 0;
  const char *cmds[] = {"{\"cmd\":\"preset\",\"id\":%d}", "{\"cmd\":\"manual\",\"axle\":\"front\",\"action\":\"fill\"}", "{\"cmd\":\"manual\",\"axle\":\"rear\",\"action\":\"dump\"}",
                        "{\"cmd\":\"manual\",\"axle\":\"front\",\"action\":\"stop\"}", "{\"cmd\":\"stop\"}", "{\"cmd\":\"set\",\"axle\":\"rear\",\"psi\":%d}"};
  for (int i = 0; i < 3000; i++) {
    setPsi(rand() % 200, rand() % 120, rand() % 120);
    if (rand() % 50 == 0) sim::adsVolts[rand() % 3] = (rand() % 2) ? 0.0f : 5.5f;
    char b[120]; snprintf(b, sizeof(b), cmds[rand() % 6], rand() % 120 - 10);
    bool isStop = strstr(b, "\"stop\"}") && !strstr(b, "manual");
    bool sent = false;
    if (rand() % 3 == 0) { ble(b); sent = true; }
    if (rand() % 7 == 0) { wsSend(0, b); sent = true; }
    if (sent && isStop) { run(1); if (anyValve()) stopBad++; }
    if (!run(rand() % 200 + 1)) { CHECK(false, "macet saat fuzz"); return; }
  }
  CHECK(stopBad == 0, "katup terbuka tepat setelah STOP %ld kali", stopBad);
  CHECK(invariantBad == 0, "isi & buang satu as terbuka bersamaan %ld kali", invariantBad);
}

// Callback BLE berjalan di task lain (core 0) sementara loop() memproses buffer yang sama.
// Di sini dijalankan benar-benar paralel dengan std::thread; AddressSanitizer menangkap kerusakan heap.
static void t_ble_thread_race() {
  boot();
  bleConnect();
  std::atomic<bool> stop{false};
  std::atomic<long> writes{0};
  std::thread w([&] {
    BLECharacteristic c;
    const std::string line = "{\"cmd\":\"auth\",\"code\":\"1234\"}\n{\"cmd\":\"theme\",\"id\":2}\n";
    while (!stop) {
      for (size_t i = 0; i < line.size(); i += 20) { c.value = line.substr(i, 20); sim::bleRx->cb->onWrite(&c); }
      writes++;
    }
  });
  std::thread cn([&] { while (!stop) { sim::bleSrvCb->onDisconnect(sim::bleSrv); sim::bleSrvCb->onConnect(sim::bleSrv); usleep(200); } });
  bool ok = true;
  for (int i = 0; i < 200 && ok; i++) { ok = run(400); usleep(500); }
  stop = true; w.join(); cn.join();
  CHECK(ok && writes > 100, "loop macet / tidak ada tulisan (%ld)", (long)writes);
}

// ---------------- remote internet (MQTT) ----------------
// Task MQTT tidak jalan di simulasi: pesan broker disuntikkan lewat rmCallback() (persis seperti PubSubClient),
// lalu loop() → pollRemote() memprosesnya. Tanda tangan HMAC-SHA256 dibuat sama seperti web/app (remote.js).
static uint32_t rmQ = 0;
static std::string rmSigned(const std::string &json, const std::string &code) {
  char hex[65]; hmacHex(String(code.c_str()), json.c_str(), json.size(), hex);
  return std::string(hex) + " " + json;
}
static std::string rmCmd(const std::string &body, const std::string &code, uint32_t q = 0) {
  if (!q) q = ++rmQ;
  return rmSigned("{" + body + ",\"n\":\"" + std::string(rmNonce) + "\",\"q\":" + std::to_string(q) + ",\"r\":\"t\"}", code);
}
static std::vector<std::string> rmEvents() {
  std::vector<std::string> v; char b[RM_EV_MAX];
  while (xQueueReceive(rmEvQ, b, 0) == pdTRUE) v.push_back(b);
  return v;
}
static std::string rmSend(const std::string &msg) {
  rmCallback(nullptr, (byte *)msg.data(), msg.size());
  run(1);
  auto v = rmEvents();
  return v.empty() ? "" : v.back();
}
static void rmSetup(const char *code = "Kode-8899") {
  boot();
  post(std::string("{\"cmd\":\"security\",\"code\":\"1234\",\"newcode\":\"") + code + "\"}");
  auto r = post(std::string("{\"cmd\":\"remote\",\"code\":\"") + code + "\",\"on\":true,\"host\":\"abc.emqxsl.com\",\"port\":8883,\"user\":\"modul\",\"pass\":\"RahasiaBroker1\"}");
  strcpy(rmNonce, "0123456789abcdef");
  rmState = 3; rmLastQ = 0; rmQ = 0;
  rmEvents();
}

static void t_remote_config() {
  boot();
  CHECK(!rmOn && rmStateCode() == 0 && sim::tasksCreated == 1, "remote harus MATI secara default (task tetap siap)");
  CHECK(rmId.length() == 21 && rmId.c_str()[12] == '-', "id perangkat salah format: %s", rmId.c_str());
  auto r = post("{\"cmd\":\"remote\",\"code\":\"1234\",\"on\":true,\"host\":\"abc.emqxsl.com\",\"user\":\"u\",\"pass\":\"p\"}");
  CHECK(r["ev"] == "rm_default_code" && !rmOn, "remote boleh aktif saat kode masih 1234: %s", http.lastBody.c_str());
  post("{\"cmd\":\"security\",\"code\":\"1234\",\"newcode\":\"Kode-8899\"}");
  r = post("{\"cmd\":\"remote\",\"code\":\"salah\",\"on\":true,\"host\":\"abc.emqxsl.com\"}");
  CHECK(r["ev"] == "bad_code" && !rmOn, "kode salah diterima");
  r = post("{\"cmd\":\"remote\",\"code\":\"Kode-8899\",\"on\":true,\"host\":\"bad host/x\"}");
  CHECK(r["ev"] == "bad_remote", "host tidak valid diterima");
  r = post("{\"cmd\":\"remote\",\"code\":\"Kode-8899\",\"on\":true,\"host\":\"ABC.emqxsl.com\",\"port\":8883,\"user\":\"modul\",\"pass\":\"RahasiaBroker1\"}");
  CHECK(r["ev"] == "saved" && rmOn && rmHost == "abc.emqxsl.com", "simpan remote gagal: %s", http.lastBody.c_str());
  CHECK(Preferences().begin("rzmrm", true), "NVS rzmrm tidak ada");
  // status lokal & telemetri tidak boleh membawa host/user/sandi broker
  bool leak = http.lastBody.s.find("RahasiaBroker1") != std::string::npos || http.lastBody.s.find("emqxsl") != std::string::npos;
  strcpy(rmNonce, "0123456789abcdef"); rmState = 3; rmForcePub = true; run(5);
  std::string tel = rmStatusBuf;
  leak |= tel.find("RahasiaBroker1") != std::string::npos || tel.find("modul") != std::string::npos || tel.find("Kode-8899") != std::string::npos;
  leak |= sim::serialLog.find("RahasiaBroker1") != std::string::npos;
  CHECK(!leak, "rahasia broker/kode bocor: %s", tel.c_str());
  JsonDocument t; CHECK(!deserializeJson(t, tel) && t["n"] == "0123456789abcdef" && t["fw"] == FW_VERSION, "telemetri tidak valid: %s", tel.c_str());
  // reset BOOT mematikan remote
  sim::pinIn[PIN_BOOT] = LOW; run(8300); sim::pinIn[PIN_BOOT] = HIGH; run(100);
  CHECK(!rmOn && accessCode == "1234", "reset BOOT tidak mematikan remote");
}

static void t_remote_signed_cmds() {
  rmSetup();
  std::string e = rmSend(rmCmd("\"cmd\":\"preset\",\"id\":2", "Kode-8899"));
  CHECK(e.find("\"ok\"") != std::string::npos && activePreset == 2, "preset bertanda tangan ditolak: %s", e.c_str());
  e = rmSend(rmCmd("\"cmd\":\"preset\",\"id\":0", "Kode-8899", rmQ));   // q sama → replay
  CHECK(e.find("stale") != std::string::npos && activePreset == 2, "replay diterima: %s", e.c_str());
  std::string old = rmCmd("\"cmd\":\"preset\",\"id\":0", "Kode-8899");
  strcpy(rmNonce, "ffffffffffffffff");                                 // modul reconnect → nonce baru
  e = rmSend(old);
  CHECK(e.find("stale") != std::string::npos && activePreset == 2, "nonce lama diterima: %s", e.c_str());
  e = rmSend("{\"cmd\":\"preset\",\"id\":0}");                           // tanpa tanda tangan
  CHECK(activePreset == 2, "preset tanpa tanda tangan diterima");
  for (const char *c : {"\"cmd\":\"security\",\"code\":\"Kode-8899\",\"newcode\":\"x1234567\"", "\"cmd\":\"wifi\",\"ssid\":\"x\"", "\"cmd\":\"remote\",\"code\":\"Kode-8899\",\"on\":false", "\"cmd\":\"rinfo\""}) {
    e = rmSend(rmCmd(c, "Kode-8899"));
    CHECK(e.find("local_only") != std::string::npos, "perintah lokal-saja diterima lewat remote: %s", c);
  }
  CHECK(accessCode == "Kode-8899" && rmOn, "pengaturan berubah lewat remote");
  e = rmSend(rmCmd("\"cmd\":\"manual\",\"axle\":\"front\",\"action\":\"fill\"", "Kode-8899"));
  CHECK(e.find("no_manual_remote") != std::string::npos && !axF.manual, "isi manual lewat internet diterima: %s", e.c_str());
  e = rmSend(rmCmd("\"cmd\":\"set\",\"axle\":\"rear\",\"psi\":999", "Kode-8899"));
  CHECK(presets[2].rear == BAG_MAX, "batas PSI tidak berlaku lewat remote (%d)", presets[2].rear);
}

static void t_remote_lockout_shared() {
  rmSetup();
  for (int i = 0; i < 5; i++) rmSend(rmCmd("\"cmd\":\"preset\",\"id\":0", "tebak" + std::to_string(i)));
  CHECK(lockLeftMs() > 0, "5x tanda tangan salah tidak mengunci");
  std::string e = rmSend(rmCmd("\"cmd\":\"preset\",\"id\":0", "Kode-8899"));
  CHECK(e.find("locked") != std::string::npos && activePreset == 1, "kode benar diterima saat terkunci: %s", e.c_str());
  auto r = post("{\"cmd\":\"auth\",\"code\":\"Kode-8899\"}");
  CHECK(r["ev"] == "locked", "kunci remote tidak berlaku untuk jalur lokal: %s", http.lastBody.c_str());
  // STOP tetap jalan saat terkunci
  setPsi(150, 20, 20); run(200);
  rmSend("{\"cmd\":\"stop\",\"r\":\"s\"}");
  CHECK(!anyValve() && levelHold, "STOP remote ditolak saat terkunci");
  run(31000);
  e = rmSend(rmCmd("\"cmd\":\"preset\",\"id\":0", "Kode-8899"));
  CHECK(e.find("\"ok\"") != std::string::npos && activePreset == 0, "setelah 30 dtk kode benar harus diterima: %s", e.c_str());
}

static void t_remote_stop_hold() {
  rmSetup();
  setPsi(150, 20, 20); run(200);
  CHECK(on(PIN_FILL_F) && on(PIN_FILL_R), "harusnya mengisi");
  std::string e = rmSend("{\"cmd\":\"stop\",\"r\":\"s\"}");                // STOP tanpa tanda tangan
  CHECK(!anyValve() && levelHold && e.find("stop_ok") != std::string::npos, "STOP remote tidak menutup katup: %s", e.c_str());
  run(5000);
  CHECK(!anyValve(), "BUG: leveling membuka katup lagi setelah STOP remote");
  rmSend(rmCmd("\"cmd\":\"theme\",\"id\":2", "Kode-8899")); run(2000);
  CHECK(!anyValve() && levelHold, "perintah lain (tema) membatalkan STOP hold");
  rmSend(rmCmd("\"cmd\":\"preset\",\"id\":1", "Kode-8899")); run(200);
  CHECK(!levelHold && on(PIN_FILL_F), "preset remote harus melanjutkan leveling");
  // STOP remote juga melepas tombol manual lokal yang sedang ditahan
  bleConnect(); ble("{\"cmd\":\"auth\",\"code\":\"Kode-8899\"}");
  setPsi(150, 50, 55); run(300);
  ble("{\"cmd\":\"manual\",\"axle\":\"rear\",\"action\":\"dump\"}"); run(300);
  CHECK(on(PIN_DUMP_R), "manual lokal tidak jalan");
  rmSend("{\"cmd\":\"stop\"}"); run(500);
  CHECK(!anyValve() && !axR.manual, "STOP remote tidak membatalkan manual lokal");
  // STOP masuk walau antrean perintah penuh
  rmSend(rmCmd("\"cmd\":\"preset\",\"id\":1", "Kode-8899"));
  setPsi(150, 20, 20); run(200);
  std::string junk = rmCmd("\"cmd\":\"theme\",\"id\":1", "Kode-8899");
  for (int i = 0; i < 6; i++) rmCallback(nullptr, (byte *)junk.data(), junk.size());
  std::string st = "{\"cmd\":\"stop\"}";
  rmCallback(nullptr, (byte *)st.data(), st.size());
  run(1);
  CHECK(!anyValve() && levelHold, "STOP hilang saat antrean penuh");
}

struct T { const char *name; void (*fn)(); };
static const T TESTS[] = {
  {"boot & kredensial default", t_boot_default},
  {"kode akses & kunci 5x salah / 30 dtk", t_auth_lockout},
  {"kunci saat millis() overflow", t_lockout_millis_wrap},
  {"validasi ganti kredensial + kebocoran rahasia", t_security_validation},
  {"input JSON rusak / ekstrem", t_bad_json},
  {"BLE + WebSocket + HTTP bersamaan", t_ble_ws_http_concurrent},
  {"STOP menahan semua katup", t_stop_holds},
  {"kontrol manual (tahan tombol)", t_manual},
  {"timeout isi 90 dtk (bocor) terkunci", t_fill_timeout_latch},
  {"timeout isi saat millis() overflow", t_fill_timeout_wrap},
  {"sensor putus / korslet", t_sensor_fault},
  {"ADS1115 lepas saat jalan", t_ads_missing},
  {"ADS1115 tidak ada saat boot", t_ads_missing_at_boot},
  {"kompresor histeresis & batas waktu", t_compressor},
  {"ACC naik/turun otomatis + debounce", t_ignition},
  {"tombol BOOT 8 dtk / batal", t_boot_button},
  {"GPIO0 macet LOW sejak boot", t_boot_stuck_low},
  {"NVS rusak", t_corrupt_nvs},
  {"ukuran status BLE", t_status_fits_ble},
  {"watchdog loop", t_watchdog},
  {"BLE tulis paralel (thread) vs loop()", t_ble_thread_race},
  {"fuzz 3000 langkah: isi+buang tidak bersamaan, STOP", t_fuzz_invariants},
  {"remote: default mati, simpan, rahasia tidak bocor, reset BOOT", t_remote_config},
  {"remote: tanda tangan HMAC, anti-replay, lokal-saja, manual ditolak", t_remote_signed_cmds},
  {"remote: kunci 5x salah bersama jalur lokal, STOP tetap jalan", t_remote_lockout_shared},
  {"remote: STOP hold + manual lokal + antrean penuh", t_remote_stop_hold},
};

int main(int argc, char **argv) {
  int pass = 0, fail = 0;
  for (auto &t : TESTS) {
    if (argc > 1 && !strstr(t.name, argv[1])) continue;
    fflush(stdout);
    pid_t p = fork();
    if (p == 0) { t.fn(); fflush(stderr); _exit(g_fail ? 1 : 0); }
    int st = 0; waitpid(p, &st, 0);
    bool ok = WIFEXITED(st) && WEXITSTATUS(st) == 0;
    if (!WIFEXITED(st)) fprintf(stderr, "    CRASH (sinyal %d)\n", WIFSIGNALED(st) ? WTERMSIG(st) : -1);
    printf("%s  %s\n", ok ? "LULUS" : "GAGAL", t.name);
    ok ? pass++ : fail++;
  }
  printf("\n%d lulus, %d gagal\n", pass, fail);
  return fail ? 1 : 0;
}
