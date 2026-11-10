"""ADR-109: the customer's address behind a trusted proxy, and only a trusted one."""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api.auth_deps import client_address
from app.core.client_address import parse_trusted_proxies, resolve_client_address
from app.core.config import Settings

LB = parse_trusted_proxies("10.0.0.0/8, 2001:db8::/32")


def test_with_no_trusted_proxy_the_header_is_ignored() -> None:
    assert resolve_client_address("203.0.113.9", ["198.51.100.7"], ()) == "203.0.113.9"


def test_behind_a_trusted_proxy_the_forwarded_address_counts() -> None:
    assert resolve_client_address("10.0.0.5", ["198.51.100.7"], LB) == "198.51.100.7"


def test_a_header_from_anyone_else_is_ignored() -> None:
    # A customer can't pick the address the rate limits count by sending the header.
    assert resolve_client_address("203.0.113.9", ["198.51.100.7"], LB) == "203.0.113.9"


def test_a_forged_left_part_is_never_reached() -> None:
    # The customer sent "1.2.3.4"; the trusted proxy appended the real sender on the right.
    assert resolve_client_address("10.0.0.5", ["1.2.3.4, 198.51.100.7"], LB) == "198.51.100.7"


def test_several_trusted_hops_are_skipped_from_the_right() -> None:
    chain = ["198.51.100.7, 10.1.1.1", "10.2.2.2"]  # two headers, one per proxy
    assert resolve_client_address("10.0.0.5", chain, LB) == "198.51.100.7"


def test_ipv6_works_and_is_normalised() -> None:
    got = resolve_client_address("2001:db8::1", ["2001:0db8:0:0:0:0:0:abcd, 2a00::0001"], LB)
    assert got == "2a00::1"


@pytest.mark.parametrize(
    "header",
    [
        [],  # no header
        [""],
        ["not-an-address"],
        ["198.51.100.7, bogus"],
        ["10.1.1.1, 10.2.2.2"],  # only trusted proxies: nobody to name
        [", ".join(["198.51.100.7"] * 11)],  # longer than any real proxy chain
    ],
)
def test_a_chain_that_cant_be_believed_falls_back_to_the_peer(header: list[str]) -> None:
    assert resolve_client_address("10.0.0.5", header, LB) == "10.0.0.5"


def test_an_ipv4_peer_on_an_ipv6_socket_still_counts_as_the_proxy() -> None:
    assert resolve_client_address("::ffff:10.0.0.5", ["198.51.100.7"], LB) == "198.51.100.7"
    assert resolve_client_address("10.0.0.5", ["::ffff:198.51.100.7"], LB) == "198.51.100.7"


def test_no_peer_is_unknown() -> None:
    assert resolve_client_address(None, ["198.51.100.7"], LB) == "unknown"


def test_the_setting_refuses_typos_and_trusting_everyone() -> None:
    assert Settings(trusted_proxies="10.0.0.0/8,192.168.1.5").trusted_proxy_networks == (
        parse_trusted_proxies("10.0.0.0/8, 192.168.1.5/32")
    )
    assert Settings().trusted_proxy_networks == ()
    for bad in ("10.0.0.0/8, nope", "0.0.0.0/0", "::/0"):
        with pytest.raises(ValidationError):
            Settings(trusted_proxies=bad)


def _app(trusted: str) -> TestClient:
    app = FastAPI()
    app.state.settings = SimpleNamespace(trusted_proxy_networks=parse_trusted_proxies(trusted))

    @app.get("/who")
    async def who(request: Request) -> dict[str, str]:
        return {"address": client_address(request)}

    return TestClient(app, client=("10.0.0.5", 50000))


def test_the_dependency_used_by_rate_limits_and_audit_rows() -> None:
    forwarded = {"X-Forwarded-For": "1.2.3.4, 198.51.100.7"}
    assert _app("10.0.0.0/8").get("/who", headers=forwarded).json() == {"address": "198.51.100.7"}
    assert _app("").get("/who", headers=forwarded).json() == {"address": "10.0.0.5"}
