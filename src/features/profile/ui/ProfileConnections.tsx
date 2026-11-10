import React, { useState } from 'react';
import { View } from 'react-native';
import { ConnectionSection } from './ConnectionPrimitives';
import {ProfileMailConnections} from './ProfileMailConnections';
import {AuthContext} from '@/context/AuthContext';

/** Shared service list; individual connection forms own their authorization. */
export function ProfileConnections({ children }: React.PropsWithChildren) {
  const [expanded, setExpanded] = useState<Record<string,boolean>>({onec:true,mail:false});
  const userId=React.useContext(AuthContext)?.profile?.id;
  const services = [
    { id: 'onec', title: '1С', subtitle: 'Личная учётная запись', icon: 'server-outline' as const, content: children },
    { id: 'mail', title: 'Почта', subtitle: 'Mail.ru · Яндекс', icon: 'mail-outline' as const, content: userId?<ProfileMailConnections key={userId} userId={userId}/>:null },
  ];
  return <View>{services.map(service => <ConnectionSection key={service.id} keepMounted title={service.title}
    subtitle={service.subtitle} icon={service.icon} expanded={Boolean(expanded[service.id])}
    onPress={() => setExpanded(current => ({...current,[service.id]:!current[service.id]}))}>
    {service.content}
  </ConnectionSection>)}</View>;
}
