"""Profile photo checks (ADR-049, ADR-060). Pure functions, no I/O.

* The type is read from the file's own bytes (never from the name or a client header):
  JPEG, PNG or WebP only.
* Hidden details are removed before anyone sees the photo — camera data and GPS location
  (EXIF), XMP, comments and text chunks — by rebuilding the file without them. A file
  whose structure doesn't parse is refused.

Pixels are not re-encoded (no image library is installed); the browser draws the image.
"""

from __future__ import annotations

import struct

__all__ = ["MAX_PHOTO_BYTES", "PhotoError", "clean_photo", "image_size"]

MAX_PHOTO_BYTES = 5 * 1024 * 1024  # ADR-049: 5 MB for a profile photo


class PhotoError(ValueError):
    """Not an acceptable photo. The message is for people."""


def clean_photo(data: bytes) -> tuple[bytes, str]:
    """The photo without hidden details, and its content type."""
    if not data:
        raise PhotoError("That file could not be read.")
    if len(data) > MAX_PHOTO_BYTES:
        raise PhotoError("The photo must be smaller than 5 MB.")
    if data.startswith(b"\xff\xd8\xff"):
        return _jpeg(data), "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return _png(data), "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return _webp(data), "image/webp"
    raise PhotoError("Upload a JPG, PNG or WebP photo.")


def _bad() -> PhotoError:
    return PhotoError("That file could not be read.")


# --- JPEG: drop APP1–APP15 (EXIF, XMP, ...) and COM segments ------------------------------

_STANDALONE = {0x01, *range(0xD0, 0xD8)}  # TEM, RST0–7: no length


def _jpeg(data: bytes) -> bytes:
    out = bytearray(b"\xff\xd8")
    i = 2
    n = len(data)
    while i < n:
        if data[i] != 0xFF:
            raise _bad()
        while i < n and data[i] == 0xFF:  # fill bytes
            i += 1
        if i >= n:
            raise _bad()
        marker = data[i]
        i += 1
        if marker in _STANDALONE:
            out += bytes((0xFF, marker))
            continue
        if marker == 0xD9:  # EOI before any image data
            raise _bad()
        if i + 2 > n:
            raise _bad()
        (length,) = struct.unpack(">H", data[i : i + 2])
        if length < 2 or i + length > n:
            raise _bad()
        segment = data[i : i + length]
        i += length
        if 0xE1 <= marker <= 0xEF or marker == 0xFE:
            continue  # APP1–APP15 and comments: hidden details
        out += bytes((0xFF, marker)) + segment
        if marker == 0xDA:  # start of scan: the rest is image data up to the end
            rest = data[i:]
            if not rest.endswith(b"\xff\xd9"):
                raise _bad()
            out += rest
            return bytes(out)
    raise _bad()


# --- PNG: keep only the chunks needed to draw the image -------------------------------------

_PNG_KEEP = {
    b"IHDR",
    b"PLTE",
    b"IDAT",
    b"IEND",
    b"tRNS",
    b"gAMA",
    b"cHRM",
    b"sRGB",
    b"iCCP",
    b"sBIT",
    b"pHYs",
}


def _png(data: bytes) -> bytes:
    out = bytearray(data[:8])
    i = 8
    n = len(data)
    seen_end = False
    while i < n:
        if i + 8 > n:
            raise _bad()
        (length,) = struct.unpack(">I", data[i : i + 4])
        kind = data[i + 4 : i + 8]
        end = i + 12 + length
        if end > n:
            raise _bad()
        if kind in _PNG_KEEP:
            out += data[i:end]
        i = end
        if kind == b"IEND":
            seen_end = True
            break
    if not seen_end or out[12:16] != b"IHDR":
        raise _bad()
    return bytes(out)


# --- WebP: drop EXIF and XMP chunks and clear their flags -----------------------------------


def _webp(data: bytes) -> bytes:
    (size,) = struct.unpack("<I", data[4:8])
    if size + 8 > len(data) or size < 4:
        raise _bad()
    body = bytearray()
    i = 12
    end = size + 8
    found_image = False
    while i < end:
        if i + 8 > end:
            raise _bad()
        kind = data[i : i + 4]
        (length,) = struct.unpack("<I", data[i + 4 : i + 8])
        stop = i + 8 + length + (length & 1)
        if stop > end:
            raise _bad()
        chunk = bytearray(data[i:stop])
        i = stop
        if kind in (b"EXIF", b"XMP "):
            continue
        if kind == b"VP8X" and length >= 1:
            chunk[8] &= ~(0x08 | 0x04) & 0xFF  # EXIF and XMP present flags
        if kind in (b"VP8 ", b"VP8L", b"ANIM"):
            found_image = True
        body += chunk
    if not found_image:
        raise _bad()
    return b"RIFF" + struct.pack("<I", 4 + len(body)) + b"WEBP" + bytes(body)


# --- size in pixels (adverts, ADR-067) -----------------------------------------------------

_SOF = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}


def image_size(data: bytes) -> tuple[int, int]:
    """Width and height read from the file's own header (JPEG, PNG or WebP)."""
    if data.startswith(b"\x89PNG\r\n\x1a\n") and data[12:16] == b"IHDR" and len(data) >= 24:
        w, h = struct.unpack(">II", data[16:24])
        return _checked(w, h)
    if data.startswith(b"\xff\xd8\xff"):
        i, n = 2, len(data)
        while i + 4 <= n:
            if data[i] != 0xFF:
                raise _bad()
            marker = data[i + 1]
            if marker in _STANDALONE or marker == 0xFF:
                i += 1 if marker == 0xFF else 2
                continue
            (length,) = struct.unpack(">H", data[i + 2 : i + 4])
            if marker in _SOF and i + 9 <= n:
                h, w = struct.unpack(">HH", data[i + 5 : i + 9])
                return _checked(w, h)
            i += 2 + length
        raise _bad()
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP" and len(data) >= 30:
        chunk = data[12:16]
        if chunk == b"VP8X":
            w = 1 + int.from_bytes(data[24:27], "little")
            h = 1 + int.from_bytes(data[27:30], "little")
            return _checked(w, h)
        if chunk == b"VP8 " and data[23:26] == b"\x9d\x01\x2a":
            w, h = struct.unpack("<HH", data[26:30])
            return _checked(w & 0x3FFF, h & 0x3FFF)
        if chunk == b"VP8L" and data[20] == 0x2F:
            b = int.from_bytes(data[21:25], "little")
            return _checked((b & 0x3FFF) + 1, ((b >> 14) & 0x3FFF) + 1)
    raise _bad()


def _checked(w: int, h: int) -> tuple[int, int]:
    if not (0 < w <= 20_000 and 0 < h <= 20_000):
        raise _bad()
    return w, h
