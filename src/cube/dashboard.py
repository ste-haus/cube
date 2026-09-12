"""Dashboard definition.

Everything installation-specific — entity ids, labels, colors, URLs, floorplan layout — is
loaded from a YAML file at runtime rather than baked in here. `config.yaml.dist` is a
placeholder copy of the schema; see the README for how to point at your own.
"""

import logging
import re
from enum import StrEnum
from pathlib import Path
from typing import Annotated, Any, Self

import yaml
from pydantic import (
    BaseModel,
    BeforeValidator,
    Discriminator,
    Field,
    PrivateAttr,
    Tag,
    ValidationError,
    field_validator,
    model_validator,
)

logger = logging.getLogger(__name__)


class Theme(BaseModel):
    """The panel's palette, applied as CSS custom properties."""

    background: str = "#000000"
    foreground: str = "#e1e1e1"
    muted: str = "#999999"
    dim: str = "#666666"
    faint: str = "#333333"
    spent: str = Field(default="#4a4a4a", description="Something the day has already been past")
    accent: str = "#11fcf7"


class Colors(BaseModel):
    """The installation's own colours, named so the rest of the config can point at them.

    Any colour elsewhere in the config may be written as one of these names instead of a value,
    so everything that should match is changed in one place. `primary` and `secondary` tie the
    panel together. The rest are the sky's, for the horizon and the daylight bar, and are muted on
    purpose: the weather should read as part of the panel rather than a picture pasted onto it.
    """

    primary: str = "#f205f2"
    secondary: str = "#00bfff"

    day: str = "#7a8fa0"
    night: str = "#2e2a45"
    twilight: str = "#a0706b"
    sun: str = "#d0a46c"
    sun_below: str = Field(default="#6d5a50", description="The sun while it is below the horizon")


COLORS_SECTION = "colors"
COLOR_KEY = "color"
COLOR_SUFFIX = "_color"
COLORS_SUFFIX = "_colors"


def resolve_named_colors(value: Any, palette: dict[str, str]) -> Any:
    """Swaps a palette name for its colour wherever the config expects a colour.

    Only values under colour keys are looked at: `color`, anything ending `_color`, and the values
    of anything ending `_colors`. A calendar that happens to be called "primary" stays called that.
    """

    if isinstance(value, list):
        return [resolve_named_colors(item, palette) for item in value]

    if not isinstance(value, dict):
        return value

    def named(colour: Any) -> Any:
        return palette.get(colour, colour) if isinstance(colour, str) else colour

    resolved: dict[Any, Any] = {}
    for key, item in value.items():
        colour_key = isinstance(key, str)

        if colour_key and (key == COLOR_KEY or key.endswith(COLOR_SUFFIX)):
            resolved[key] = named(item)
        elif colour_key and key.endswith(COLORS_SUFFIX) and isinstance(item, dict):
            resolved[key] = {state: named(colour) for state, colour in item.items()}
        else:
            resolved[key] = resolve_named_colors(item, palette)

    return resolved


class ThresholdBand(BaseModel):
    """One band of a threshold scale: any value at or above `at` takes `color`."""

    at: float
    color: str


class ThresholdScale(BaseModel):
    """Maps a numeric value onto a color, highest matching band winning."""

    bands: list[ThresholdBand] = Field(default_factory=list)
    default_color: str

    @model_validator(mode="after")
    def sort_bands_descending(self) -> Self:
        self.bands.sort(key=lambda band: band.at, reverse=True)

        return self

    def color_for(self, value: float) -> str:
        for band in self.bands:
            if value >= band.at:
                return band.color

        return self.default_color


class Reading(BaseModel):
    """A value pulled from an entity's state or from one of its attributes."""

    entity_id: str
    attribute: str | None = None


class Extreme(Reading):
    """A forecast high or low, and optionally how far off it is.

    `turning_point_attribute` names a mapping of `temperature`, `hours`, and `upcoming`: the next
    or last point the temperature turns round, tide-table style. When one is there the panel shows
    its temperature and hours in place of the state's; when it is empty the panel shows the state
    alone.
    """

    turning_point_attribute: str | None = None


class Indicator(Reading):
    """A header reading, optionally colored by a threshold scale.

    `bearing` renders a compass point beside the value, for readings that have a direction as
    well as a magnitude.
    """

    icon: str = ""
    icon_attribute: str | None = None
    suffix: str = ""
    precision: int | None = Field(default=None, description="Decimal places to round a numeric reading to")
    scale: ThresholdScale | None = None
    bearing: Reading | None = None


