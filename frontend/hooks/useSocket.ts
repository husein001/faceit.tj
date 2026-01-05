'use client';

import { useEffect, useRef, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { connectSocket, disconnectSocket, getSocket } from '@/lib/socket';
import { useAuth } from './useAuth';

export function useSocket() {
  const { token } = useAuth();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    socketRef.current = connectSocket(token || undefined);

    return () => {
      // Don't disconnect on unmount to keep connection alive
      // disconnectSocket();
    };
  }, [token]);

  const emit = useCallback((event: string, data?: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
    }
  }, []);

  const on = useCallback((event: string, callback: (...args: any[]) => void) => {
    socketRef.current?.on(event, callback);
    return () => {
      socketRef.current?.off(event, callback);
    };
  }, []);

  const off = useCallback((event: string, callback?: (...args: any[]) => void) => {
    if (callback) {
      socketRef.current?.off(event, callback);
    } else {
      socketRef.current?.removeAllListeners(event);
    }
  }, []);

  const joinRoom = useCallback((room: string) => {
    emit(`join_${room.split(':')[0]}`, room.split(':')[1] || room);
  }, [emit]);

  const leaveRoom = useCallback((room: string) => {
    emit(`leave_${room.split(':')[0]}`, room.split(':')[1] || room);
  }, [emit]);

  return {
    socket: socketRef.current,
    emit,
    on,
    off,
    joinRoom,
    leaveRoom,
    isConnected: socketRef.current?.connected || false,
  };
}
