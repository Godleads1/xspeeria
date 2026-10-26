"""Profile photo checks (ADR-049, ADR-060): type from content, hidden details removed."""

from __future__ import annotations

import struct
import zlib

import pytest

from app.domain.image_rules import MAX_PHOTO_BYTES, PhotoError, clean_photo

SECRET = b"GPS 6.5244N 3.3792E Canon EOS"


def _png_chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))


def png(*extra: bytes) -> bytes:
    ihdr = _png_chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0))
    idat = _png_chunk(b"IDAT", zlib.compress(b"\x00\xff\x00\x00"))
    return b"\x89PNG\r\n\x1a\n" + ihdr + b"".join(extra) + idat + _png_chunk(b"IEND", b"")


def jpeg(*segments: bytes) -> bytes:
    app0 = b"\xff\xe0" + struct.pack(">H", 16) + b"JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
    sos = b"\xff\xda" + struct.pack(">H", 8) + b"\x01\x01\x00\x00\x3f\x00"
    return b"\xff\xd8" + app0 + b"".join(segments) + sos + b"\x12\x34\x56" + b"\xff\xd9"


def jpeg_segment(marker: int, body: bytes) -> bytes:
    return bytes((0xFF, marker)) + struct.pack(">H", len(body) + 2) + body


def webp_chunk(kind: bytes, data: bytes) -> bytes:
    return kind + struct.pack("<I", len(data)) + data + (b"\x00" if len(data) & 1 else b"")


def webp(*chunks: bytes) -> bytes:
    body = b"WEBP" + b"".join(chunks)
    return b"RIFF" + struct.pack("<I", len(body)) + body


def test_png_text_and_exif_chunks_are_removed() -> None:
    dirty = png(_png_chunk(b"tEXt", b"Comment\x00" + SECRET), _png_chunk(b"eXIf", SECRET))
    clean, kind = clean_photo(dirty)
    assert kind == "image/png" and SECRET not in clean
    assert clean == png()  # exactly the picture, nothing else


def test_jpeg_exif_xmp_and_comments_are_removed() -> None:
    dirty = jpeg(
        jpeg_segment(0xE1, b"Exif\x00\x00" + SECRET),
        jpeg_segment(0xE1, b"http://ns.adobe.com/xap/1.0/\x00" + SECRET),
        jpeg_segment(0xFE, SECRET),
    )
    clean, kind = clean_photo(dirty)
    assert kind == "image/jpeg" and SECRET not in clean
    assert clean == jpeg()


def test_webp_exif_and_xmp_are_removed_and_flags_cleared() -> None:
    vp8x = webp_chunk(b"VP8X", bytes((0x08 | 0x04, 0, 0, 0)) + b"\x00" * 6)
    image = webp_chunk(b"VP8L", b"\x2f\x00\x00\x00\x00")
    dirty = webp(vp8x, image, webp_chunk(b"EXIF", SECRET), webp_chunk(b"XMP ", SECRET))
    clean, kind = clean_photo(dirty)
    assert kind == "image/webp" and SECRET not in clean
    assert clean[20] & 0x0C == 0  # VP8X flags: EXIF and XMP no longer claimed
    (size,) = struct.unpack("<I", clean[4:8])
    assert size + 8 == len(clean)


@pytest.mark.parametrize(
    "data",
    [
        b"",
        b"GIF89a....",
        b"<svg onload=alert(1)>",
        b"%PDF-1.7",
        png()[:-12],  # no IEND
        jpeg()[:-2],  # no end marker
        b"\xff\xd8\xff\xe1\xff\xff",  # segment longer than the file
        webp(),  # no image chunk
    ],
)
def test_anything_else_is_refused(data: bytes) -> None:
    with pytest.raises(PhotoError):
        clean_photo(data)


def test_size_limit() -> None:
    with pytest.raises(PhotoError, match="5 MB"):
        clean_photo(b"\x89PNG\r\n\x1a\n" + b"\x00" * MAX_PHOTO_BYTES)
