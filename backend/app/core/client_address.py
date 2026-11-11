"""The customer's network address behind a trusted proxy — ADR-109 (amends ADR-025 §4).

Hosted, every request reaches the API through a load balancer or proxy, so the direct peer
address is the proxy's: every customer would share one rate-limit count and one audit address.
The proxy adds the real address to ``X-Forwarded-For``.

That header is written by whoever sends the request, so it is believed **only** when the
direct peer is one of the proxies the operator lists in ``TRUSTED_PROXIES`` (addresses or
networks, comma-separated). The header is read from the right: each hop added by a trusted
proxy is skipped, and the first address that is not a trusted proxy is the customer. Anything
a customer puts at the left of the header is never reached. With ``TRUSTED_PROXIES`` empty
(the default) the header is ignored and the peer address is used, exactly as before.
"""

from __future__ import annotations

import ipaddress
from collections.abc import Iterable, Sequence

from starlette.requests import Request

__all__ = [
    "Network",
    "client_address",
    "parse_trusted_proxies",
    "resolve_client_address",
]

Network = ipaddress.IPv4Network | ipaddress.IPv6Network

#: More hops than this in one header is not a real proxy chain: the peer address is used.
MAX_HOPS = 10


def parse_trusted_proxies(text: str) -> tuple[Network, ...]:
    """``"10.0.0.0/8, 192.168.1.5"`` → networks. Raises ``ValueError`` on anything else.

    "Every address" (``0.0.0.0/0`` or ``::/0``) is refused: it would let anyone choose the
    address the rate limits count.
    """
    out: list[Network] = []
    for part in (p.strip() for p in text.split(",")):
        if not part:
            continue
        try:
            net = ipaddress.ip_network(part, strict=False)
        except ValueError:
            raise ValueError(f"TRUSTED_PROXIES: {part!r} is not an address or network") from None
        if net.prefixlen == 0:
            raise ValueError("TRUSTED_PROXIES must not trust every address")
        out.append(net)
    return tuple(out)


def _ip(text: str) -> ipaddress.IPv4Address | ipaddress.IPv6Address | None:
    try:
        addr = ipaddress.ip_address(text.strip())
    except ValueError:
        return None
    # "::ffff:10.0.0.5" (an IPv4 address on an IPv6 socket) is the IPv4 address.
    if isinstance(addr, ipaddress.IPv6Address) and addr.ipv4_mapped is not None:
        return addr.ipv4_mapped
    return addr


def _trusted(addr: ipaddress.IPv4Address | ipaddress.IPv6Address, nets: Iterable[Network]) -> bool:
    return any(addr.version == n.version and addr in n for n in nets)


def resolve_client_address(
    peer: str | None, forwarded_for: Sequence[str], trusted: Sequence[Network]
) -> str:
    """The customer's address from the direct ``peer`` and every ``X-Forwarded-For`` header.

    Falls back to the peer whenever the chain can't be believed: an untrusted peer, no
    header, a malformed or over-long one, or a chain made only of trusted proxies.
    """
    if not peer:
        return "unknown"
    peer_ip = _ip(peer)
    if not trusted or peer_ip is None or not _trusted(peer_ip, trusted):
        return peer
    hops = [h.strip() for header in forwarded_for for h in header.split(",")]
    hops = [h for h in hops if h]
    if not hops or len(hops) > MAX_HOPS:
        return peer
    for hop in reversed(hops):
        addr = _ip(hop)
        if addr is None:
            return peer  # a malformed chain is not believed at all
        if not _trusted(addr, trusted):
            return str(addr)
    return peer


def client_address(request: Request) -> str:
    """The customer's address for rate limits and audit rows (see the module notes)."""
    settings = getattr(request.app.state, "settings", None)
    trusted: Sequence[Network] = getattr(settings, "trusted_proxy_networks", ()) or ()
    peer = request.client.host if request.client else None
    return resolve_client_address(peer, request.headers.getlist("x-forwarded-for"), trusted)
