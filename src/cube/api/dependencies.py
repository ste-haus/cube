from typing import Annotated

from fastapi import Depends, Request

from cube.hub import Hub

HUB_ATTRIBUTE = "hub"


def get_hub(request: Request) -> Hub:
    return getattr(request.app.state, HUB_ATTRIBUTE)


CurrentHub = Annotated[Hub, Depends(get_hub)]
