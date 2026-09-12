from fastapi import APIRouter

from cube.api import agenda, control, dashboard, forecast, media, radar, stream

router = APIRouter()
router.include_router(dashboard.router)
router.include_router(stream.router)
router.include_router(control.router)
router.include_router(media.router)
router.include_router(agenda.router)
router.include_router(forecast.router)
router.include_router(radar.router)

__all__ = ["router"]
