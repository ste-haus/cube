# CLAUDE.md

Guidance for agents working in this repository. The README is how the thing works; `docs/` is how to use it.

## Before changing anything visual

**Read [`web/STYLE.md`](web/STYLE.md) before adding or changing an animation, a colour, an overlay, a window, or a card's look.** It holds the panel's motion and styling vocabulary: what each rhythm means, where the tier colours may and may not appear, how windows open and close, how rows come and go, and the mechanics that trip things up (the cube's perspective, ghost clicks, tap-versus-swipe). Reuse what is there before inventing an effect, and when a change settles a new convention, record it in that file in the same change.

## Checks

```bash
make test                    # Python tests
make lint                    # ruff
npm --prefix web run check   # svelte-check
npm --prefix web test        # vitest
```

CI runs all four on every pull request.

## Releases

The version lives in git tags, not in a file. Merging to `main` cuts the next tag: a patch by default, or a minor or major bump when the merge commit's message contains `#minor` or `#major`.
