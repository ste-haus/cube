import logging

import uvicorn

from cube.app import create_app
from cube.config import get_settings

LOG_FORMAT = "%(asctime)s %(levelname)s [%(name)s] %(message)s"


def main() -> None:
    settings = get_settings()
    logging.basicConfig(level=settings.log_level.upper(), format=LOG_FORMAT)

    uvicorn.run(create_app(settings), host=settings.host, port=settings.port, log_level=settings.log_level)


if __name__ == "__main__":
    main()
