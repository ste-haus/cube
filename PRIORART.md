# Prior art

The places the cube took its ideas from, and the work it ported.

## The original cube

This replaces a Lovelace dashboard, which itself replaced a hand-written panel from 2018: [ste-haus-archive/cube](https://github.com/ste-haus-archive/cube). The cube rotation is carried over from that original, along with the idea that a wall panel is better served by something small than by a general-purpose dashboard engine.

## Lovelace cards

The dashboard the cube replaced was built from community cards, and several of the cube's cards began as ports of them.

- [mlamberts78/weather-chart-card](https://github.com/mlamberts78/weather-chart-card): the forecast drawn as a chart, with the temperatures as lines over each column's sky and the chance of rain as a shaded curve behind them. The cube's forecast chart, for both the week and the hours, follows it.
- [pkissling/clock-weather-card](https://github.com/pkissling/clock-weather-card): the day's low and high as a bar coloured by temperature, with now marked along it. The cube's temperature range follows it.
- [rejuvenate/lovelace-horizon-card](https://github.com/rejuvenate/lovelace-horizon-card): the sun's arc over the horizon through the day, with the moon at its phase and the day's sun events marked along it. The cube's horizon and moon follow it.

## Metrology

- [Madelena/hass-config-public](https://github.com/Madelena/hass-config-public): Madelena Mak's Metrology dashboard, whose rail rows draw state as a metro map. The network face's map is laid out the same way: a line of stops down the page, with each hub's branches leaving it on rails of their own.
