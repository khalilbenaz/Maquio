import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Accueil'>;

export function Accueil({ navigation }: Props) {
  return (
    <View style={styles.screen}>
      <View style={styles.n9}>
        <Pressable style={styles.n9Slot} onPress={() => navigation.goBack()}>
          <MaterialIcons name='arrow-back' size={24} color={'#1d1b20'} />
        </Pressable>
        <Text style={styles.n9Title}>{'Messages'}</Text>
        <Pressable style={styles.n9Slot}>
          <MaterialIcons name='search' size={24} color={'#1d1b20'} />
        </Pressable>
      </View>
      <View style={styles.body}>
        <ScrollView style={styles.n10} contentContainerStyle={styles.n10Content}>
          <Pressable style={styles.n11}>
            <MaterialIcons name='person' size={24} color={'#49454f'} />
            <View style={styles.n11Body}>
              <Text style={styles.n11Title}>{'Alice'}</Text>
              <Text style={styles.n11Subtitle}>{'Bonjour !'}</Text>
            </View>
            <MaterialIcons name='chevron-right' size={24} color={'#49454f'} />
          </Pressable>
          <Pressable style={styles.n12}>
            <MaterialIcons name='person' size={24} color={'#49454f'} />
            <View style={styles.n12Body}>
              <Text style={styles.n12Title}>{'Bruno'}</Text>
              <Text style={styles.n12Subtitle}>{'À demain'}</Text>
            </View>
            <MaterialIcons name='chevron-right' size={24} color={'#49454f'} />
          </Pressable>
        </ScrollView>
      </View>
      <View style={styles.n14}>
        <Pressable style={styles.n14Cell} onPress={() => navigation.navigate('Accueil')}>
          <MaterialIcons name='home' size={24} color={'#1d1b20'} />
          <Text style={[styles.n14Label, styles.n14Activelabel]}>{'Accueil'}</Text>
        </Pressable>
        <Pressable style={styles.n14Cell} onPress={() => navigation.navigate('Connexion')}>
          <MaterialIcons name='person' size={24} color={'#49454f'} />
          <Text style={styles.n14Label}>{'Connexion'}</Text>
        </Pressable>
      </View>
      <Pressable style={styles.n13}>
        <MaterialIcons name='add' size={24} color={'#21005d'} />
      </Pressable>
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
  n9: {
    width: 393,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    backgroundColor: '#fef7ff',
  },
  n9Title: {
    flex: 1,
    color: '#1d1b20',
    fontSize: 22,
    textAlign: 'left',
    marginLeft: 0,
  },
  n9Slot: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  n10: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 393,
    height: 216,
    overflow: 'hidden',
  },
  n10Content: {
    flexDirection: 'column',
    justifyContent: 'flex-start',
    alignItems: 'stretch',
  },
  n11: {
    width: 393,
    height: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 16,
  },
  n11Body: {
    flex: 1,
  },
  n11Title: {
    color: '#1d1b20',
    fontSize: 16,
  },
  n11Subtitle: {
    color: '#49454f',
    fontSize: 14,
  },
  n12: {
    width: 393,
    height: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 16,
  },
  n12Body: {
    flex: 1,
  },
  n12Title: {
    color: '#1d1b20',
    fontSize: 16,
  },
  n12Subtitle: {
    color: '#49454f',
    fontSize: 14,
  },
  n14: {
    width: 393,
    height: 80,
    flexDirection: 'row',
    backgroundColor: '#f3edf7',
  },
  n14Cell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  n14Active: {
  },
  n14Label: {
    color: '#49454f',
    fontSize: 12,
    fontWeight: '500',
  },
  n14Activelabel: {
    color: '#1d1b20',
    fontWeight: '700',
  },
  n13: {
    position: 'absolute',
    left: 321,
    top: 690,
    width: 56,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderRadius: 16,
    backgroundColor: '#eaddff',
    elevation: 6,
  },
  n13Label: {
    color: '#21005d',
    fontSize: 14,
    fontWeight: '500',
  },
});
