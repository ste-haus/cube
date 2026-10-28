from fastapi import APIRouter

from cube.api import agenda, control, dashboard, event, forecast, history, media, radar, routes, stream

router = APIRouter()
router.include_router(dashboard.router)
router.include_router(stream.router)
router.include_router(control.router)
router.include_router(event.router)
router.include_router(media.router)
router.include_router(agenda.router)
router.include_router(forecast.router)
router.include_router(radar.router)
router.include_router(history.router)
router.include_router(routes.router)

__all__ = ["router"]
