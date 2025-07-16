// @ts-ignore
import { Picker } from '@react-native-picker/picker';
import { StyleSheet, View } from 'react-native';
import { ThemedText } from './ThemedText';

interface Department {
  id: number;
  name: string;
}

interface DepartmentPickerProps {
  departments: Department[];
  selectedDepartmentId: number | null;
  onSelect: (id: number) => void;
}

export default function DepartmentPicker({
  departments,
  selectedDepartmentId,
  onSelect,
}: DepartmentPickerProps) {
  return (
    <View style={styles.container}>
      <ThemedText style={styles.label}>Отдел</ThemedText>
      <Picker
        selectedValue={selectedDepartmentId}
        onValueChange={(itemValue: number | null) => {
          if (itemValue !== null) {
            onSelect(itemValue);
          }
        }}
        style={styles.picker}
        dropdownIconColor="#666"
      >
        <Picker.Item label="Выберите отдел" value={null} />
        {departments.map((dept) => (
          <Picker.Item 
            key={dept.id} 
            label={dept.name} 
            value={dept.id} 
          />
        ))}
      </Picker>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 15,
    width: '100%',
  },
  label: {
    fontSize: 14,
    marginBottom: 5,
    fontWeight: '600',
  },
  picker: {
    height: 50,
    width: '100%',
    backgroundColor: '#f5f5f5',
    borderRadius: 5,
  },
});
