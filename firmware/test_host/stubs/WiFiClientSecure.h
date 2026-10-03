#pragma once
#include "sim_hw.h"
class WiFiClientSecure {
 public:
  void setCACert(const char *) {}
  void setHandshakeTimeout(unsigned long) {}
  void stop() {}
};
