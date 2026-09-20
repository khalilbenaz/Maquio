// Fixture partagee : un ecran de connexion minimal, utilise a la fois par
// les tests de generateurs (ce package) et, plus tard, par les tests de
// l'application de bureau (Tache 17) via l'export
// "@calque/codegen/test/fixtures/login-screen" (decision 1 du brief), pour
// eviter que deux verites divergent.
//
// Les identifiants sont fixes et lisibles (pas de crypto.randomUUID) : un
// fichier temoin ne peut pas etre stable sinon.
import type { CalqueDocument, Page } from '@calque/core'
import { DEVICE_PRESETS, DOCUMENT_VERSION } from '@calque/core'

const white = { r: 1, g: 1, b: 1, a: 1 }
const black = { r: 0, g: 0, b: 0, a: 1 }
const primary = { r: 0.2, g: 0.4, b: 0.9, a: 1 }
const fieldBackground = { r: 0.95, g: 0.95, b: 0.96, a: 1 }
const fieldBorder = { r: 0.85, g: 0.85, b: 0.87, a: 1 }

const loginScreenPage: Page = {
  id: 'page-login',
  name: 'LoginScreen',
  device: { ...DEVICE_PRESETS.iphone15 },
  nodes: [
    {
      id: 'frame-login-screen',
      name: 'LoginScreen',
      type: 'frame',
      frame: { x: 0, y: 0, w: 393, h: 852 },
      visible: true,
      locked: false,
      opacity: 1,
      rotation: 0,
      layout: {
        mode: 'column',
        gap: 16,
        padding: { top: 24, right: 24, bottom: 24, left: 24 },
        alignMain: 'start',
        alignCross: 'stretch',
      },
      fills: [{ type: 'solid', color: white }],
      strokes: [],
      cornerRadius: 0,
      clipsContent: true,
      children: [
        {
          id: 'text-title',
          name: 'Title',
          type: 'text',
          frame: { x: 0, y: 0, w: 345, h: 36 },
          visible: true,
          locked: false,
          opacity: 1,
          rotation: 0,
          characters: 'Bienvenue',
          style: {
            fontFamily: 'Inter',
            fontSize: 28,
            fontWeight: 600,
            lineHeight: 34,
            letterSpacing: 0,
            color: black,
            align: 'left',
          },
        },
        {
          id: 'rect-email',
          name: 'EmailField',
          type: 'rect',
          frame: { x: 0, y: 0, w: 345, h: 48 },
          visible: true,
          locked: false,
          opacity: 1,
          rotation: 0,
          fills: [{ type: 'solid', color: fieldBackground }],
          strokes: [{ color: fieldBorder, width: 1 }],
          cornerRadius: 12,
        },
        {
          id: 'rect-password',
          name: 'PasswordField',
          type: 'rect',
          frame: { x: 0, y: 0, w: 345, h: 48 },
          visible: true,
          locked: false,
          opacity: 1,
          rotation: 0,
          fills: [{ type: 'solid', color: fieldBackground }],
          strokes: [{ color: fieldBorder, width: 1 }],
          cornerRadius: 12,
        },
        {
          id: 'frame-button',
          name: 'Button',
          type: 'frame',
          frame: { x: 0, y: 0, w: 345, h: 48 },
          visible: true,
          locked: false,
          opacity: 1,
          rotation: 0,
          layout: {
            mode: 'row',
            gap: 0,
            padding: { top: 0, right: 0, bottom: 0, left: 0 },
            alignMain: 'center',
            alignCross: 'center',
          },
          fills: [{ type: 'solid', color: primary }],
          strokes: [],
          cornerRadius: 12,
          clipsContent: true,
          children: [
            {
              id: 'text-cta',
              name: 'Cta',
              type: 'text',
              frame: { x: 0, y: 0, w: 120, h: 20 },
              visible: true,
              locked: false,
              opacity: 1,
              rotation: 0,
              characters: 'Se connecter',
              style: {
                fontFamily: 'Inter',
                fontSize: 16,
                fontWeight: 600,
                lineHeight: 20,
                letterSpacing: 0,
                color: white,
                align: 'center',
              },
            },
          ],
        },
      ],
    },
  ],
}

export const loginScreenDocument: CalqueDocument = {
  version: DOCUMENT_VERSION,
  id: 'doc-login-screen',
  name: 'LoginScreen',
  pages: [loginScreenPage],
  tokens: {
    colors: {
      primary,
      white,
      black,
    },
    // Correspond exactement au style du titre "Bienvenue" : demontre que
    // theme.dart peut, comme pour les couleurs, exposer un style de texte
    // du design system utilise par un noeud.
    typography: {
      title: {
        fontFamily: 'Inter',
        fontSize: 28,
        fontWeight: 600,
        lineHeight: 34,
        letterSpacing: 0,
        color: black,
        align: 'left',
      },
    },
    spacing: {
      sm: 8,
      md: 16,
      lg: 24,
    },
  },
}