class StatusIndicator(Reading):
    """A header reading that appears only while an entity is off its nominal state.

    Colors come from the state itself rather than from a numeric scale, and any state listed
    in `pulsing_states` blinks rather than sitting steady.
    """

    icon: str
    nominal_state: str
    state_colors: dict[str, str] = Field(default_factory=dict)
    pulsing_states: list[str] = Field(default_factory=list)


class Notice(BaseModel):
    """A notice row.

    `conditional` notices render only while their entity is `on`; unconditional ones always
    render. Setting `nominal_state` instead switches the row to a state-driven notice, shown
    whenever the entity is off that state and coloured by whichever state it is in. Either way
    the text and icon come from the entity's attributes.
    """

    entity_id: str
    pulsing: bool = False
    conditional: bool = True
    message_attribute: str = "message"
    icon_attribute: str = "icon"
    icon: str = Field(default="", description="Used when the entity names no icon the panel ships")

    nominal_state: str | None = None
    state_colors: dict[str, str] = Field(default_factory=dict)
    pulsing_states: list[str] = Field(default_factory=list)


class Side(StrEnum):
    LEFT = "left"
    RIGHT = "right"
    # Calendars belonging to the household rather than to either person. They collect above the
    # timeline as untimed entries rather than taking a column.
    EXTRA = "extra"


class Calendar(BaseModel):
    entity_id: str
    name: str
    color: str
    side: Side = Side.RIGHT
    icon: str = Field(default="", description="Shown when the calendar's events read as notices")
    blocklist: str | None = Field(default=None, description="Regex of event titles to hide")


class Floorplan(BaseModel):
    """One floorplan level.

    `image` names an SVG in the resources directory. Each element in that SVG carries an
    entity id as its DOM id, and the browser drives it by setting a class per group; `groups`
    is what says which entity belongs to which group.
    """

    image: str
    groups: dict[str, list[str]] = Field(default_factory=dict)

    @property
    def entity_ids(self) -> list[str]:
        return [entity_id for entities in self.groups.values() for entity_id in entities]


class Gauge(BaseModel):
    entity_id: str
    name: str | None = None


class GaugeRow(BaseModel):
    """A row of gauges sharing one set of color segments."""

    gauges: list[Gauge] = Field(default_factory=list)
    scale: ThresholdScale | None = None
    unit: str = ""


RTSP_WITHOUT_GO2RTC_MESSAGE = (
    "Camera `{camera}` names an `rtsp` stream but is polled; set `stream_type: go2rtc` to play it."
)


class StreamType(StrEnum):
    """How a camera's picture reaches the panel."""

    # Stills fetched through cube, one at a time. The only choice for a camera with no stream of
    # its own — a still-image URL, a file on disk — and the cheap one for anything else.
    POLLING = "polling"
    # Live video from go2rtc, straight to the panel and decoded in hardware there, for as long as
    # the camera's face is the one being looked at.
    GO2RTC = "go2rtc"


class Camera(BaseModel):
    entity_id: str
    title: str | None = None
    stream_type: StreamType = StreamType.POLLING
    polling_interval: float = Field(
        default=60.0,
        description="Seconds between stills for a polled camera on the face being looked at",
    )
    rtsp: str | None = Field(
        default=None,
        description="An RTSP URL go2rtc plays as the source, so go2rtc needs nothing set up for it",
    )
    stream: str | None = Field(
        default=None,
        description="What go2rtc is asked to play: `rtsp` when given, else a stream it has by name",
    )

    @model_validator(mode="after")
    def name_the_stream(self) -> Self:
        """Settles what go2rtc is asked for, so the panel has one thing to hand it.

        An RTSP URL goes to go2rtc as the source itself, which is what lets a go2rtc for the
        panels run with no streams configured at all. Without one, go2rtc is asked for a stream
        it already has, by the entity's object id unless the camera names another.
        """

        if self.rtsp is not None and self.stream_type != StreamType.GO2RTC:
            raise ValueError(RTSP_WITHOUT_GO2RTC_MESSAGE.format(camera=self.entity_id))

        if self.stream_type != StreamType.GO2RTC:
            return self

        if self.rtsp is not None:
            self.stream = self.rtsp
        elif self.stream is None:
            _, _, object_id = self.entity_id.partition(".")
            self.stream = object_id

        return self


class Go2rtc(BaseModel):
    """Where a camera with `stream_type: go2rtc` gets its video.

    `url` is the base go2rtc serves its API under. A panel connects to it directly rather than
    through cube, so it has to be reachable from the tablets, not only from wherever cube runs.
    """

    url: str


