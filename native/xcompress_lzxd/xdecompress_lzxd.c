// Minimal XMem/XCompress (LZX) decompressor wrapper for LCEConvert.
//
// Exports a single `xdecompress()` symbol that is:
//   - compiled to WebAssembly by scripts/build_wasm.mjs (primary use case)
//   - also usable as a native shared library via ctypes if needed
//
// Implementation notes:
// - Uses libmspack's LZX decoder (lzxd) vendored at vendor/mspack/.
//   License: LGPL-2.1 — see LICENSES/LGPL-2.1.txt.
// - Supports two input formats:
//   1) Raw XMemDecompress-style LZX stream (per-chunk headers embedded in stream)
//   2) XCompress "native" container (magic 0x0FF512EE) containing multiple blocks.
//
// No dependency on any other third-party code beyond vendor/mspack.

#include <stdint.h>
#include <stdlib.h>
#include <string.h>

// vendor/mspack headers (libmspack subset, LGPL-2.1 — Stuart Caie)
#include "system.h"
#include "lzx.h"

// libmspack error codes
#ifndef MSPACK_ERR_OK
#define MSPACK_ERR_OK 0
#endif

// Some streams require a small amount of zero padding past the end.
#define LCE_PAD 16

typedef struct {
    const uint8_t *buf;
    size_t size;
    size_t pos;
    size_t block_remaining;
} lce_in_file;

typedef struct {
    uint8_t *buf;
    size_t size;
    size_t pos;
} lce_out_file;

static void *lce_alloc(struct mspack_system *self, size_t bytes) {
    (void)self;
    return malloc(bytes);
}

static void lce_free(void *ptr) {
    free(ptr);
}

static void lce_copy(void *src, void *dst, size_t bytes) {
    memcpy(dst, src, bytes);
}

static int lce_read(struct mspack_file *file, void *buffer, int bytes) {
    lce_in_file *in = (lce_in_file *)file;
    if (!in || !buffer || bytes < 0) return -1;
    if ((size_t)bytes == 0) return 0;

    // The XMemDecompress LZX stream is chunked. Each chunk begins with either:
    // - 0xFF, u16(uncompressed_size), u16(compressed_size)
    // - u16(compressed_size)
    // We only need the compressed_size to know how much to feed into lzxd.
    if (in->block_remaining == 0) {
        if (in->pos >= in->size) return 0;

        if (in->buf[in->pos] == 0xFF) {
            if (in->pos + 5 > in->size) return 0;
            in->block_remaining = ((size_t)in->buf[in->pos + 3] << 8) | (size_t)in->buf[in->pos + 4];
            in->pos += 5;
        } else {
            if (in->pos + 2 > in->size) return 0;
            in->block_remaining = ((size_t)in->buf[in->pos + 0] << 8) | (size_t)in->buf[in->pos + 1];
            in->pos += 2;
        }

        // Clamp to remaining buffer.
        if (in->block_remaining > (in->size - in->pos)) {
            in->block_remaining = in->size - in->pos;
        }
    }

    size_t want = (size_t)bytes;
    if (want > in->block_remaining) want = in->block_remaining;
    if (want == 0) return 0;

    memcpy(buffer, in->buf + in->pos, want);
    in->pos += want;
    in->block_remaining -= want;
    return (int)want;
}

static int lce_write(struct mspack_file *file, void *buffer, int bytes) {
    lce_out_file *out = (lce_out_file *)file;
    if (!out || !buffer || bytes < 0) return -1;
    if ((size_t)bytes == 0) return 0;
    if (out->pos + (size_t)bytes > out->size) return -1;
    memcpy(out->buf + out->pos, buffer, (size_t)bytes);
    out->pos += (size_t)bytes;
    return bytes;
}

static struct mspack_system lce_sys = {
    NULL, // open
    NULL, // close
    lce_read,
    lce_write,
    NULL, // seek
    NULL, // tell
    NULL, // message
    lce_alloc,
    lce_free,
    lce_copy,
    NULL  // null
};

static int lce_window_bits_from_value(uint32_t window_size_or_bits) {
    // Some callers provide window size in bytes (e.g., 131072), others provide bits.
    if (window_size_or_bits >= 32) {
        // Compute log2(window_size_or_bits)
        int bits = 0;
        uint32_t v = window_size_or_bits;
        while (v > 1) {
            v >>= 1;
            bits++;
        }
        if (bits <= 0) bits = 17;
        return bits;
    }
    if (window_size_or_bits == 0) return 17;
    return (int)window_size_or_bits;
}

