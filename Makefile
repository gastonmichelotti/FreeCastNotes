# =============================================================================
# Makefile - FreeCastNotes
# =============================================================================
# Stack: Swift (AppKit + WKWebView) + React + TypeScript + Vite
# =============================================================================

.PHONY: help dev dev-front dev-swift build build-debug bundle dmg clean clean-front \
        clean-swift check open install kill release-update release-new \
        sync-hub-start sync-hub-logs sync-hub-stop

C := \033[36m
G := \033[32m
Y := \033[33m
R := \033[31m
N := \033[0m
SYNC_HUB_DIR := sync-hub
SYNC_HUB_RUN_DIR := $(SYNC_HUB_DIR)/.run
SYNC_HUB_PID_FILE := $(SYNC_HUB_RUN_DIR)/sync-hub.pid
SYNC_HUB_LOG_FILE := $(SYNC_HUB_RUN_DIR)/sync-hub.log

.DEFAULT_GOAL := help

help:
	@echo ""
	@echo "$(C)FreeCastNotes - Comandos$(N)"
	@echo ""
	@echo "$(G)Desarrollo:$(N)"
	@echo "  dev           Levanta Vite + Swift app en modo dev"
	@echo "  dev-front     Levanta solo el frontend (Vite en :1420)"
	@echo "  dev-swift     Levanta solo la app Swift (requiere Vite corriendo)"
	@echo ""
	@echo "$(G)Build:$(N)"
	@echo "  build         Build de producción (frontend + Swift release)"
	@echo "  build-debug   Build de debug Swift (más rápido)"
	@echo "  bundle        Genera FreeCastNotes.app en build/"
	@echo "  dmg           Genera FreeCastNotes.dmg para distribución"
	@echo ""
	@echo "$(G)Verificación:$(N)"
	@echo "  check         Type-check del frontend (tsc)"
	@echo ""
	@echo "$(G)Sync Hub (dev local):$(N)"
	@echo "  sync-hub-start   Levanta sync-hub en background y guarda logs"
	@echo "  sync-hub-logs    Muestra logs del sync-hub (tail -f)"
	@echo "  sync-hub-stop    Detiene sync-hub en background"
	@echo ""
	@echo "$(G)Mantenimiento:$(N)"
	@echo "  install       Instala dependencias (npm + Swift packages)"
	@echo "  clean         Limpia todo (front + Swift + build)"
	@echo "  clean-front   Limpia dist/ y node_modules/.vite"
	@echo "  clean-swift   Limpia .build/ de Swift"
	@echo "  kill          Mata procesos de FreeCastNotes y Vite (:1420)"
	@echo "  open          Abre FreeCastNotes.app"
	@echo ""
	@echo "$(G)Release:$(N)"
	@echo "  release-update        Actualiza release actual con nuevo DMG (misma versión)"
	@echo "  release-new VERSION=x.y.z  Crea nuevo release con versión x.y.z"
	@echo ""

# === DESARROLLO ===

dev:
	@echo "$(G)Levantando FreeCastNotes en modo dev...$(N)"
	@echo "$(C)  Vite → http://localhost:1420$(N)"
	@echo "$(C)  Swift app cargará desde Vite$(N)"
	@echo ""
	@npx vite & sleep 2 && cd swift-app && swift run

dev-front:
	@echo "$(G)Levantando solo frontend (Vite)...$(N)"
	@npm run dev

dev-swift:
	@echo "$(G)Levantando solo Swift app...$(N)"
	@echo "$(Y)Asegurate de que Vite esté corriendo (make dev-front)$(N)"
	@cd swift-app && swift run

# === BUILD ===

build:
	@echo "$(G)Build de producción...$(N)"
	@npx tsc --noEmit
	@npx vite build
	@cd swift-app && swift build -c release
	@echo "$(G)Build completado.$(N)"
	@echo "  Frontend: dist/"
	@echo "  Swift:    swift-app/.build/release/FreeCastNotes"

build-debug:
	@echo "$(Y)Build de debug...$(N)"
	@cd swift-app && swift build
	@echo "$(G)Build debug completado.$(N)"
	@echo "  swift-app/.build/debug/FreeCastNotes"

bundle: build
	@echo "$(G)Creando FreeCastNotes.app...$(N)"
	@./src/scripts/bundle-app.sh release

dmg: bundle
	@echo "$(G)Creando FreeCastNotes.dmg...$(N)"
	@./src/scripts/create-dmg.sh

# === VERIFICACIÓN ===

check:
	@echo "$(C)Type-checking frontend...$(N)"
	@npx tsc --noEmit
	@echo "$(G)OK$(N)"

# === SYNC HUB (DEV LOCAL) ===

sync-hub-start:
	@mkdir -p $(SYNC_HUB_RUN_DIR)
	@if [ ! -d "$(SYNC_HUB_DIR)/node_modules" ]; then \
		echo "$(R)sync-hub no tiene dependencias instaladas.$(N)"; \
		echo "$(Y)Ejecutá: cd sync-hub && npm install$(N)"; \
		exit 1; \
	fi
	@if [ -f "$(SYNC_HUB_PID_FILE)" ]; then \
		PID=$$(cat "$(SYNC_HUB_PID_FILE)"); \
		if kill -0 $$PID 2>/dev/null; then \
			echo "$(Y)sync-hub ya está corriendo (PID $$PID).$(N)"; \
			echo "$(C)Logs: $(SYNC_HUB_LOG_FILE)$(N)"; \
			exit 0; \
		else \
			rm -f "$(SYNC_HUB_PID_FILE)"; \
		fi; \
	fi
	@EXISTING_PID=$$(pgrep -f "sync-hub/src/index.js" | head -1); \
	if [ -z "$$EXISTING_PID" ]; then \
		PORT=$$(awk -F= '/^SYNC_PORT=/{print $$2}' $(SYNC_HUB_DIR)/.env 2>/dev/null | tail -1); \
		[ -z "$$PORT" ] && PORT=8787; \
		EXISTING_PID=$$(lsof -ti:$$PORT 2>/dev/null | head -1); \
	fi; \
	if [ -n "$$EXISTING_PID" ]; then \
		echo "$(Y)sync-hub ya está corriendo (PID $$EXISTING_PID) sin PID file.$(N)"; \
		echo $$EXISTING_PID > "$(SYNC_HUB_PID_FILE)"; \
		echo "$(C)Logs: $(SYNC_HUB_LOG_FILE)$(N)"; \
		exit 0; \
	fi
	@echo "$(G)Levantando sync-hub en background...$(N)"
	@(cd $(SYNC_HUB_DIR) && \
		set -a; [ -f .env ] && . ./.env || true; set +a; \
		( nohup npm start > .run/sync-hub.log 2>&1 & echo $$! > .run/sync-hub.pid ))
	@sleep 1
	@PID=$$(cat "$(SYNC_HUB_PID_FILE)"); \
	if kill -0 $$PID 2>/dev/null; then \
		echo "$(G)sync-hub corriendo (PID $$PID).$(N)"; \
		echo "$(C)Logs: $(SYNC_HUB_LOG_FILE)$(N)"; \
	else \
		echo "$(R)sync-hub no pudo iniciar. Revisá logs: $(SYNC_HUB_LOG_FILE)$(N)"; \
		exit 1; \
	fi

sync-hub-logs:
	@mkdir -p $(SYNC_HUB_RUN_DIR)
	@if [ ! -f "$(SYNC_HUB_LOG_FILE)" ]; then \
		echo "$(Y)No hay log todavía. Ejecutá 'make sync-hub-start' primero.$(N)"; \
		exit 1; \
	fi
	@echo "$(C)Mostrando logs de sync-hub ($(SYNC_HUB_LOG_FILE))... Ctrl+C para salir.$(N)"
	@tail -f "$(SYNC_HUB_LOG_FILE)"

sync-hub-stop:
	@{ \
		PORT=$$(awk -F= '/^SYNC_PORT=/{print $$2}' $(SYNC_HUB_DIR)/.env 2>/dev/null | tail -1); \
		[ -z "$$PORT" ] && PORT=8787; \
		if [ ! -f "$(SYNC_HUB_PID_FILE)" ]; then \
			echo "$(Y)No hay PID file. Intentando detener por patrón...$(N)"; \
			pkill -f "sync-hub/src/index.js" 2>/dev/null || true; \
			PID_BY_PORT=$$(lsof -ti:$$PORT 2>/dev/null | head -1); \
			[ -n "$$PID_BY_PORT" ] && kill $$PID_BY_PORT 2>/dev/null || true; \
			echo "$(G)Listo.$(N)"; \
		else \
			PID=$$(cat "$(SYNC_HUB_PID_FILE)"); \
			if kill -0 $$PID 2>/dev/null; then \
				echo "$(Y)Deteniendo sync-hub (PID $$PID)...$(N)"; \
				kill $$PID; \
				sleep 1; \
				if kill -0 $$PID 2>/dev/null; then kill -9 $$PID 2>/dev/null || true; fi; \
				echo "$(G)sync-hub detenido.$(N)"; \
			else \
				echo "$(Y)PID $$PID no está corriendo.$(N)"; \
				echo "$(Y)Intentando detener por patrón...$(N)"; \
				pkill -f "sync-hub/src/index.js" 2>/dev/null || true; \
				PID_BY_PORT=$$(lsof -ti:$$PORT 2>/dev/null | head -1); \
				[ -n "$$PID_BY_PORT" ] && kill $$PID_BY_PORT 2>/dev/null || true; \
			fi; \
			rm -f "$(SYNC_HUB_PID_FILE)"; \
		fi; \
	}

# === MANTENIMIENTO ===

install:
	@echo "$(C)Instalando dependencias npm...$(N)"
	@npm install
	@echo "$(C)Resolviendo Swift packages...$(N)"
	@cd swift-app && swift package resolve
	@echo "$(G)Dependencias instaladas.$(N)"

clean: clean-front clean-swift
	@rm -rf build/
	@echo "$(G)Limpieza completa.$(N)"

clean-front:
	@echo "$(Y)Limpiando frontend...$(N)"
	@rm -rf dist node_modules/.vite

clean-swift:
	@echo "$(Y)Limpiando Swift...$(N)"
	@cd swift-app && swift package clean

kill:
	@echo "$(Y)Matando procesos...$(N)"
	@-pkill -f ".build/debug/FreeCastNotes" 2>/dev/null
	@-pkill -f ".build/release/FreeCastNotes" 2>/dev/null
	@-lsof -ti:1420 | xargs kill -9 2>/dev/null
	@echo "$(G)Procesos terminados.$(N)"

open:
	@open build/FreeCastNotes.app 2>/dev/null || \
	 echo "$(R)No se encontró FreeCastNotes.app. Ejecutá 'make bundle' primero.$(N)"

# === RELEASE ===

release-update: dmg
	@echo "$(G)Actualizando release en GitHub...$(N)"
	@if [ ! -f build/FreeCastNotes.dmg ]; then \
		echo "$(R)Error: build/FreeCastNotes.dmg no existe. Ejecutá 'make dmg' primero.$(N)"; \
		exit 1; \
	fi
	@VERSION=$$(grep -A1 "CFBundleShortVersionString" swift-app/Info.plist | tail -1 | sed 's/.*<string>\(.*\)<\/string>/\1/'); \
	echo "$(C)Versión actual: $$VERSION$(N)"; \
	echo "$(C)Subiendo DMG al release v$$VERSION...$(N)"; \
	gh release upload v$$VERSION build/FreeCastNotes.dmg --clobber || \
		(echo "$(R)Error: No se pudo subir el DMG. Verificá que el release v$$VERSION exista.$(N)" && exit 1); \
	echo "$(G)✓ Release v$$VERSION actualizado$(N)"

release-new:
	@if [ -z "$(VERSION)" ]; then \
		echo "$(R)Error: Especificá la versión con VERSION=x.y.z$(N)"; \
		echo "$(Y)Ejemplo: make release-new VERSION=1.2.0$(N)"; \
		exit 1; \
	fi
	@echo "$(G)Creando nuevo release v$(VERSION)...$(N)"
	@echo "$(C)1. Actualizando Info.plist...$(N)"
	@./src/scripts/update-version.sh $(VERSION)
	@echo "$(C)2. Construyendo DMG...$(N)"
	@$(MAKE) dmg
	@echo "$(C)3. Creando tag v$(VERSION)...$(N)"
	@git add swift-app/Info.plist
	@git commit -m "Bump version to $(VERSION)" || true
	@git tag -f v$(VERSION) 2>/dev/null || git tag v$(VERSION)
	@echo "$(C)4. Pusheando cambios y tag...$(N)"
	@git push origin main
	@git push origin v$(VERSION) 2>/dev/null || git push origin v$(VERSION) --force
	@echo "$(C)5. Creando release en GitHub...$(N)"
	@gh release create v$(VERSION) build/FreeCastNotes.dmg \
		--title "v$(VERSION)" \
		--notes "Release v$(VERSION)" 2>/dev/null || \
		(echo "$(Y)El release ya existe, actualizando...$(N)" && \
		 gh release upload v$(VERSION) build/FreeCastNotes.dmg --clobber)
	@echo "$(G)✓ Release v$(VERSION) creado y publicado$(N)"