class Agenda(BaseModel):
    """A two-sided timeline: one side's calendars down the left, the other's down the right,
    with the time of day in a gutter between them."""

    calendars: list[Calendar] = Field(default_factory=list)
    side_labels: dict[Side, str] = Field(default_factory=dict)
    hidden_prefixes: list[str] = Field(
        default_factory=list,
        description="Titles starting with any of these are dropped, matched case-insensitively",
    )
    empty_text: str = "Nothing today."
    days: int = 1
    # The list scrolls only once it outgrows the panel; these tune when and how fast.
    scroll_threshold_items: int = 19
    scroll_seconds_per_item: float = 0.75
    scroll_percent_per_item: float = 10.0
    base_scroll_seconds: float = 20.0


class Clock(BaseModel):
    date_format: str = "%A, %B %o, %Y"
    time_format: str = "%H:%M"
    # Replaces the rendered time when it matches, for anyone who has ever lost an afternoon
    # to a status page. Purely decorative; leave empty to disable.
    easter_egg_times: list[str] = Field(default_factory=list)
    easter_egg_text: str = ""


class TemperatureStop(BaseModel):
    """One point on the temperature gradient: `color` at exactly `at`, blended between points."""

    at: float
    color: str


# In Fahrenheit, which is what a `weather` entity reports unless it has been told otherwise.
# An installation in Celsius restates the whole list rather than having it converted, because
# what counts as a warm day is not a unit conversion.
DEFAULT_TEMPERATURE_GRADIENT = [
    TemperatureStop(at=10, color="#8ab4f8"),
    TemperatureStop(at=32, color="#7ecfe0"),
    TemperatureStop(at=50, color="#93d3a2"),
    TemperatureStop(at=70, color="#fbee84"),
    TemperatureStop(at=85, color="#f7b267"),
    TemperatureStop(at=100, color="#f2645a"),
]

DEFAULT_FORECAST_DAYS = 7
DEFAULT_FORECAST_HOURS = 12


# A gust under this, in miles an hour, says nothing the steady wind does not.
DEFAULT_WIND_GUST_THRESHOLD = 15


class Weather(BaseModel):
    entity_id: str
    sun_entity_id: str | None = Field(default=None, description="Distinguishes day from night icons")
    high: Extreme | None = None
    low: Extreme | None = None
    summary_entity_id: str | None = None
    # The summary shrinks as it lengthens so a wordy forecast still fits its panel. The scales
    # multiply the panel's summary size rather than replacing it.
    summary_max_length: int = 150
    summary_min_scale: float = 0.8
    summary_max_scale: float = 1.0

    # The weather face.
    zone_entity_id: str | None = Field(
        default=None,
        description="A zone whose latitude and longitude place the sun and moon; the horizon needs one",
    )
    forecast_days: int = Field(default=DEFAULT_FORECAST_DAYS, ge=1)
    forecast_hours: int = Field(default=DEFAULT_FORECAST_HOURS, ge=1)
    wind_gust_threshold: float = Field(
        default=DEFAULT_WIND_GUST_THRESHOLD,
        ge=0,
        description="Gusts at or over this, in the weather entity's own unit, show at the wind arrow's tail",
    )
    temperature_gradient: list[TemperatureStop] = Field(
        default_factory=lambda: [stop.model_copy() for stop in DEFAULT_TEMPERATURE_GRADIENT],
        min_length=1,
    )

    @model_validator(mode="after")
    def sort_gradient_ascending(self) -> Self:
        self.temperature_gradient.sort(key=lambda stop: stop.at)

        return self


class Transcript(BaseModel):
    """A line along the bottom that types itself out, for whatever was last spoken aloud.

    The pace is set rather than the duration, so a long announcement and a short one are read at
    the same speed instead of taking the same time. It is paced in syllables rather than
    characters, so a long word takes longer than a short one without taking longer in
    proportion to how it is spelled.
    """

    entity_id: str
    syllables_per_second: float = Field(
        default=4.0,
        description="How fast the line types itself out, in the unit speech is measured in",
    )


class Toggle(BaseModel):
    """A chip that toggles an entity, optionally gated behind another entity being `on`."""

    entity_id: str
    label: str
    icon: str
    active_color: str = "amber"
    inactive_color: str = "white"
    visible_when: str | None = None


class Visualizer(BaseModel):
    """A full-screen overlay shown while a media player is playing matching content.

    The page it draws with ships with the panel, so there is nothing to point at: presence of
    this block is what turns the overlay on, and the marker is what decides when it appears.
    """

    content_marker: str = Field(description="Substring of media_content_id that triggers the overlay")


