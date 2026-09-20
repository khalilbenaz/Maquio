// Theme genere depuis les tokens Calque design system.
const colors = {
  primary: '#3366e6ff',
  white: '#ffffffff',
  black: '#000000ff',
};

const spacing = {
  sm: 8,
  md: 16,
  lg: 24,
};

const typography = {
  title: {
    fontFamily: 'Inter',
    fontSize: 28,
    fontWeight: '600',
    lineHeight: 34,
    color: colors.black,
  },
};

export const theme = { colors, spacing, typography };

export type Theme = typeof theme;
