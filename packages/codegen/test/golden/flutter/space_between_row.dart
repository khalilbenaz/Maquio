import 'package:flutter/material.dart';

import '../theme.dart';

class SpaceBetweenRow extends StatelessWidget {
  const SpaceBetweenRow({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 239,
      height: 50,
      clipBehavior: Clip.hardEdge,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Container(
            width: 50,
            height: 50,
            decoration: BoxDecoration(color: const Color(0xFF000000)),
          ),
          Container(
            width: 50,
            height: 50,
            decoration: BoxDecoration(color: const Color(0xFF000000)),
          ),
        ],
      ),
    );
  }
}
