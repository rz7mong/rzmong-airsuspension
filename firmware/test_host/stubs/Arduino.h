// Stub Arduino minimal untuk menjalankan firmware RZMONG di PC (simulasi host).
// BUKAN untuk ESP32. Dipakai oleh firmware/test_host/test_firmware.cpp.
#pragma once
#include <cstdint>
#include <cstddef>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <cstdarg>
#include <cmath>
#include <string>
#include <vector>
#include <map>
#include <functional>
#include <algorithm>
#include <stdexcept>
#include <cctype>

#define PROGMEM
#define LOW 0
#define HIGH 1
#define INPUT 0x01
#define OUTPUT 0x03
#define INPUT_PULLUP 0x05
#define constrain(amt, low, high) ((amt) < (low) ? (low) : ((amt) > (high) ? (high) : (amt)))
using std::min;
using std::max;

class String {
 public:
  std::string s;
  String() {}
  String(const char *c) : s(c ? c : "") {}
  String(const std::string &x) : s(x) {}
  String(const String &o) = default;
  String &operator=(const String &o) = default;
  explicit String(int v) : s(std::to_string(v)) {}
  explicit String(unsigned v) : s(std::to_string(v)) {}
  size_t length() const { return s.size(); }
  bool isEmpty() const { return s.empty(); }
  const char *c_str() const { return s.c_str(); }
  char operator[](size_t i) const { return i < s.size() ? s[i] : 0; }
  char &operator[](size_t i) { return s[i]; }
  const char *begin() const { return s.data(); }
  const char *end() const { return s.data() + s.size(); }
  int indexOf(char c, unsigned from = 0) const { auto p = s.find(c, from); return p == std::string::npos ? -1 : (int)p; }
  String substring(unsigned a) const { return a >= s.size() ? String() : String(s.substr(a)); }
  String substring(unsigned a, unsigned b) const { if (a > b) std::swap(a, b); if (a >= s.size()) return String(); return String(s.substr(a, std::min<size_t>(b, s.size()) - a)); }
  void remove(unsigned i, unsigned n) { if (i < s.size()) s.erase(i, n); }
  void toLowerCase() { for (auto &c : s) c = (char)tolower((unsigned char)c); }
  void trim() { size_t a = s.find_first_not_of(" \t\r\n"); if (a == std::string::npos) { s.clear(); return; } size_t b = s.find_last_not_of(" \t\r\n"); s = s.substr(a, b - a + 1); }
  bool startsWith(const String &p) const { return s.compare(0, p.s.size(), p.s) == 0; }
  long toInt() const { return atol(s.c_str()); }
  bool reserve(unsigned n) { s.reserve(n); return true; }
  bool concat(const char *c) { s += c; return true; }
  bool concat(const char *c, size_t n) { s.append(c, n); return true; }
  String &operator+=(const String &o) { s += o.s; return *this; }
  String &operator+=(const char *o) { s += o; return *this; }
  String &operator+=(char c) { s += c; return *this; }
  friend String operator+(const String &a, const String &b) { return String(a.s + b.s); }
  friend String operator+(const String &a, const char *b) { return String(a.s + b); }
  friend String operator+(const char *a, const String &b) { return String(std::string(a) + b.s); }
  bool operator==(const String &o) const { return s == o.s; }
  bool operator==(const char *o) const { return s == o; }
  bool operator!=(const String &o) const { return s != o.s; }
  bool operator!=(const char *o) const { return s != o; }
};

// ---------- dunia simulasi ----------
namespace sim {
struct Hang : std::runtime_error { Hang(const char *w) : std::runtime_error(w) {} };
extern uint32_t now;
extern int pinMode_[40];
extern int pinOut[40];
extern int pinIn[40];
extern int analog[40];
extern std::string serialLog;
extern bool echoSerial;
extern bool loopWdtEnabled;
}

inline uint32_t millis() { return sim::now; }
inline void delay(uint32_t ms) { sim::now += ms; }
inline void yield() {}
inline void pinMode(int p, int m) { sim::pinMode_[p] = m; if (m == INPUT_PULLUP) sim::pinIn[p] = HIGH; }
inline void digitalWrite(int p, int v) { sim::pinOut[p] = v ? HIGH : LOW; }
inline int digitalRead(int p) { return (sim::pinMode_[p] == OUTPUT) ? sim::pinOut[p] : sim::pinIn[p]; }
inline int analogRead(int p) { return sim::analog[p]; }
inline void enableLoopWDT() { sim::loopWdtEnabled = true; }
inline void feedLoopWDT() {}

class HardwareSerial {
 public:
  void begin(unsigned long) {}
  void out(const std::string &t) { sim::serialLog += t; if (sim::echoSerial) fputs(t.c_str(), stdout); }
  void print(const char *t) { out(t); }
  void print(const String &t) { out(t.s); }
  void println(const char *t = "") { out(std::string(t) + "\n"); }
  void println(const String &t) { out(t.s + "\n"); }
  void printf(const char *fmt, ...) __attribute__((format(printf, 2, 3))) {
    char b[512]; va_list a; va_start(a, fmt); vsnprintf(b, sizeof(b), fmt, a); va_end(a); out(b);
  }
};
extern HardwareSerial Serial;

class IPAddress {
 public:
  uint8_t o[4];
  IPAddress(uint8_t a = 0, uint8_t b = 0, uint8_t c = 0, uint8_t d = 0) : o{a, b, c, d} {}
  String toString() const { char b[20]; snprintf(b, sizeof(b), "%u.%u.%u.%u", o[0], o[1], o[2], o[3]); return String(b); }
};
