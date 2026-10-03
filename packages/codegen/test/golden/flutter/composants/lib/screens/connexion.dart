// ignore_for_file: prefer_const_constructors, prefer_const_literals_to_create_immutables

import 'package:flutter/material.dart';

class Connexion extends StatelessWidget {
  const Connexion({super.key});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return Scaffold(
      backgroundColor: const Color(0xFFFFFFFF),
      appBar: AppBar(
        title: Text('Connexion'),
        automaticallyImplyLeading: false,
        actions: [IconButton(icon: Icon(Icons.search), onPressed: () {})],
        centerTitle: true,
      ),
      body: Stack(
        children: [
          Positioned(
            left: 16,
            top: 64,
            width: 361,
            height: 56,
            child: Align(
              alignment: Alignment.topCenter,
              child: TextField(
                decoration: InputDecoration(
                  border: OutlineInputBorder(),
                  labelText: 'E-mail',
                  hintText: 'nom@exemple.fr',
                  prefixIcon: Icon(Icons.email),
                ),
              ),
            ),
          ),
          Positioned(
            left: 16,
            top: 144,
            width: 361,
            height: 56,
            child: Align(
              alignment: Alignment.topCenter,
              child: TextField(
                obscureText: true,
                decoration: InputDecoration(
                  border: OutlineInputBorder(),
                  labelText: 'Mot de passe',
                  prefixIcon: Icon(Icons.lock),
                ),
              ),
            ),
          ),
          Positioned(
            left: 16,
            top: 224,
            width: 361,
            height: 48,
            child: Row(
              children: [
                Expanded(child: Text('Se souvenir de moi')),
                Switch(value: true, onChanged: (_) {}),
              ],
            ),
          ),
          Positioned(
            left: 16,
            top: 284,
            width: 361,
            height: 48,
            child: ElevatedButton(
              onPressed: () => Navigator.of(context).pushNamed('/accueil'),
              style: ElevatedButton.styleFrom(
                backgroundColor: scheme.primary,
                foregroundColor: scheme.onPrimary,
              ),
              child: Text('Se connecter'),
            ),
          ),
          Positioned(
            left: 16,
            top: 344,
            width: 361,
            height: 44,
            child: TextButton(
              onPressed: () {},
              child: Text('Mot de passe oublié'),
            ),
          ),
        ],
      ),
    );
  }
}
