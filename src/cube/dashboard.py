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
from pydantic import BaseModel, BeforeValidator, Field, PrivateAttr, ValidationError, model_validator

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
    """A forecast high or low, and optionally how far off it is."""

    hours_attribute: str | None = None


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


class Camera(BaseModel):
    entity_id: str
    title: str | None = None
    refresh_seconds: float = 10.0


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


class Transcript(BaseModel):
    entity_id: str
    characters: int = 22
    seconds: float = 6.0


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


BLANK_FACE_CONTENT = "blank"
DASHBOARD_FACE_CONTENT = "dashboard"
CUSTOM_FACE_CONTENT = "custom"
CAMERA_GRID_FACE_CONTENT = "camera-grid"
CAMERA_HERO_FACE_CONTENT = "camera-hero"

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
    """Options for a face whose whole content is cameras.

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


# The renderers that read `options` as something more than a passthrough, and the shape each
# one reads it as. A content name absent from here takes its options untouched.
FACE_OPTIONS: dict[str, type[CameraFaceOptions]] = {
    CAMERA_GRID_FACE_CONTENT: CameraGridOptions,
    CAMERA_HERO_FACE_CONTENT: CameraHeroOptions,
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
        self.options = parsed.model_dump()

    @property
    def cameras(self) -> list[Camera]:
        """The cameras this face draws, and none at all when it draws something else."""

        return self._options.cameras if self._options else []


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

MISSING_FACE_PAGE_MESSAGE = "No page at %s for the %s face of profile %s; that face falls back to blank."


class Dashboard(BaseModel):
    profiles: dict[str, Profile] = Field(default_factory=dict)

    theme: Theme = Field(default_factory=Theme)
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
    fuel: GaugeRow = Field(default_factory=GaugeRow)
    transcript: Transcript | None = None
    visualizer: Visualizer | None = None

    toggleable_domains: list[str] = Field(default_factory=lambda: list(DEFAULT_TOGGLEABLE_DOMAINS))
    # Counts that drive the agenda's scroll animation, rather than anything rendered directly.
    item_count_entities: list[str] = Field(default_factory=list)

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

                options = FACE_OPTIONS.get(face.content)
                if options is None:
                    continue

                try:
                    face.bind(options)
                except ValidationError as error:
                    raise ValueError(INVALID_FACE_OPTIONS_MESSAGE.format(profile=key, face=name, error=error)) from error

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
