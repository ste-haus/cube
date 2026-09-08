# cube

A wall panel for Home Assistant, served from your own machine rather than from Home Assistant itself.

The panel presents itself as a cube. One face is the dashboard; swiping, arrow keys, or the map of dots in the corner turn it to the others.

## Where to start

| If you want to | Read |
|---|---|
| Get a panel on the wall | [Setup](setup.md) |
| Change what it shows | [Configuration](configuration.md) |
| Draw a floorplan it can drive | [Floorplans](floorplans.md) |
| Serve more than one panel | [Panels and profiles](panels.md) |
| Work out why something is missing | [Troubleshooting](troubleshooting.md) |

## What it does

cube holds one connection to Home Assistant and serves however many panels you point at it. It asks for a named list of entities and nothing else, so a chatty sensor you do not display costs nothing, and it hands the panels a filtered copy rather than letting each one subscribe to the whole house.

The panels never hold a Home Assistant token and cannot reach anything the config does not name. If a panel is stolen off the wall, it is a browser pointed at a screen.

## What it shows

The dashboard is arranged in three columns with a header and a footer:

```
┌──────────────────────────────────────────────────┐
│ date                              header readings│
│ clock                                            │
│                                                  │
│ notices        floorplan          weather        │
│                                   forecast       │
│ today                                            │
│                                   camera         │
│                                                  │
│                                   gauges         │
│                                                  │
│                       transcript                 │
└──────────────────────────────────────────────────┘
```

Every part of it is optional. Leave a section out of the config and the panel simply does not draw it.
