import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';

export function LoginScreen() {
  return (
    <View style={styles.frameLoginScreen}>
      <Text style={styles.textTitle}>{'Bienvenue'}</Text>
      <View style={styles.rectEmail} />
      <View style={styles.rectPassword} />
      <View style={styles.frameButton}>
        <Text style={styles.textCta}>{'Se connecter'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frameLoginScreen: {
    width: 393,
    height: 852,
    backgroundColor: theme.colors.white,
    overflow: 'hidden',
    flexDirection: 'column',
    gap: 16,
    padding: 24,
    justifyContent: 'flex-start',
    alignItems: 'stretch',
  },
  textTitle: {
    fontFamily: 'Inter',
    fontSize: 28,
    fontWeight: '600',
    lineHeight: 34,
    color: theme.colors.black,
    textAlign: 'left',
  },
  rectEmail: {
    width: 345,
    height: 48,
    backgroundColor: '#f2f2f5ff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d9d9deff',
  },
  rectPassword: {
    width: 345,
    height: 48,
    backgroundColor: '#f2f2f5ff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d9d9deff',
  },
  frameButton: {
    width: 345,
    height: 48,
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    overflow: 'hidden',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  textCta: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 20,
    color: theme.colors.white,
    textAlign: 'center',
  },
});
