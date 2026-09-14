import asyncio
import logging
from app.config import settings
from app.database import AsyncSessionLocal
from app.services.sweep_service import run_timer_expiry_sweep

logger = logging.getLogger(__name__)


class BackgroundSweepTask:
    def __init__(self, interval_seconds: int = settings.SWEEP_INTERVAL_SECONDS):
        self.interval_seconds = interval_seconds
        self._task: asyncio.Task = None
        self._running: bool = False

    async def _sweep_loop(self):
        while self._running:
            try:
                await asyncio.sleep(self.interval_seconds)
                async with AsyncSessionLocal() as session:
                    finalized = await run_timer_expiry_sweep(session)
                    if finalized > 0:
                        logger.info(f"Sweep job finalized {finalized} expired attempts.")
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in background sweep task: {str(e)}", exc_info=True)

    def start(self):
        if not self._running:
            self._running = True
            self._task = asyncio.create_task(self._sweep_loop())
            logger.info(f"Background timer sweep task started (interval: {self.interval_seconds}s).")

    def stop(self):
        if self._running:
            self._running = False
            if self._task and not self._task.done():
                self._task.cancel()
            logger.info("Background timer sweep task stopped.")


sweep_task = BackgroundSweepTask()
