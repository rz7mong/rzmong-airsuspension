// Stub PubSubClient: tidak pernah tersambung (task remote tidak dijalankan di simulasi host).
#pragma once
#include "sim_hw.h"
#include "WiFiClientSecure.h"
#define MQTT_CONNECT_BAD_CREDENTIALS 4
#define MQTT_CONNECT_UNAUTHORIZED 5
typedef void (*MqttCb)(char *, uint8_t *, unsigned int);
class PubSubClient {
 public:
  PubSubClient(WiFiClientSecure &) {}
  bool connected() { return false; }
  bool connect(const char *, const char *, const char *, const char *, int, bool, const char *) { return false; }
  void disconnect() {}
  bool publish(const char *, const char *, bool = false) { return false; }
  bool subscribe(const char *, int = 0) { return false; }
  bool loop() { return false; }
  int state() { return -2; }
  void setServer(const char *, uint16_t) {}
  bool setBufferSize(uint16_t) { return true; }
  void setKeepAlive(uint16_t) {}
  void setSocketTimeout(uint16_t) {}
  void setCallback(MqttCb) {}
};
