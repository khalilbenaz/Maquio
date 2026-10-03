// ignore_for_file: prefer_const_constructors, prefer_const_literals_to_create_immutables

import 'package:flutter/material.dart';

class Accueil extends StatelessWidget {
  const Accueil({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFFFFFFF),
      appBar: AppBar(
        title: Text('Messages'),
        leading: IconButton(
          icon: Icon(Icons.arrow_back),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        actions: [IconButton(icon: Icon(Icons.search), onPressed: () {})],
        centerTitle: false,
      ),
      body: Stack(
        children: [
          Positioned(
            left: 0,
            top: 0,
            width: 393,
            height: 216,
            child: Container(
              width: 393,
              height: 216,
              decoration: const BoxDecoration(),
              clipBehavior: Clip.hardEdge,
              child: ListView(
                children: [
                  SizedBox(
                    width: 393,
                    height: 72,
                    child: ListTile(
                      leading: Icon(Icons.person),
                      title: Text('Alice'),
                      subtitle: Text('Bonjour !'),
                      trailing: Icon(Icons.chevron_right),
                    ),
                  ),
                  SizedBox(
                    width: 393,
                    height: 72,
                    child: ListTile(
                      leading: Icon(Icons.person),
                      title: Text('Bruno'),
                      subtitle: Text('À demain'),
                      trailing: Icon(Icons.chevron_right),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
      bottomNavigationBar: BottomNavigationBar(
        type: BottomNavigationBarType.fixed,
        currentIndex: 0,
        onTap: (index) {
          const routes = <String?>['/accueil', '/connexion'];
          final route = routes[index];
          if (route != null) {
            Navigator.of(context).pushReplacementNamed(route);
          }
        },
        items: [
          BottomNavigationBarItem(icon: Icon(Icons.home), label: 'Accueil'),
          BottomNavigationBarItem(icon: Icon(Icons.person), label: 'Connexion'),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () {},
        child: Icon(Icons.add),
      ),
    );
  }
}