class Labels(BaseModel):
    """Section headings. Here rather than in the frontend so they stay translatable."""

    notices: str = "Notices"
    agenda: str = "Today"
    sunrise: str = "Sunrise"
    sunset: str = "Sunset"
    now: str = Field(default="Now", description="Where the hourly forecast starts")


BLANK_FACE_CONTENT = "blank"
DASHBOARD_FACE_CONTENT = "dashboard"
CUSTOM_FACE_CONTENT = "custom"
CAMERA_GRID_FACE_CONTENT = "camera-grid"
CAMERA_HERO_FACE_CONTENT = "camera-hero"
WEATHER_FACE_CONTENT = "weather"

FACE_DIRECTORY = "faces"
FACE_ENTRYPOINT = "index.html"

# A page name is one directory under `faces/`, never a path into one. Anything that could
# climb out of the resources directory is rejected here rather than guarded at every reader.
SAFE_PAGE_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")


def is_safe_page_name(name: str) -> bool:
    return SAFE_PAGE_NAME.match(name) is not None


def as_camera(value: Any) -> Any:
    """Reads a camera named on its own as an entity id.

    A wall of cameras is mostly entity ids and nothing else, and writing each one as a mapping
    to say so is noise. The long form is still there for a tile that wants a title or a refresh
    rate of its own, and both arrive as a whole camera.
    """

    return {"entity_id": value} if isinstance(value, str) else value


CameraEntry = Annotated[Camera, BeforeValidator(as_camera)]
CameraRow = Annotated[list[CameraEntry], Field(min_length=1)]


class CameraFaceOptions(BaseModel):
    """Options for a face that draws cameras.

    The cameras are enumerated rather than left to the renderer, because the snapshot endpoint
    fetches for the entities the config names and nothing else.
    """

    @property
    def cameras(self) -> list[Camera]:
        raise NotImplementedError


class CameraGridOptions(CameraFaceOptions):
    """A grid of cameras: one inner list per row, each read left to right.

    Rows need not be the same length. A short one's tiles share the width between them rather
    than leaving a hole, which is what a wall of an odd number of cameras wants.
    """

    rows: list[CameraRow] = Field(min_length=1)

    @property
    def cameras(self) -> list[Camera]:
        return [camera for row in self.rows for camera in row]


class CameraHeroOptions(CameraFaceOptions):
    """One camera at size, with the rest stacked in a column beside it."""

    hero: CameraEntry
    side: list[CameraEntry] = Field(default_factory=list)

    @property
    def cameras(self) -> list[Camera]:
        return [self.hero, *self.side]


FRAME_SCHEMES = ("http://", "https://")
UNFRAMEABLE_URL_MESSAGE = "Frame `{url}` is not an http or https address."


class Frame(BaseModel):
    """Somebody else's page, drawn edge to edge with nothing of the panel's around it.

    `title` is never drawn; it is what the page is called to anything reading the panel rather
    than looking at it. A frame takes no touches unless it is `interactive`, because a touch that
    reaches the page is a swipe that never reaches the cube.
    """

    url: str
    title: str | None = None
    interactive: bool = Field(default=False, description="Let touches reach the page instead of turning the cube")

    @model_validator(mode="after")
    def require_web_address(self) -> Self:
        if not self.url.startswith(FRAME_SCHEMES):
            raise ValueError(UNFRAMEABLE_URL_MESSAGE.format(url=self.url))

        return self


# RainViewer serves its free radar tiles no closer than this; past it, every tile is a
# placeholder saying so.
RAINVIEWER_MAX_ZOOM = 7
DEFAULT_RADAR_RINGS = [25.0, 50.0, 100.0]
DEFAULT_RADAR_FRAME_SECONDS = 0.2
DEFAULT_RADAR_PAUSE_SECONDS = 0.5


class DistanceUnit(StrEnum):
    MILES = "mi"
    KILOMETRES = "km"


class Radar(BaseModel):
    """The last couple of hours of rain, looped over a dark map centred on the weather's zone.

    The map neither pans nor zooms. It is the same stretch of country every time, which is what
    makes it readable from across a room.
    """

    zoom: int = Field(
        default=RAINVIEWER_MAX_ZOOM,
        ge=1,
        le=RAINVIEWER_MAX_ZOOM,
        description="How close the map is; RainViewer's free radar goes no closer than 7",
    )
    rings: list[float] = Field(
        default_factory=lambda: list(DEFAULT_RADAR_RINGS),
        description="Distances from home to draw a ring at",
    )
    ring_unit: DistanceUnit = DistanceUnit.MILES
    frame_seconds: float = Field(default=DEFAULT_RADAR_FRAME_SECONDS, gt=0)
    pause_seconds: float = Field(
        default=DEFAULT_RADAR_PAUSE_SECONDS,
        ge=0,
        description="How long the newest frame holds before the loop starts over",
    )


