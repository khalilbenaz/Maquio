import 'package:flutter/material.dart';

import 'theme.dart';
import 'screens/connexion.dart';
import 'screens/accueil.dart';

void main() {
  runApp(const DemoApp());
}

class DemoApp extends StatelessWidget {
  const DemoApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'demo',
      theme: appTheme,
      initialRoute: '/connexion',
      routes: {
        '/connexion': (context) => const Connexion(),
        '/accueil': (context) => const Accueil(),
      },
    );
  }
}
