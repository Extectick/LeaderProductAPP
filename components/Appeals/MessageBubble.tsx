import { Text, Image, StyleSheet } from 'react-native';
import { AppealMessage } from '@/types/appealsTypes';
import { MotiView } from 'moti';

export default function MessageBubble({ message, own }: { message: AppealMessage; own: boolean }) {
  return (
    <MotiView
      from={{ opacity: 0, translateY: 10 }}
      animate={{ opacity: 1, translateY: 0 }}
      style={[styles.bubble, own ? styles.own : styles.other]}
    >
      {message.text ? <Text style={styles.text}>{message.text}</Text> : null}
      {message.attachments?.map((a) => (
        a.fileType === 'IMAGE' ? (
          <Image key={a.fileUrl} source={{ uri: a.fileUrl }} style={styles.image} />
        ) : (
          <Text key={a.fileUrl} style={styles.file}>
            {a.fileName}
          </Text>
        )
      ))}
      <Text style={styles.time}>{new Date(message.createdAt).toLocaleString()}</Text>
    </MotiView>
  );
}

const styles = StyleSheet.create({
  bubble: {
    alignSelf: 'flex-start',
    maxWidth: '85%',
    padding: 10,
    marginHorizontal: 8,
    marginVertical: 4,
    borderRadius: 10,
  },
  own: { alignSelf: 'flex-end', backgroundColor: '#DCF7C5' },
  other: { backgroundColor: '#F1F1F1' },
  text: { color: '#111827' },
  image: { width: 200, height: 120, marginTop: 6, borderRadius: 8 },
  file: { marginTop: 6, textDecorationLine: 'underline', color: '#2563EB' },
  time: { fontSize: 12, color: '#666', marginTop: 4 },
});