class RadarTile(BaseModel):
    """A tile that is a radar, written `radar:` on its own for the defaults."""

    radar: Radar = Field(default_factory=Radar)

    @field_validator("radar", mode="before")
    @classmethod
    def default_when_bare(cls, value: Any) -> Any:
        return {} if value is None else value


FRAME_TILE = "frame"
RADAR_TILE = "radar"
CAMERA_TILE = "camera"
FRAME_KEY = "url"
RADAR_KEY = "radar"


def tile_kind(value: Any) -> str:
    """A tile naming a `url` is a frame and one naming `radar` is a radar. Anything else, a bare
    entity id included, is a camera."""

    if isinstance(value, Frame):
        return FRAME_TILE

    if isinstance(value, RadarTile):
        return RADAR_TILE

    if isinstance(value, dict):
        if FRAME_KEY in value:
            return FRAME_TILE

        if RADAR_KEY in value:
            return RADAR_TILE

    return CAMERA_TILE


WeatherTile = Annotated[
    Annotated[Frame, Tag(FRAME_TILE)]
    | Annotated[RadarTile, Tag(RADAR_TILE)]
    | Annotated[CameraEntry, Tag(CAMERA_TILE)],
    Discriminator(tile_kind),
]


class WeatherFaceOptions(CameraFaceOptions):
    """Tiles laid out after the weather face's own cards, filling its grid left to right.

    A tile is a camera, written as it would be on a camera face, a frame, or a radar. With no
    tiles the face is its own cards alone.
    """

    tiles: list[WeatherTile] = Field(default_factory=list)

    @property
    def cameras(self) -> list[Camera]:
        return [tile for tile in self.tiles if isinstance(tile, Camera)]

    @property
    def radars(self) -> list[Radar]:
        return [tile.radar for tile in self.tiles if isinstance(tile, RadarTile)]


# The renderers that read `options` as something more than a passthrough, and the shape each
# one reads it as. A content name absent from here takes its options untouched.
FACE_OPTIONS: dict[str, type[CameraFaceOptions]] = {
    CAMERA_GRID_FACE_CONTENT: CameraGridOptions,
    CAMERA_HERO_FACE_CONTENT: CameraHeroOptions,
    WEATHER_FACE_CONTENT: WeatherFaceOptions,
}


class Face(BaseModel):
    """One face of the cube.

    `content` names a renderer the frontend knows about. `page` names a directory under
    `faces/` in the resources directory, for a face an installation supplies itself. `options`
    is handed to the renderer: a face's cards are fixed, but what they point at is not.

    `label` is the face's name, set up its left edge in a strip. A face that fills its own
    width — the dashboard — turns the strip off; on anything else it is the only thing saying
    which of the six you are looking at.
    """

    content: str = BLANK_FACE_CONTENT
    label: str = ""
    label_strip: bool = Field(default=True, description="Name this face up its left edge")
    page: str | None = None
    options: dict[str, Any] = Field(default_factory=dict)

    _options: CameraFaceOptions | None = PrivateAttr(default=None)

    def bind(self, model: type[CameraFaceOptions]) -> None:
        """Reads this face's options as its renderer's own type, and normalises them in place.

        The normalisation is what lets a camera be written as a bare entity id: it is a whole
        camera by the time anything downstream sees it, so neither the allowlist nor the
        frontend has two forms to handle.
        """

        parsed = model.model_validate(self.options)

        self._options = parsed
        self.options = parsed.model_dump(mode="json")

    @property
    def cameras(self) -> list[Camera]:
        """The cameras this face draws, and none at all when it draws something else."""

        return self._options.cameras if self._options else []

    @property
    def radars(self) -> list[Radar]:
        """The radars this face draws, each of which needs somewhere to centre on."""

        return self._options.radars if isinstance(self._options, WeatherFaceOptions) else []


