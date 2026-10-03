// FreeRTOS minimal untuk simulasi host (antrean & mutex). Task TIDAK dijalankan: tes memanggil
// rmCallback()/pollRemote() langsung dan mengatur rmState/rmNonce sendiri.
#pragma once
#include <deque>
#include <vector>
#include <cstdint>
#include <cstring>
typedef int BaseType_t;
typedef uint32_t TickType_t;
#define pdTRUE 1
#define pdFALSE 0
#define pdPASS 1
#define portMAX_DELAY 0xffffffffu
#define pdMS_TO_TICKS(ms) ((TickType_t)(ms))
struct SimQueue { size_t item, cap; std::deque<std::vector<uint8_t>> q; };
typedef SimQueue *QueueHandle_t;
typedef void *SemaphoreHandle_t;
typedef void *TaskHandle_t;
inline QueueHandle_t xQueueCreate(size_t n, size_t item) { return new SimQueue{item, n, {}}; }
inline BaseType_t xQueueSend(QueueHandle_t h, const void *p, TickType_t) {
  if (!h || h->q.size() >= h->cap) return pdFALSE;
  h->q.emplace_back((const uint8_t *)p, (const uint8_t *)p + h->item); return pdTRUE;
}
inline BaseType_t xQueueReceive(QueueHandle_t h, void *p, TickType_t) {
  if (!h || h->q.empty()) return pdFALSE;
  memcpy(p, h->q.front().data(), h->item); h->q.pop_front(); return pdTRUE;
}
inline SemaphoreHandle_t xSemaphoreCreateMutex() { static int m; return &m; }
inline BaseType_t xSemaphoreTake(SemaphoreHandle_t, TickType_t) { return pdTRUE; }
inline BaseType_t xSemaphoreGive(SemaphoreHandle_t) { return pdTRUE; }
namespace sim { extern int tasksCreated; }
inline BaseType_t xTaskCreatePinnedToCore(void (*)(void *), const char *, uint32_t, void *, int, TaskHandle_t *, int) { sim::tasksCreated++; return pdPASS; }
inline void vTaskDelay(TickType_t) {}
