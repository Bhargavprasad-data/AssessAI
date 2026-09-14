import { useState, useEffect, useRef } from 'react';
import type { LeaderboardEntry, ViolationEvent } from '../types';
import { apiFetch, getWsUrl } from '../api/client';

export const useLeaderboard = (assessmentId: string) => {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [violations, setViolations] = useState<ViolationEvent[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const wsRef = useRef<WebSocket | null>(null);

  // Polling fallback fetcher
  const pollLeaderboard = async () => {
    try {
      const res = await apiFetch<{ leaderboard: LeaderboardEntry[] }>(
        `/api/assessments/${assessmentId}/leaderboard`
      );
      if (res.leaderboard) {
        setLeaderboard(res.leaderboard);
      }
    } catch (err) {
      console.error('Polling leaderboard error:', err);
    }
  };

  useEffect(() => {
    if (!assessmentId) return;

    // Fetch initial data via HTTP
    pollLeaderboard();

    // Setup WebSocket with proper endpoint routing
    const wsUrl = getWsUrl(`/ws/assessments/${assessmentId}/leaderboard`);

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'leaderboard_update' && Array.isArray(payload.data)) {
          setLeaderboard(payload.data);
        } else if (payload.type === 'violation' && payload.data) {
          setViolations((prev) => [payload.data, ...prev.slice(0, 49)]);
        }
      } catch (err) {
        console.error('WebSocket message error:', err);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
    };

    ws.onerror = () => {
      setIsConnected(false);
    };

    // Polling fallback interval (runs every 5s if WebSocket is disconnected)
    const pollInterval = setInterval(() => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        pollLeaderboard();
      }
    }, 5000);

    return () => {
      clearInterval(pollInterval);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [assessmentId]);

  return {
    leaderboard,
    violations,
    isConnected,
    connectionMode: isConnected ? 'ws' : 'polling',
    refresh: pollLeaderboard,
  };
};
