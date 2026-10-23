import { useContext, useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { AuthContext } from '@/context/AuthContext';
import { useNotify } from '@/components/NotificationHost';
import { getNotificationSettings, type NotificationSettings } from '@/utils/notificationSettingsService';
import { type ManagedSocketConnection } from '@/src/shared/socket/managedSocket';
import { createHelpSocket } from './helpSocket';
import { createHelpApi } from './helpApi';

export function HelpNotificationsBridge() {
  const auth = useContext(AuthContext), router = useRouter(), pathname = usePathname(), notify = useNotify();
  const route = useRef(pathname); route.current = pathname;
  const userId = Number(auth?.profile?.id || 0);
  useEffect(() => {
    if (!auth?.isAuthenticated || !userId) return;
    let active = true, connection: ManagedSocketConnection | undefined;
    let settings: NotificationSettings | null = null, settingsAt = 0;
    const seen = new Set<number>();
    const foreground = () => Platform.OS === 'web' ? typeof document !== 'undefined' && document.visibilityState === 'visible' : AppState.currentState === 'active';
    // The server checks current service/ticket rights on every delivery; no public rooms.
    void createHelpApi(userId).config().then(() => {
      if (!active) return;
      connection = createHelpSocket(userId, (socket) => {
          socket.on('connect', () => socket.emit('help:subscribe', {}));
          socket.on('help:event', (event: {id:number;ticketId:number;actorId:number;type:string}) => {
            if (!active || !Number.isSafeInteger(event.id) || !Number.isSafeInteger(event.ticketId) || event.actorId === userId || seen.has(event.id)) return;
            if (!['MESSAGE_CREATED','TICKET_CREATED','TICKET_CLOSED','TICKET_REOPENED','IT_JOINED','IT_REQUESTED'].includes(event.type)) return;
            seen.add(event.id); if (seen.size > 300) seen.delete(seen.values().next().value!);
            if (!foreground() || route.current.startsWith('/services/help')) return;
            void (async () => {
              if (!settings || Date.now() - settingsAt > 30000) { settings = await getNotificationSettings(); settingsAt = Date.now(); }
              const enabled = ['TICKET_CLOSED','TICKET_REOPENED'].includes(event.type) ? settings?.pushStatusChanged : settings?.pushNewMessage;
              if (!active || !foreground() || route.current.startsWith('/services/help') || !settings?.inAppNotificationsEnabled || !enabled) return;
              notify({id:`help:${userId}:${event.id}`,title:'Помощь',message:'Новое событие в обращении. Нажмите, чтобы открыть.',type:'info',icon:'headset-outline',durationMs:6000,
                dismissKeys:[`help:${event.ticketId}`],onPress:()=>{if(active)router.push({pathname:'/services/help',params:{ticketId:String(event.ticketId)}} as any);}});
            })().catch(() => {});
          });
      });
    }).catch(() => {});
    return () => { active = false; connection?.disconnect(); };
  }, [auth?.isAuthenticated, userId, router, notify]);
  return null;
}
