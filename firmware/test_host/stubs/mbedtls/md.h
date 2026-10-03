// HMAC-SHA256 asli (implementasi kecil) supaya tes bisa menandatangani perintah remote seperti web/app.
#pragma once
#include <cstdint>
#include <cstring>
#include <cstddef>
typedef enum { MBEDTLS_MD_SHA256 = 6 } mbedtls_md_type_t;
struct mbedtls_md_info_t { int t; };
inline const mbedtls_md_info_t *mbedtls_md_info_from_type(mbedtls_md_type_t) { static mbedtls_md_info_t i{6}; return &i; }
namespace simsha {
static const uint32_t K[64] = {
0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2};
inline uint32_t ror(uint32_t x, int n) { return (x >> n) | (x << (32 - n)); }
inline void sha256(const uint8_t *m, size_t len, uint8_t out[32]) {
  uint32_t h[8] = {0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19};
  size_t tot = ((len + 9 + 63) / 64) * 64;
  uint8_t *b = new uint8_t[tot]();
  memcpy(b, m, len); b[len] = 0x80;
  uint64_t bits = (uint64_t)len * 8;
  for (int i = 0; i < 8; i++) b[tot - 1 - i] = bits >> (8 * i);
  for (size_t o = 0; o < tot; o += 64) {
    uint32_t w[64];
    for (int i = 0; i < 16; i++) w[i] = (b[o+4*i] << 24) | (b[o+4*i+1] << 16) | (b[o+4*i+2] << 8) | b[o+4*i+3];
    for (int i = 16; i < 64; i++) { uint32_t s0 = ror(w[i-15],7)^ror(w[i-15],18)^(w[i-15]>>3), s1 = ror(w[i-2],17)^ror(w[i-2],19)^(w[i-2]>>10); w[i] = w[i-16]+s0+w[i-7]+s1; }
    uint32_t a=h[0],bb=h[1],c=h[2],d=h[3],e=h[4],f=h[5],g=h[6],hh=h[7];
    for (int i = 0; i < 64; i++) {
      uint32_t t1 = hh + (ror(e,6)^ror(e,11)^ror(e,25)) + ((e&f)^(~e&g)) + K[i] + w[i];
      uint32_t t2 = (ror(a,2)^ror(a,13)^ror(a,22)) + ((a&bb)^(a&c)^(bb&c));
      hh=g; g=f; f=e; e=d+t1; d=c; c=bb; bb=a; a=t1+t2;
    }
    h[0]+=a; h[1]+=bb; h[2]+=c; h[3]+=d; h[4]+=e; h[5]+=f; h[6]+=g; h[7]+=hh;
  }
  delete[] b;
  for (int i = 0; i < 8; i++) for (int j = 0; j < 4; j++) out[4*i+j] = h[i] >> (24 - 8*j);
}
}
inline int mbedtls_md_hmac(const mbedtls_md_info_t *, const uint8_t *key, size_t kl, const uint8_t *msg, size_t ml, uint8_t *out) {
  uint8_t k[64] = {0};
  if (kl > 64) simsha::sha256(key, kl, k); else memcpy(k, key, kl);
  uint8_t *in = new uint8_t[64 + ml];
  for (int i = 0; i < 64; i++) in[i] = k[i] ^ 0x36;
  memcpy(in + 64, msg, ml);
  uint8_t ih[32]; simsha::sha256(in, 64 + ml, ih); delete[] in;
  uint8_t o2[96]; for (int i = 0; i < 64; i++) o2[i] = k[i] ^ 0x5c; memcpy(o2 + 64, ih, 32);
  simsha::sha256(o2, 96, out);
  return 0;
}
