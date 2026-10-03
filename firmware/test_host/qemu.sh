#!/usr/bin/env bash
# Uji boot firmware di emulator ESP32 (Espressif QEMU). BLE, WiFi, dan ADC TIDAK diemulasikan,
# jadi env esp32dev_qemu melewati bagian itu. Yang dicek: boot, NVS, kredensial default, loop
# tidak macet/panic, dan ADS1115 yang tidak menjawab ditangani (katup & kompresor mati).
# Pakai (dari folder firmware/): test_host/qemu.sh [detik]   (Linux x86_64)
set -euo pipefail
cd "$(dirname "$0")/.."
SECS="${1:-30}"
QVER=esp-develop-9.2.2-20260417
QFILE=qemu-xtensa-softmmu-esp_develop_9.2.2_20260417-x86_64-linux-gnu.tar.xz
QDIR=test_host/.deps/qemu
QEMU="$QDIR/qemu/bin/qemu-system-xtensa"
if [ ! -x "$QEMU" ]; then
  mkdir -p "$QDIR"
  curl -sL -o "$QDIR/q.tar.xz" "https://github.com/espressif/qemu/releases/download/$QVER/$QFILE"
  tar -xJf "$QDIR/q.tar.xz" -C "$QDIR"
fi
pio run -e esp32dev_qemu
PIO="${PLATFORMIO_CORE_DIR:-$HOME/.platformio}"
PY=python3; [ -x "$PIO/penv/bin/python" ] && PY="$PIO/penv/bin/python"
B=.pio/build/esp32dev_qemu
"$PY" "$PIO/packages/tool-esptoolpy/esptool.py" --chip esp32 merge_bin -o "$B/qemu_flash.bin" --fill-flash-size 4MB \
  --flash_mode dio --flash_freq 40m --flash_size 4MB 0x1000 "$B/bootloader.bin" 0x8000 "$B/partitions.bin" \
  0xe000 "$PIO/packages/framework-arduinoespressif32/tools/partitions/boot_app0.bin" 0x10000 "$B/firmware.bin" >/dev/null
echo "== QEMU $SECS detik (Ctrl+A lalu X untuk keluar) =="
timeout "$SECS" "$QEMU" -nographic -machine esp32 -m 4M -drive file="$B/qemu_flash.bin",if=mtd,format=raw \
  -nic user,model=open_eth -serial mon:stdio || true
