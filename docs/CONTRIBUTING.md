# Contributing Guide

Vielen Dank für dein Interesse, zu DBS-Exchange beizutragen! 🎉

## Code of Conduct

- Sei respektvoll und konstruktiv
- Helfe anderen, wenn du kannst
- Akzeptiere konstruktives Feedback

## Wie man beiträgt

### 1. Fork & Clone

```bash
# Fork das Repository auf GitHub
# Dann klone deinen Fork
git clone https://github.com/YOUR_USERNAME/DBS-Exchange.git
cd DBS-Exchange
```

### 2. Setup Development Environment

```bash
# Installiere Dependencies
pnpm install

# Erstelle .env-Dateien
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

### 3. Branch erstellen

```bash
# Erstelle einen neuen Branch für deine Änderungen
git checkout -b feature/your-feature-name

# Oder für Bugfixes:
git checkout -b fix/your-bugfix-name
```

### 4. Änderungen vornehmen

- Schreibe sauberen, lesbaren Code
- Folge den Code-Style-Richtlinien (siehe unten)
- Füge Tests hinzu, wenn möglich
- Aktualisiere Dokumentation, wenn nötig

### 5. Commits

```bash
# Committe deine Änderungen
git add .
git commit -m "feat: add new feature"

# Commit-Message-Format:
# - feat: neue Funktion
# - fix: Bugfix
# - docs: Dokumentation
# - style: Code-Formatierung
# - refactor: Code-Refactoring
# - test: Tests
# - chore: Maintenance
```

### 6. Push & Pull Request

```bash
# Push zu deinem Fork
git push origin feature/your-feature-name

# Erstelle einen Pull Request auf GitHub
```

## Code-Style

### TypeScript/JavaScript

- **ESLint**: Wir nutzen ESLint für Linting
- **Prettier**: Wir nutzen Prettier für Formatierung
- **TypeScript**: Nutze TypeScript für Type-Safety

```bash
# Linting
pnpm lint

# Formatting
pnpm format

# Type-Checking
pnpm typecheck
```

### Solidity

- **Solhint**: Wir nutzen Solhint für Solidity-Linting
- **Style**: Folge den [Solidity Style Guide](https://docs.soliditylang.org/en/latest/style-guide.html)

```bash
# Solidity Linting
pnpm --filter @dbs/contracts lint
```

### Code-Formatierung

- **Indentation**: 2 Spaces
- **Line Length**: Max 100 Zeichen
- **Quotes**: Single Quotes für JS/TS, Double Quotes für Solidity
- **Semicolons**: Immer verwenden

## Testing

### Contract Tests

```bash
# Hardhat Tests
pnpm --filter @dbs/contracts test
```

### Backend Tests

```bash
# API Tests (wenn vorhanden)
pnpm --filter @dbs/api test
```

### Frontend Tests

```bash
# Frontend Tests (wenn vorhanden)
pnpm --filter @dbs/web test
```

## Pull Request Process

### PR-Template

Wenn du einen PR erstellst, nutze folgendes Template:

```markdown
## Beschreibung
Kurze Beschreibung der Änderungen

## Änderungen
- [ ] Feature X hinzugefügt
- [ ] Bug Y gefixt
- [ ] Dokumentation aktualisiert

## Testing
- [ ] Tests hinzugefügt/aktualisiert
- [ ] Manuell getestet

## Checklist
- [ ] Code folgt Style-Richtlinien
- [ ] Self-Review durchgeführt
- [ ] Kommentare hinzugefügt, wo nötig
- [ ] Dokumentation aktualisiert
- [ ] Keine neuen Warnings
- [ ] Tests hinzugefügt und bestanden
```

### Review-Prozess

1. **Automated Checks**: CI/CD-Pipeline läuft automatisch
2. **Code Review**: Mindestens ein Reviewer muss zustimmen
3. **Tests**: Alle Tests müssen bestehen
4. **Merge**: Nach Approval wird der PR gemerged

## Projektstruktur

### Apps

- **`apps/web`**: React Frontend
- **`apps/api`**: Fastify Backend

### Packages

- **`packages/contracts`**: Solidity Smart Contracts
- **`packages/shared`**: Gemeinsame TypeScript-Types

### Dokumentation

- **`docs/`**: Vollständige Dokumentation
- **`README.md`**: Haupt-README

## Häufige Aufgaben

### Neue Feature hinzufügen

1. Erstelle einen neuen Branch
2. Implementiere die Feature
3. Füge Tests hinzu
4. Aktualisiere Dokumentation
5. Erstelle PR

### Bugfix

1. Erstelle einen neuen Branch (`fix/bug-name`)
2. Reproduziere den Bug
3. Fixe den Bug
4. Füge Tests hinzu, um Regression zu verhindern
5. Erstelle PR

### Dokumentation verbessern

1. Erstelle einen neuen Branch (`docs/topic`)
2. Verbessere die Dokumentation
3. Erstelle PR

## Fragen?

- **GitHub Issues**: Für Bugs und Feature-Requests
- **GitHub Discussions**: Für Fragen und Diskussionen
- **Pull Requests**: Für Code-Reviews

## Danksagung

Vielen Dank für deinen Beitrag! 🙏

