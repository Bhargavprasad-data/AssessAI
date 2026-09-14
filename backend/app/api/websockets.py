import json
import uuid
from typing import Dict, List, Set
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, AsyncSessionLocal
from app.services.leaderboard_service import get_authoritative_leaderboard

router = APIRouter(tags=["WebSockets & Live Hub"])


class ConnectionManager:
    """
    In-memory WebSocket hub for single-instance v1.
    Designed with a clean broadcast interface so Redis Pub/Sub or Postgres LISTEN/NOTIFY
    can be dropped in for multi-instance horizontal scaling without modifying API endpoints.
    Authoritative state is ALWAYS persisted in PostgreSQL.
    """
    def __init__(self):
        # assessment_id -> set of active WebSockets
        self.leaderboard_connections: Dict[str, Set[WebSocket]] = {}
        self.proctoring_connections: Dict[str, Set[WebSocket]] = {}

    async def connect_leaderboard(self, assessment_id: str, websocket: WebSocket):
        await websocket.accept()
        if assessment_id not in self.leaderboard_connections:
            self.leaderboard_connections[assessment_id] = set()
        self.leaderboard_connections[assessment_id].add(websocket)

    def disconnect_leaderboard(self, assessment_id: str, websocket: WebSocket):
        if assessment_id in self.leaderboard_connections:
            self.leaderboard_connections[assessment_id].discard(websocket)

    async def connect_proctoring(self, assessment_id: str, websocket: WebSocket):
        await websocket.accept()
        if assessment_id not in self.proctoring_connections:
            self.proctoring_connections[assessment_id] = set()
        self.proctoring_connections[assessment_id].add(websocket)

    def disconnect_proctoring(self, assessment_id: str, websocket: WebSocket):
        if assessment_id in self.proctoring_connections:
            self.proctoring_connections[assessment_id].discard(websocket)

    async def broadcast_leaderboard_update(self, assessment_id: str, data: List[dict]):
        if assessment_id in self.leaderboard_connections:
            dead = []
            for ws in self.leaderboard_connections[assessment_id]:
                try:
                    await ws.send_json({"type": "leaderboard_update", "data": data})
                except Exception:
                    dead.append(ws)
            for ws in dead:
                self.leaderboard_connections[assessment_id].discard(ws)

    async def broadcast_violation_signal(self, assessment_id: str, violation_payload: dict):
        if assessment_id in self.proctoring_connections:
            dead = []
            for ws in self.proctoring_connections[assessment_id]:
                try:
                    await ws.send_json({"type": "violation_event", "data": violation_payload})
                except Exception:
                    dead.append(ws)
            for ws in dead:
                self.proctoring_connections[assessment_id].discard(ws)


ws_manager = ConnectionManager()


@router.websocket("/ws/assessments/{assessment_id}/leaderboard")
async def websocket_leaderboard_endpoint(websocket: WebSocket, assessment_id: str):
    await ws_manager.connect_leaderboard(assessment_id, websocket)
    # Send initial DB-backed leaderboard state
    try:
        async with AsyncSessionLocal() as session:
            data = await get_authoritative_leaderboard(session, uuid.UUID(assessment_id))
            await websocket.send_json({"type": "leaderboard_update", "data": data})

        while True:
            # Keep alive and listen for client messages
            msg = await websocket.receive_text()
            if msg == "ping":
                await websocket.send_text("pong")
    except (WebSocketDisconnect, Exception):
        ws_manager.disconnect_leaderboard(assessment_id, websocket)


@router.websocket("/ws/assessments/{assessment_id}/proctoring")
async def websocket_proctoring_endpoint(websocket: WebSocket, assessment_id: str):
    await ws_manager.connect_proctoring(assessment_id, websocket)
    try:
        while True:
            msg = await websocket.receive_text()
            if msg == "ping":
                await websocket.send_text("pong")
    except (WebSocketDisconnect, Exception):
        ws_manager.disconnect_proctoring(assessment_id, websocket)


# HTTP Polling fallback endpoints
@router.get("/assessments/{assessment_id}/leaderboard")
async def poll_leaderboard(assessment_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    data = await get_authoritative_leaderboard(db, assessment_id)
    return {"leaderboard": data}
