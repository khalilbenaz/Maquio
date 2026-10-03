// Dependances : react-native, @react-navigation/native,
// @react-navigation/native-stack, react-native-screens,
// react-native-safe-area-context, react-native-vector-icons,
// @react-native-community/slider, @react-native-picker/picker,
// @react-native-community/datetimepicker.
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from './src/navigation';
import { Connexion } from './src/screens/Connexion';
import { Accueil } from './src/screens/Accueil';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName='Connexion' screenOptions={{ headerShown: false }}>
        <Stack.Screen name='Connexion' component={Connexion} />
        <Stack.Screen name='Accueil' component={Accueil} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
