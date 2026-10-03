#!/usr/bin/env bash
# Simulasi host firmware RZMONG (tanpa ESP32). Butuh g++ (Linux/macOS/WSL).
# Pakai: firmware/test_host/run.sh [potongan-nama-tes]
set -euo pipefail
cd "$(dirname "$0")"
AJ=../.pio/libdeps/esp32dev/ArduinoJson/src
if [ ! -f "$AJ/ArduinoJson.h" ]; then
  AJ=.deps/ArduinoJson/src
  [ -f "$AJ/ArduinoJson.h" ] || git clone -q --depth 1 --branch v7.4.2 https://github.com/bblanchon/ArduinoJson.git .deps/ArduinoJson
fi
mkdir -p build
g++ -std=gnu++17 -g -O1 -Wall -Wextra -Wno-unused-parameter -fsanitize=address,undefined -fno-sanitize-recover=undefined -pthread \
  -I stubs -I "$AJ" -DARDUINOJSON_ENABLE_ARDUINO_STRING=1 -DARDUINOJSON_ENABLE_ARDUINO_STREAM=0 \
  -DARDUINOJSON_ENABLE_ARDUINO_PRINT=0 -DARDUINOJSON_ENABLE_PROGMEM=0 \
  test_firmware.cpp -o build/test_firmware
ASAN_OPTIONS=detect_leaks=0 ./build/test_firmware "$@"
