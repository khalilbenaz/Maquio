import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Connexion'>;

export function Connexion({ navigation }: Props) {
  return (
    <View style={styles.screen}>
      <View style={styles.n2}>
        <Text style={styles.n2Title}>{'Connexion'}</Text>
        <Pressable style={styles.n2Slot}>
          <MaterialIcons name='search' size={24} color={'#1d1b20'} />
        </Pressable>
      </View>
      <View style={styles.body}>
        <View style={styles.n3}>
          <Text style={styles.n3Label}>{'E-mail'}</Text>
          <TextInput style={styles.n3Input} placeholder='nom@exemple.fr' />
        </View>
        <View style={styles.n4}>
          <Text style={styles.n4Label}>{'Mot de passe'}</Text>
          <TextInput style={styles.n4Input} secureTextEntry />
        </View>
        <View style={styles.n5}>
          <Text style={styles.n5Label}>{'Se souvenir de moi'}</Text>
          <Switch value={true} trackColor={{ true: '#6750a4' }} />
        </View>
        <Pressable style={styles.n6} onPress={() => navigation.navigate('Accueil')}>
          <Text style={styles.n6Label}>{'Se connecter'}</Text>
        </Pressable>
        <Pressable style={styles.n7}>
          <Text style={styles.n7Label}>{'Mot de passe oublié'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#ffffffff',
  },
  body: {
    flex: 1,
  },
  n2: {
    width: 393,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    backgroundColor: '#fef7ff',
  },
  n2Title: {
    flex: 1,
    color: '#1d1b20',
    fontSize: 22,
    textAlign: 'center',
    marginLeft: 12,
  },
  n2Slot: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  n3: {
    position: 'absolute',
    left: 16,
    top: 64,
    width: 361,
  },
  n3Label: {
    color: '#49454f',
    fontSize: 12,
    marginBottom: 4,
  },
  n3Input: {
    borderWidth: 1,
    borderColor: '#79747e',
    borderRadius: 4,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#1d1b20',
    height: 56,
  },
  n3Note: {
    color: '#49454f',
    fontSize: 12,
    marginTop: 4,
    paddingHorizontal: 16,
  },
  n4: {
    position: 'absolute',
    left: 16,
    top: 144,
    width: 361,
  },
  n4Label: {
    color: '#49454f',
    fontSize: 12,
    marginBottom: 4,
  },
  n4Input: {
    borderWidth: 1,
    borderColor: '#79747e',
    borderRadius: 4,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#1d1b20',
    height: 56,
  },
  n4Note: {
    color: '#49454f',
    fontSize: 12,
    marginTop: 4,
    paddingHorizontal: 16,
  },
  n5: {
    position: 'absolute',
    left: 16,
    top: 224,
    width: 361,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  n5Label: {
    color: '#1d1b20',
    fontSize: 14,
  },
  n6: {
    position: 'absolute',
    left: 16,
    top: 284,
    width: 361,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 24,
    backgroundColor: '#6750a4',
  },
  n6Label: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  n7: {
    position: 'absolute',
    left: 16,
    top: 344,
    width: 361,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 22,
  },
  n7Label: {
    color: '#6750a4',
    fontSize: 14,
    fontWeight: '500',
  },
});
