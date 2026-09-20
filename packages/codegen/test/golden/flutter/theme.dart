import 'package:flutter/material.dart';

/// Couleurs du design system, generees depuis les tokens Calque.
class AppColors {
  AppColors._();

  static const Color primary = Color(0xFF3366E6);
  static const Color white = Color(0xFFFFFFFF);
  static const Color black = Color(0xFF000000);
}

/// Espacements du design system, generes depuis les tokens Calque.
class AppSpacing {
  AppSpacing._();

  static const double sm = 8;
  static const double md = 16;
  static const double lg = 24;
}

/// Styles de texte du design system, generes depuis les tokens Calque.
class AppTextStyles {
  AppTextStyles._();

  static const TextStyle title = TextStyle(
    fontFamily: 'Inter',
    fontSize: 28,
    fontWeight: FontWeight.w600,
    height: 1.2143,
    color: AppColors.black,
  );
}

final ThemeData appTheme = ThemeData(
  useMaterial3: true,
  colorScheme: ColorScheme.fromSeed(seedColor: AppColors.primary),
);
