#!/usr/bin/env bash
# Gabungkan bootloader + partisi + boot_app0 + aplikasi jadi satu .bin (offset 0) untuk ESP Web Tools.
# Pakai setelah: pio run -e esp32dev   (jalankan dari folder firmware/)
set -euo pipefail
OUT_DIR="${1:-../web/flash/firmware}"
B=.pio/build/esp32dev
PIO_HOME="${PLATFORMIO_CORE_DIR:-$HOME/.platformio}"
ESPTOOL="$PIO_HOME/packages/tool-esptoolpy/esptool.py"
BOOT_APP0="$PIO_HOME/packages/framework-arduinoespressif32/tools/partitions/boot_app0.bin"
PY="${PYTHON:-python3}"
[ -x "$PIO_HOME/penv/bin/python" ] && PY="$PIO_HOME/penv/bin/python"
mkdir -p "$OUT_DIR"
"$PY" "$ESPTOOL" --chip esp32 merge_bin -o "$OUT_DIR/rzmong-airsuspension-esp32-merged.bin" \
  --flash_mode dio --flash_freq 40m --flash_size 4MB \
  0x1000 "$B/bootloader.bin" 0x8000 "$B/partitions.bin" 0xe000 "$BOOT_APP0" 0x10000 "$B/firmware.bin"
cp "$B/firmware.bin" "$OUT_DIR/rzmong-airsuspension-esp32-app.bin"
echo "OK -> $OUT_DIR"
ls -la "$OUT_DIR"