class Profile(BaseModel):
    """A panel's identity.

    One instance can serve several panels; the profile decides which cube faces they get,
    which floorplan level they open on, and which media player their visualizer follows.

    Every profile but `default` is a delta. `inherits` names the profile it starts from, and
    defaults to `default`, so a panel states only what makes it different. `media_player` is
    the exception that never inherits: a panel following the wrong room's speaker looks
    exactly like one that works, right up until an announcement lights up the wrong wall.
    """

    name: str | None = None
    floorplan: str | None = None
    media_player: str | None = None
    inherits: str | None = None
    faces: dict[str, Face] = Field(default_factory=dict)


# Domains the panel may toggle. Anything outside this set is read-only, so a panel cannot
# reach past the controls it actually renders.
DEFAULT_TOGGLEABLE_DOMAINS = ["light", "switch", "group", "input_boolean"]

CUBE_FACES = ("front", "back", "left", "right", "up", "down")

DEFAULT_PROFILE_KEY = "default"

MISSING_DEFAULT_PROFILE_MESSAGE = f"No `{DEFAULT_PROFILE_KEY}` profile. Every panel inherits from it, so it must exist."
DEFAULT_PROFILE_INHERITS_MESSAGE = f"The `{DEFAULT_PROFILE_KEY}` profile is the root and cannot inherit."
DEFAULT_PROFILE_MEDIA_PLAYER_MESSAGE = (
    f"The `{DEFAULT_PROFILE_KEY}` profile is a template rather than a panel, and `media_player` is never inherited, "
    "so a speaker named here could not reach one. Put it on the panel's own profile."
)
INCOMPLETE_DEFAULT_PROFILE_MESSAGE = (
    f"The `{DEFAULT_PROFILE_KEY}` profile must define all six faces; missing: {{faces}}."
)
UNKNOWN_PARENT_MESSAGE = "Profile `{profile}` inherits `{parent}`, which is not defined."
INHERITANCE_CYCLE_MESSAGE = "Profile `{profile}` inherits itself, by way of `{parent}`."
UNKNOWN_PROFILE_FLOORPLAN_MESSAGE = "Profile `{profile}` opens on floorplan `{floorplan}`, which is not defined."
FACE_WITHOUT_PAGE_MESSAGE = (
    f"The {{face}} face of profile `{{profile}}` is `{CUSTOM_FACE_CONTENT}` but names no `page`."
)
UNSAFE_PAGE_NAME_MESSAGE = (
    "The {face} face of profile `{profile}` names page `{page}`, which is not a plain directory name."
)
INVALID_FACE_OPTIONS_MESSAGE = "The {face} face of profile `{profile}` has options it cannot draw with: {error}"
GO2RTC_WITHOUT_SERVER_MESSAGE = "Camera `{camera}` streams from go2rtc, but no `go2rtc` block says where go2rtc is."
RADAR_WITHOUT_ZONE_MESSAGE = (
    "The {face} face of profile `{profile}` has a radar, but no `weather.zone_entity_id` to centre it on."
)
WEATHER_FACE_WITHOUT_WEATHER_MESSAGE = (
    f"The {{face}} face of profile `{{profile}}` is `{WEATHER_FACE_CONTENT}`, but there is no `weather` block to draw."
)

MISSING_FACE_PAGE_MESSAGE = "No page at %s for the %s face of profile %s; that face falls back to blank."


