"""Dashboard definition.

Everything installation-specific — entity ids, labels, colors, URLs, floorplan layout — is
loaded from a YAML file at runtime rather than baked in here. `config.yaml.dist` is a
placeholder copy of the schema; see the README for how to point at your own.
"""

from enum import StrEnum
from pathlib import Path
from typing import Any, Self

import yaml
from pydantic import BaseModel, Field, model_validator


class Theme(BaseModel):
    """The panel's palette, applied as CSS custom properties."""

    background: str = "#000000"
    foreground: str = "#ffffff"
    muted: str = "#999999"
    dim: str = "#666666"
    faint: str = "#333333"
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


class Calendar(BaseModel):
    entity_id: str
    name: str
    color: str
    side: Side = Side.RIGHT
    blocklist: str | None = Field(default=None, description="Regex of event titles to hide")


class Floorplan(BaseModel):
    """One floorplan level.

    `image` names an SVG served by Home Assistant under `www/`. Each element in that SVG
    carries an entity id as its DOM id, and the browser drives it by setting a class per
    group; `groups` is what says which entity belongs to which group.
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
    """A full-screen overlay shown while a media player is playing matching content."""

    url: str
    content_marker: str = Field(description="Substring of media_content_id that triggers the overlay")


class Labels(BaseModel):
    """Section headings. Here rather than in the frontend so they stay translatable."""

    notices: str = "Notices"
    agenda: str = "Today"


class Face(BaseModel):
    """One face of the cube. `content` names a renderer the frontend knows about."""

    content: str = "blank"
    label: str = ""


class Profile(BaseModel):
    """A panel's identity.

    One instance can serve several panels; the profile decides which cube faces they get,
    which floorplan level they open on, and which media player their visualizer follows.
    """

    name: str
    floorplan: str | None = None
    media_player: str | None = None
    faces: dict[str, Face] = Field(default_factory=dict)


# Domains the panel may toggle. Anything outside this set is read-only, so a panel cannot
# reach past the controls it actually renders.
DEFAULT_TOGGLEABLE_DOMAINS = ["light", "switch", "group", "input_boolean"]

CUBE_FACES = ("front", "back", "left", "right", "up", "down")


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

        if self.camera:
            entities.add(self.camera.entity_id)

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


def load_dashboard(path: Path) -> Dashboard:
    if not path.exists():
        raise FileNotFoundError(f"Dashboard config not found at {path}. Copy config.yaml.dist and edit it.")

    document: dict[str, Any] = yaml.safe_load(path.read_text()) or {}

    return Dashboard.model_validate(document)
