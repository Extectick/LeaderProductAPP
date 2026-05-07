import React from 'react';
import { View } from 'react-native';
import TransportTasksToolbar from '../screen/TransportTasksToolbar';
import { mobileSheetStyles as styles } from './styles';

type Props = React.ComponentProps<typeof TransportTasksToolbar>;

export default function TransportTasksMobileSheetToolbar(props: Props) {
  return (
    <View style={styles.toolbarWrap}>
      <TransportTasksToolbar {...props} />
    </View>
  );
}
