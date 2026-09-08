"""The REST client's media relay.

Covers where a relayed request actually goes, which matters because it carries the token and
because the address it starts from was written by Home Assistant at some earlier point.
"""

import httpx

from cube.hass.rest import HassRest, MediaMetadata

MEDIA_PATH = "/media/local/sounds/temp/chime_tts/deadbeef.mp3"
SIGNATURE_QUERY = "authSig=signed.jwt-ish_value"
STALE_HOST_URL = f"https://renamed-since.invalid{MEDIA_PATH}?{SIGNATURE_QUERY}"

AUDIO = b"announcement-audio"
AUDIO_CONTENT_TYPE = "audio/mpeg"
BYTE_RANGES = "bytes"
SESSION_COOKIE = "session=not-the-panel-s-business"

CONTENT_TYPE_HEADER = "content-type"
CONTENT_LENGTH_HEADER = "content-length"
ACCEPT_RANGES_HEADER = "accept-ranges"
RANGE_HEADER = "range"
COOKIE_HEADER = "set-cookie"

REQUESTED_RANGE = "bytes=0-99"
PARTIAL_CONTENT = 206


def stub_home_assistant(recorder: list[httpx.Request]) -> httpx.MockTransport:
    def handle(request: httpx.Request) -> httpx.Response:
        recorder.append(request)

        return httpx.Response(
            PARTIAL_CONTENT,
            content=AUDIO,
            headers={
                CONTENT_TYPE_HEADER: AUDIO_CONTENT_TYPE,
                ACCEPT_RANGES_HEADER: BYTE_RANGES,
                COOKIE_HEADER: SESSION_COOKIE,
            },
        )

    return httpx.MockTransport(handle)


async def relay(
    settings, url: str, range_header: str | None = None
) -> tuple[list[httpx.Request], bytes, MediaMetadata]:
    """Run one relay against a stand-in instance, returning what it sent and what came back."""

    requests: list[httpx.Request] = []
    rest = HassRest(settings)

    # Swapped at the transport rather than the client, so the base URL, headers and timeout
    # under test are the ones the application actually configures.
    rest._client._transport = stub_home_assistant(requests)

    chunks: list[bytes] = []
    metadata = None

    async for chunk, chunk_metadata in rest.media_stream(url, range_header):
        chunks.append(chunk)
        metadata = chunk_metadata

    await rest.close()

    return requests, b"".join(chunks), metadata


async def test_a_relayed_request_goes_to_the_configured_instance(settings):
    """The recorded address may name a host the instance has since been renamed away from, and
    the request carries this process's token, so only the path is reused."""

    requests, _, _ = await relay(settings, STALE_HOST_URL)

    assert str(requests[0].url).startswith(settings.rest_base_url)
    assert requests[0].url.path == MEDIA_PATH


async def test_a_relayed_request_keeps_the_signature_it_was_given(settings):
    requests, _, _ = await relay(settings, STALE_HOST_URL)

    assert requests[0].url.query.decode() == SIGNATURE_QUERY


async def test_a_range_is_passed_through_to_home_assistant(settings):
    requests, _, metadata = await relay(settings, STALE_HOST_URL, REQUESTED_RANGE)

    assert requests[0].headers[RANGE_HEADER] == REQUESTED_RANGE
    assert metadata.status_code == PARTIAL_CONTENT


async def test_only_the_headers_the_browser_needs_come_back(settings):
    _, body, metadata = await relay(settings, STALE_HOST_URL)

    assert body == AUDIO
    assert metadata.headers[CONTENT_TYPE_HEADER] == AUDIO_CONTENT_TYPE
    assert metadata.headers[ACCEPT_RANGES_HEADER] == BYTE_RANGES
    assert CONTENT_LENGTH_HEADER in metadata.headers
    assert COOKIE_HEADER not in metadata.headers
