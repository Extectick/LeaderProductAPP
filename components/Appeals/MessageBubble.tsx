import { View, Text, Image } from 'react-native';
import { AppealMessage } from '@/types/appealsTypes';

export default function MessageBubble({ message, own }: { message: AppealMessage; own: boolean }) {
  return (
    <View style={{ alignSelf: own ? 'flex-end' : 'flex-start', maxWidth: '85%', padding: 10, margin: 8, backgroundColor: own ? '#DCF7C5' : '#F1F1F1', borderRadius: 10 }}>
      {message.text ? <Text>{message.text}</Text> : null}
      {message.attachments?.map((a) => (
        a.fileType === 'IMAGE' ? <Image key={a.fileUrl} source={{ uri: a.fileUrl }} style={{ width: 200, height: 120, marginTop: 6 }} /> :
        <Text key={a.fileUrl} style={{ marginTop: 6, textDecorationLine: 'underline' }}>{a.fileName}</Text>
      ))}
      <Text style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{new Date(message.createdAt).toLocaleString()}</Text>
    </View>
  );
}
