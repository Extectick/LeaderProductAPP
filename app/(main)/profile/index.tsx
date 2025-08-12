import { AnimatedButton } from '@/components/AnimatedButton';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Colors } from '@/constants/Colors';
import { Profile, ProfileType } from '@/types/userTypes';
import { logoutUser } from '@/utils/authService';
import { getProfile } from '@/utils/userService';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Platform, StyleSheet } from 'react-native';

const getProfileTypeName = (type?: ProfileType | null) => {
  switch (type) {
    case 'EMPLOYEE':
      return 'Сотрудник';
    case 'CLIENT':
      return 'Клиент';
    case 'SUPPLIER':
      return 'Поставщик';
    default:
      return 'Неизвестный тип';
  }
};

export default function ProfileScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const data = await getProfile();
        setProfile(data);
      } catch (error) {
        console.error('Profile load error:', error);
      } finally {
        setLoading(false);
      }
    };
    loadProfile();
  }, []);

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator size="large" color={Colors.leaderprod.tint} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.avatarContainer}>
        {profile?.avatarUrl ? (
          <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
        ) : (
          <ThemedView style={styles.avatarPlaceholder}>
            <ThemedText type="title" style={styles.avatarInitials}>
              {profile?.firstName?.[0]}{profile?.lastName?.[0]}
            </ThemedText>
          </ThemedView>
        )}
      </ThemedView>

      <ThemedText type="title" style={styles.name}>
        {profile?.firstName} {profile?.lastName}
      </ThemedText>

      <ThemedText type="subtitle" style={styles.profileType}>
        {getProfileTypeName(profile?.currentProfileType)}
      </ThemedText>

      <ThemedView style={styles.details}>
        <ThemedView style={styles.detailRow}>
          <ThemedText style={styles.detailLabel}>Email:</ThemedText>
          <ThemedText style={styles.detailValue}>{profile?.email}</ThemedText>
        </ThemedView>

        {profile?.phone && (
          <ThemedView style={styles.detailRow}>
            <ThemedText style={styles.detailLabel}>Телефон:</ThemedText>
            <ThemedText style={styles.detailValue}>{profile.phone}</ThemedText>
          </ThemedView>
        )}

        {profile && profile.departmentRoles && profile.departmentRoles.length > 0 && (
          <ThemedView style={styles.detailRow}>
            <ThemedText style={styles.detailLabel}>Отделы:</ThemedText>
            <ThemedText style={styles.detailValue}>
              {profile.departmentRoles.map(d => d.department?.name).filter(Boolean).join(', ')}
            </ThemedText>
          </ThemedView>
        )}

        {profile?.employeeProfile?.department?.name && (
          <ThemedView style={styles.detailRow}>
            <ThemedText style={styles.detailLabel}>Основной отдел:</ThemedText>
            <ThemedText style={styles.detailValue}>
              {profile.employeeProfile.department.name}
            </ThemedText>
          </ThemedView>
        )}
      </ThemedView>

      <AnimatedButton
        title="Выход"
        onPress={logoutUser}
        style={styles.logoutButton}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  container: {
    flex: 1,
    padding: 20,
    gap: 20,
    maxWidth: Platform.select({ web: 800, default: undefined }),
    alignSelf: Platform.select({ web: 'center', default: undefined }),
    width: Platform.select({ web: '100%', default: undefined })
  },
  avatarContainer: {
    alignItems: 'center',
    marginBottom: 20
  },
  avatar: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 4,
    borderColor: Colors.leaderprod.tint,
    backgroundColor: Colors.leaderprod.inputBackground,
    shadowColor: Colors.leaderprod.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8
  },
  avatarPlaceholder: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: Colors.leaderprod.tint,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: Colors.leaderprod.tint
  },
  avatarInitials: {
    color: 'white',
    fontSize: 48,
    fontWeight: 'bold'
  },
  profileType: {
    textAlign: 'center',
    color: Colors.leaderprod.secondaryText,
    marginBottom: 10
  },
  name: {
    textAlign: 'center',
    fontSize: 24
  },
  details: {
    gap: 10,
    padding: 20,
    backgroundColor: Colors.leaderprod.cardBackground,
    borderRadius: 10,
    shadowColor: Colors.leaderprod.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    minWidth: Platform.select({ web: 400, default: undefined }),
    overflow: 'visible'
  },
  detailRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    paddingVertical: 8
  },
  detailLabel: {
    fontWeight: '600',
    color: Colors.leaderprod.text
  },
  detailValue: {
    color: Colors.leaderprod.secondaryText
  },
  logoutButton: {
    marginTop: 20,
    backgroundColor: Colors.leaderprod.button,
    padding: 15,
    borderRadius: 8,
    alignSelf: 'center'
  }
});