class Dashboard(BaseModel):
    profiles: dict[str, Profile] = Field(default_factory=dict)

    theme: Theme = Field(default_factory=Theme)
    colors: Colors = Field(default_factory=Colors)
    labels: Labels = Field(default_factory=Labels)
    clock: Clock = Field(default_factory=Clock)
    indicators: list[Indicator] = Field(default_factory=list)
    status_indicators: list[StatusIndicator] = Field(default_factory=list)
    notices: list[Notice] = Field(default_factory=list)
    agenda: Agenda = Field(default_factory=Agenda)
    toggles: list[Toggle] = Field(default_factory=list)
    floorplans: dict[str, Floorplan] = Field(default_factory=dict)
    weather: Weather | None = None
    camera: Camera | None = None
    go2rtc: Go2rtc | None = None
    fuel: GaugeRow = Field(default_factory=GaugeRow)
    transcript: Transcript | None = None
    visualizer: Visualizer | None = None

    toggleable_domains: list[str] = Field(default_factory=lambda: list(DEFAULT_TOGGLEABLE_DOMAINS))
    # Counts that drive the agenda's scroll animation, rather than anything rendered directly.
    item_count_entities: list[str] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def resolve_palette(cls, data: Any) -> Any:
        """Reads every colour written as a palette name as the colour it names.

        Done on the document before anything else sees it, so every section downstream — and the
        config endpoint — only ever deals in colours.
        """

        if not isinstance(data, dict):
            return data

        palette = Colors.model_validate(data.get(COLORS_SECTION) or {}).model_dump()

        return {
            key: value if key == COLORS_SECTION else resolve_named_colors(value, palette) for key, value in data.items()
        }

    @model_validator(mode="after")
    def resolve_profiles(self) -> Self:
        """Flattens every profile against the chain it inherits, and refuses one that cannot be.

        This runs at load rather than per request, so a cycle is a process that will not start
        rather than a panel that gets a 500, and so everything downstream — the relay's speaker
        allowlist, the entity subscription, the config endpoint — sees complete profiles.
        """

        default = self.profiles.get(DEFAULT_PROFILE_KEY)
        if default is None:
            raise ValueError(MISSING_DEFAULT_PROFILE_MESSAGE)

        if default.inherits is not None:
            raise ValueError(DEFAULT_PROFILE_INHERITS_MESSAGE)

        if default.media_player is not None:
            raise ValueError(DEFAULT_PROFILE_MEDIA_PLAYER_MESSAGE)

        absent = [face for face in CUBE_FACES if face not in default.faces]
        if absent:
            raise ValueError(INCOMPLETE_DEFAULT_PROFILE_MESSAGE.format(faces=", ".join(absent)))

        self.profiles = {key: self._resolved(key) for key in self.profiles}

        for key, profile in self.profiles.items():
            if profile.floorplan is not None and profile.floorplan not in self.floorplans:
                raise ValueError(UNKNOWN_PROFILE_FLOORPLAN_MESSAGE.format(profile=key, floorplan=profile.floorplan))

            for name, face in profile.faces.items():
                if face.content == CUSTOM_FACE_CONTENT:
                    if not face.page:
                        raise ValueError(FACE_WITHOUT_PAGE_MESSAGE.format(profile=key, face=name))

                    if not is_safe_page_name(face.page):
                        raise ValueError(UNSAFE_PAGE_NAME_MESSAGE.format(profile=key, face=name, page=face.page))

                if face.content == WEATHER_FACE_CONTENT and self.weather is None:
                    raise ValueError(WEATHER_FACE_WITHOUT_WEATHER_MESSAGE.format(profile=key, face=name))

                options = FACE_OPTIONS.get(face.content)
                if options is None:
                    continue

                try:
                    face.bind(options)
                except ValidationError as error:
                    raise ValueError(INVALID_FACE_OPTIONS_MESSAGE.format(profile=key, face=name, error=error)) from error

                if face.radars and (self.weather is None or self.weather.zone_entity_id is None):
                    raise ValueError(RADAR_WITHOUT_ZONE_MESSAGE.format(profile=key, face=name))

        self._require_go2rtc()

        return self

    def _resolved(self, key: str) -> Profile:
        """One profile with its whole inheritance chain folded in."""

        resolved = Profile()

        for ancestor in self._chain(key):
            if ancestor.floorplan is not None:
                resolved.floorplan = ancestor.floorplan

            # By face name, so a child that names `front` owns that face outright and leaves
            # its siblings alone.
            resolved.faces.update(ancestor.faces)

        own = self.profiles[key]
        resolved.name = own.name or key
        resolved.media_player = own.media_player

        return resolved

    def _chain(self, key: str) -> list[Profile]:
        """The profiles `key` is built from, furthest ancestor first."""

        chain: list[Profile] = []
        seen: set[str] = set()
        current: str | None = key

        while current is not None:
            if current in seen:
                raise ValueError(INHERITANCE_CYCLE_MESSAGE.format(profile=key, parent=current))

            profile = self.profiles.get(current)
            if profile is None:
                raise ValueError(UNKNOWN_PARENT_MESSAGE.format(profile=key, parent=current))

            seen.add(current)
            chain.append(profile)

            current = None if current == DEFAULT_PROFILE_KEY else profile.inherits or DEFAULT_PROFILE_KEY

        chain.reverse()

        return chain

    @property
    def media_players(self) -> frozenset[str]:
        """The speakers panels follow.

        This is the relay's allowlist: an announcement is only fetched on behalf of a speaker
        some profile actually watches, so the endpoint cannot be pointed at anything else.
        """

        return frozenset(profile.media_player for profile in self.profiles.values() if profile.media_player)

    def _require_go2rtc(self) -> None:
        """Refuses a go2rtc camera with nowhere to stream from.

        Otherwise it is a black tile on a wall, found by whoever next walks past it.
        """

        if self.go2rtc is not None:
            return

        cameras = [self.camera] if self.camera else []
        cameras += [
            camera for profile in self.profiles.values() for face in profile.faces.values() for camera in face.cameras
        ]

        for camera in cameras:
            if camera.stream_type == StreamType.GO2RTC:
                raise ValueError(GO2RTC_WITHOUT_SERVER_MESSAGE.format(camera=camera.entity_id))

    @property
    def camera_entities(self) -> frozenset[str]:
        """Every camera a panel may ask for a frame from.

        This is the snapshot endpoint's allowlist. A camera face puts cameras on a panel that
        the dashboard's own camera card knows nothing about, so it is the union of both rather
        than the single camera that card draws.
        """

        entities = {self.camera.entity_id} if self.camera else set()

        for profile in self.profiles.values():
            for face in profile.faces.values():
                entities.update(camera.entity_id for camera in face.cameras)

        return frozenset(entities)

    @property
    def allowed_entities(self) -> frozenset[str]:
        """Every entity the panel subscribes to.

        This is the proxy's allowlist: Home Assistant is asked for these and nothing else, so
        the rest of the state machine never crosses the wire.
        """

        entities: set[str] = set(self.item_count_entities)

        for reading in (*self.indicators, *self.status_indicators):
            entities.add(reading.entity_id)

        for indicator in self.indicators:
            if indicator.bearing:
                entities.add(indicator.bearing.entity_id)

        for notice in self.notices:
            entities.add(notice.entity_id)

        for calendar in self.agenda.calendars:
            entities.add(calendar.entity_id)

        for toggle in self.toggles:
            entities.add(toggle.entity_id)
            if toggle.visible_when:
                entities.add(toggle.visible_when)

        for floorplan in self.floorplans.values():
            entities.update(floorplan.entity_ids)

        for gauge in self.fuel.gauges:
            entities.add(gauge.entity_id)

        for profile in self.profiles.values():
            if profile.media_player:
                entities.add(profile.media_player)

        if self.weather:
            entities.add(self.weather.entity_id)
            for reading in (self.weather.high, self.weather.low):
                if reading:
                    entities.add(reading.entity_id)
            if self.weather.summary_entity_id:
                entities.add(self.weather.summary_entity_id)
            if self.weather.sun_entity_id:
                entities.add(self.weather.sun_entity_id)
            if self.weather.zone_entity_id:
                entities.add(self.weather.zone_entity_id)

        entities.update(self.camera_entities)

        if self.transcript:
            entities.add(self.transcript.entity_id)

        return frozenset(entities)

    @property
    def toggleable_entities(self) -> frozenset[str]:
        """Entities a panel is allowed to act on.

        Toggles are explicit, floorplan controls are inferred from the groups whose whole
        purpose is to be tapped. Membership here is necessary but not sufficient: the domain
        has to be allowed too.
        """

        entities = {toggle.entity_id for toggle in self.toggles}

        for floorplan in self.floorplans.values():
            for group in CONTROLLABLE_FLOORPLAN_GROUPS:
                entities.update(floorplan.groups.get(group, []))

        return frozenset(entities)

    def may_toggle(self, entity_id: str) -> bool:
        domain, _, _ = entity_id.partition(".")

        return domain in self.toggleable_domains and entity_id in self.toggleable_entities


