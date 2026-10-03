// Kalibrasi 3 sensor tekanan RZMONG Airsuspension.
// Tidak menggerakkan solenoid atau kompresor.
// Board: ESP32 Dev Module. Library: Adafruit ADS1X15.
//
// ADS1115 A0 tangki, A1 depan, A2 belakang. SDA 21, SCL 22.
// Serial 115200.
//
// Perintah:
//   z          nol-kan ketiganya, sistem harus kosong ke udara
//   t 100      titik ukur tangki, angka = psi di gauge pembanding
//   f 100      titik ukur depan
//   r 100      titik ukur belakang
//   s          simpan ke memori
//   p          tampilkan hasil
//   c          hapus kalibrasi

#include <Wire.h>
#include <Adafruit_ADS1X15.h>
#include <Preferences.h>

Adafruit_ADS1115 ads;
Preferences prefs;

struct Cal {
  float v0;
  float vRef;
  float pRef;
  bool ready;
};

Cal cal[3] = {
  {0.50f, 4.50f, 200.0f, false},
  {0.50f, 4.50f, 200.0f, false},
  {0.50f, 4.50f, 200.0f, false}
};

const char *names[3] = {"tangki", "depan", "belakang"};

float volts(uint8_t ch) {
  int32_t acc = 0;
  for (int i = 0; i < 16; i++) acc += ads.readADC_SingleEnded(ch);
  return (acc / 16.0f) * 0.0001875f;
}

float toPsi(uint8_t ch, float v) {
  float span = cal[ch].vRef - cal[ch].v0;
  if (span < 0.05f) return 0;
  float psi = (v - cal[ch].v0) * (cal[ch].pRef / span);
  if (psi < 0) psi = 0;
  if (psi > 250) psi = 250;
  return psi;
}

void printNow() {
  for (uint8_t i = 0; i < 3; i++) {
    float v = volts(i);
    Serial.printf("%s  %5.3f V  %6.1f psi  v0=%.3f vRef=%.3f pRef=%.1f %s\n",
                  names[i], v, toPsi(i, v), cal[i].v0, cal[i].vRef, cal[i].pRef,
                  cal[i].ready ? "OK" : "default");
  }
  Serial.println("---");
}

void saveCal() {
  prefs.begin("rzmcal", false);
  prefs.putBytes("cal", cal, sizeof(cal));
  prefs.end();
  Serial.println("tersimpan. Firmware utama membaca namespace rzmcal.");
}

void loadCal() {
  prefs.begin("rzmcal", true);
  if (prefs.isKey("cal")) prefs.getBytes("cal", cal, sizeof(cal));
  prefs.end();
}

void clearCal() {
  for (uint8_t i = 0; i < 3; i++) {
    cal[i] = {0.50f, 4.50f, 200.0f, false};
  }
  saveCal();
  Serial.println("kalibrasi dihapus");
}

void zeroAll() {
  for (uint8_t i = 0; i < 3; i++) cal[i].v0 = volts(i);
  Serial.println("nol tercatat. Pastikan tidak ada tekanan.");
  printNow();
}

void spanOne(uint8_t ch, float psi) {
  if (psi < 20 || psi > 180) {
    Serial.println("psi acuan 20 sampai 180");
    return;
  }
  cal[ch].vRef = volts(ch);
  cal[ch].pRef = psi;
  cal[ch].ready = true;
  Serial.printf("%s diikat ke %.1f psi pada %.3f V\n", names[ch], psi, cal[ch].vRef);
}

void handle(String line) {
  line.trim();
  if (line == "z") zeroAll();
  else if (line == "s") saveCal();
  else if (line == "p") printNow();
  else if (line == "c") clearCal();
  else if (line.startsWith("t ")) spanOne(0, line.substring(2).toFloat());
  else if (line.startsWith("f ")) spanOne(1, line.substring(2).toFloat());
  else if (line.startsWith("r ")) spanOne(2, line.substring(2).toFloat());
  else Serial.println("perintah: z | t 100 | f 100 | r 100 | s | p | c");
}

void setup() {
  Serial.begin(115200);
  delay(400);
  Wire.begin(21, 22);
  if (!ads.begin()) Serial.println("ADS1115 tidak ditemukan");
  ads.setGain(GAIN_TWOTHIRDS);
  loadCal();
  Serial.println("Kalibrasi RZMONG Airsuspension. Ketik p untuk lihat, z untuk nol.");
  printNow();
}

void loop() {
  static uint32_t last = 0;
  if (millis() - last > 1000) {
    last = millis();
    printNow();
  }
  if (Serial.available()) handle(Serial.readStringUntil('\n'));
}