static int lce_decompress_lzx_stream(const uint8_t *src, size_t src_len, uint8_t *dst, size_t dst_len,
                                     uint32_t window_size_or_bits, uint32_t partition_size) {
    if (!src || !dst) return -1;
    if (dst_len == 0) return 0;

    int window_bits = lce_window_bits_from_value(window_size_or_bits);
    if (partition_size == 0) partition_size = 256u * 1024u;

    // libmspack can read beyond the nominal end; provide a padded copy.
    uint8_t *padded = (uint8_t *)malloc(src_len + LCE_PAD);
    if (!padded) return -1;
    memcpy(padded, src, src_len);
    memset(padded + src_len, 0, LCE_PAD);

    lce_in_file in = { padded, src_len + LCE_PAD, 0, 0 };
    lce_out_file out = { dst, dst_len, 0 };

    struct lzxd_stream *lzxd = lzxd_init(&lce_sys,
                                         (struct mspack_file *)&in,
                                         (struct mspack_file *)&out,
                                         window_bits,
                                         0,
                                         (int)partition_size,
                                         (off_t)dst_len,
                                         0);
    if (!lzxd) {
        free(padded);
        return -1;
    }

    int err = lzxd_decompress(lzxd, (off_t)dst_len);
    lzxd_free(lzxd);
    free(padded);

    if (err != MSPACK_ERR_OK) return -1;
    if (out.pos != dst_len) {
        // For our use-case we expect an exact-size inflate.
        return -1;
    }
    return 0;
}

static uint32_t lce_u32(const uint8_t *p, int little) {
    if (little) {
        return ((uint32_t)p[0]) | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
    }
    return ((uint32_t)p[0] << 24) | ((uint32_t)p[1] << 16) | ((uint32_t)p[2] << 8) | ((uint32_t)p[3]);
}

// Returns 0 on success, non-zero on failure (matches existing xdecompress contract used by the Python).
int xdecompress(uint8_t *dst, uint32_t *dst_len, uint8_t *src, uint32_t src_len) {
    if (!dst || !dst_len || !src) return -1;
    if (*dst_len == 0) return -1;

    const uint8_t *p = (const uint8_t *)src;
    size_t n = (size_t)src_len;

    // XCompress native file header identifier: 0x0FF512EE (big-endian bytes: 0F F5 12 EE)
    // It may also appear in little-endian byte order.
    int is_native = 0;
    int little = 0;
    if (n >= 4 && memcmp(p, "\x0F\xF5\x12\xEE", 4) == 0) {
        is_native = 1;
        little = 0;
    } else if (n >= 4 && memcmp(p, "\xEE\x12\xF5\x0F", 4) == 0) {
        is_native = 1;
        little = 1;
    }

    if (!is_native) {
        // Raw XMemDecompress-style stream.
        int rc = lce_decompress_lzx_stream(p, n, dst, (size_t)(*dst_len), 128u * 1024u, 512u * 1024u);
        return (rc == 0) ? 0 : -1;
    }

    // Parse XCompress native header (48 bytes total).
    if (n < 48) return -1;
    uint32_t flags = lce_u32(p + 12, little);
    (void)flags;
    uint32_t window_size = lce_u32(p + 16, little);
    uint32_t partition_size = lce_u32(p + 20, little);
    uint32_t uncompressed_block_size = lce_u32(p + 40, little);
    // uint32_t compressed_block_size_max = lce_u32(p + 44, little);

    size_t pos = 48;
    size_t out_pos = 0;
    size_t out_total = (size_t)(*dst_len);

    if (uncompressed_block_size == 0) return -1;

    while (out_pos < out_total) {
        if (pos + 4 > n) return -1;
        uint32_t block_size = lce_u32(p + pos, little);
        pos += 4;
        if ((size_t)block_size > n - pos) return -1;

        size_t want = out_total - out_pos;
        if (want > (size_t)uncompressed_block_size) want = (size_t)uncompressed_block_size;

        int rc = lce_decompress_lzx_stream(p + pos, (size_t)block_size, dst + out_pos, want, window_size, partition_size);
        if (rc != 0) return -1;

        out_pos += want;
        pos += (size_t)block_size;
    }

    return 0;
}