# Floorplan groups whose elements are controls rather than read-outs.
CONTROLLABLE_FLOORPLAN_GROUPS = ("lights", "fans")


def drop_missing_custom_faces(dashboard: Dashboard, resources_path: Path) -> None:
    """Falls a custom face back to a labelled blank when its page is not on disk.

    Faces come from the mounted resources directory, which the process does not own and cannot
    check until it is running. A mistyped page name would otherwise put a white rectangle on a
    wall; a labelled blank says which face went missing, and the log says where it looked.
    """

    for key, profile in dashboard.profiles.items():
        for name, face in profile.faces.items():
            if face.content != CUSTOM_FACE_CONTENT or face.page is None:
                continue

            page = resources_path / FACE_DIRECTORY / face.page / FACE_ENTRYPOINT
            if page.is_file():
                continue

            logger.warning(MISSING_FACE_PAGE_MESSAGE, page, name, key)
            profile.faces[name] = Face(content=BLANK_FACE_CONTENT, label=face.page)


def load_dashboard(path: Path) -> Dashboard:
    if not path.exists():
        raise FileNotFoundError(f"Dashboard config not found at {path}. Copy config.yaml.dist and edit it.")

    document: dict[str, Any] = yaml.safe_load(path.read_text()) or {}

    return Dashboard.model_validate(document)
