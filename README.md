# Cursor Vision

Ein FoundryVTT-Modul für V14, das einen Taschenlampen-Effekt für Spieler erzeugt.  
Ideal für Erkundungsszenen, Karten oder atmosphärische Bereiche **ohne Token**.

## Funktionsweise

Spieler sehen nur einen kleinen Bereich um ihren Cursor – wie mit einer Taschenlampe über einen dunklen Raum zu leuchten. Der GM sieht immer die komplette Szene.

## Einstellungen

| Einstellung | Beschreibung | Standard |
|---|---|---|
| **Cursor Vision aktiv** | Effekt global ein/ausschalten | Aus |
| **Sichtradius (px)** | Größe des sichtbaren Bereichs | 150 px |
| **Weiche Kante** | Sanfter Übergang statt hartem Schnitt | An |
| **Dunkelheit** | Wie dunkel der Rest der Szene ist (0–1) | 1.0 |

## Installation

**Über Manifest-URL in Foundry:**
```
https://raw.githubusercontent.com/laulauthelowest/cursor-vision/main/module.json
```

1. Foundry öffnen → **Add-on-Module** → **Modul installieren**
2. Manifest-URL einfügen → **Installieren**

## Kompatibilität

- FoundryVTT **V14+**
- Kein System-spezifisch – funktioniert mit allen Systemen

## CI Status

![CI](https://github.com/laulauthelowest/cursor-vision/actions/workflows/ci.yml/badge.svg)
