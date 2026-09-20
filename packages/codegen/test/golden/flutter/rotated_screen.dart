import 'package:flutter/material.dart';

import '../theme.dart';

class RotatedScreen extends StatelessWidget {
  const RotatedScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Transform.rotate(
      angle: 1.5708,
      child: Container(
        width: 100,
        height: 40,
        decoration: BoxDecoration(color: const Color(0xFF000000)),
      ),
    );
  }
}
