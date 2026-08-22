# Proceso de releases

Cómo publicar una versión nueva de `ds-wifi`. Sigue **SemVer** (`MAYOR.MENOR.PARCHE`): proyecto en `0.x` → cada versión con funcionalidades nuevas sube el **menor** (`0.1.0`, `0.2.0`…), los arreglos suben el **parche** (`0.1.1`).

## Flujo de ramas

- **`master`** — código listo para producción. Solo recibe merges de `release/*`.
- **`develop`** — integración de desarrollo.
- **`feature/*`** — una rama por funcionalidad o arreglo.
- **`release/*`** — preparación de una versión.

```
develop ──► feature/x ──► (PR/merge) ──► develop
develop ──► release/0.2.0 ──► master ──► tag v0.2.0 + GitHub Release
```

## Pasos para publicar

### 1. Desarrollo (feature)

```bash
git checkout develop
git pull
git checkout -b feature/nombre-de-la-cosa
# … trabajo …
git add -A
git commit -m "feat: descripción"   # conventional commits
git push -u origin feature/nombre-de-la-cosa
```

Abrir un PR de `feature/*` → `develop` (o merge local: `git checkout develop && git merge feature/nombre`). Borrar la feature.

### 2. Preparar la release

```bash
git checkout develop
git pull
git checkout -b release/0.2.0
```

En la rama `release/*`:

1. **Versión**: actualiza `version` en `package.json`.
2. **CHANGELOG**: mueve lo de `[Unreleased]` a una entrada `[0.2.0]` con fecha, usando las categorías `Added / Changed / Fixed / Removed`.
3. **README**: si el badge de versión apunta a una versión concreta, actualízalo.
4. Commit: `chore: preparar release 0.2.0`.

### 3. Publicar en master

```bash
git checkout master
git pull
git merge release/0.2.0
git push origin master
```

Al llegar a `master`, el **GitHub Action** (`.github/workflows/release.yml`) hace el resto automáticamente:

1. Lee la versión de `package.json`.
2. Si no existe el tag `v0.2.0`, lo crea.
3. Publica un **GitHub Release** con las notas del CHANGELOG.

Después:

```bash
git checkout develop
git merge master            # sincronizar develop con el tag/versionado
git push origin develop
git branch -d release/0.2.0
```

### 4. Volver a develop

El entorno local debe quedar en `develop`:

```bash
git checkout develop
```

## Qué es manual y qué es automático

| Paso | ¿Quién? |
|---|---|
| Crear feature, codear, commit | Manual |
| Merge feature → develop | Manual (PR o local) |
| Crear release, bump de versión, CHANGELOG | Manual |
| Merge release → master | Manual |
| Tag + GitHub Release | **Automático** (Action al pushear a `master`) |

## Notas

- Nunca uses `git push --force` ni reescribas historia.
- El tag lo crea la Action; no lo crees a mano (si ya existe, la Action lo saltea).
- El scraper de Wiimmfi depende de superar Cloudflare; si cambias algo de eso, documentalo en el CHANGELOG.
