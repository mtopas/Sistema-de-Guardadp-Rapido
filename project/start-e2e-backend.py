#!/usr/bin/env python
"""
Levanta el backend de SGR en sandbox para tests E2E.
- Crea DB, vault, y directories temporales
- Levanta uvicorn en puerto configurable (default 8765)
- Espera a que esté listo antes de devolver control

Uso:
    python start-e2e-backend.py [--port 8765] [--keep-data]

--port: Puerto en el que correr uvicorn (default 8765)
--keep-data: No borrar DB/vault al salir (útil para debugging)

Environment:
    TEST_API_URL: URL del backend (imprime al salir)
    TEST_VAULT_ROOT: Ruta del vault temporal (imprime al salir)
"""

import os
import sys
import tempfile
import subprocess
import time
import requests
from pathlib import Path

def wait_for_api(url, timeout=10):
    """Esperar a que la API esté lista."""
    start = time.time()
    while time.time() - start < timeout:
        try:
            res = requests.get(f"{url}/hojas/", timeout=1)
            if res.status_code in (200, 401, 403):  # Cualquier respuesta es OK
                return True
        except Exception:
            pass
        time.sleep(0.5)
    raise TimeoutError(f"API no respondió en {timeout}s en {url}")

def main():
    import argparse
    parser = argparse.ArgumentParser(description='Levanta backend E2E en sandbox')
    parser.add_argument('--port', type=int, default=8765, help='Puerto para uvicorn')
    parser.add_argument('--keep-data', action='store_true', help='No borrar datos al salir')
    args = parser.parse_args()

    # Crear directorios temporales
    tmpdir = tempfile.mkdtemp(prefix='sgr-e2e-')
    db_path = os.path.join(tmpdir, 'app.db')
    vault_root = os.path.join(tmpdir, 'vault')
    jarvis_db_path = os.path.join(tmpdir, 'jarvis.db')

    os.makedirs(vault_root, exist_ok=True)

    # Crear estructura PARA requerida por vault guard
    para_dirs = [
        '00 - Sin categorizar',
        '01 - Proyectos',
        '02 - Areas',
        '03 - Recursos',
        '04 - Archivo',
        '05 - Basura',
    ]
    for d in para_dirs:
        os.makedirs(os.path.join(vault_root, d), exist_ok=True)

    # Env vars para el backend
    env = os.environ.copy()
    env['DB_PATH'] = db_path
    env['VAULT_ROOT'] = vault_root
    env['JARVIS_DB_PATH'] = jarvis_db_path
    env['SGR_PORT'] = str(args.port)

    api_url = f'http://127.0.0.1:{args.port}'

    print(f'[E2E Backend Setup]')
    print(f'  Temp dir: {tmpdir}')
    print(f'  DB: {db_path}')
    print(f'  Vault: {vault_root}')
    print(f'  Port: {args.port}')
    print(f'  API URL: {api_url}')
    print()

    try:
        # Levantar uvicorn
        print(f'Levantando uvicorn en {api_url}...')
        proc = subprocess.Popen(
            [sys.executable, '-m', 'uvicorn', 'app.main:app', '--reload', f'--port={args.port}'],
            env=env,
            cwd=os.path.dirname(__file__),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )

        # Leer logs mientras se levanta
        import threading
        def read_logs():
            try:
                for line in iter(proc.stdout.readline, ''):
                    if line:
                        print(f'[uvicorn] {line.rstrip()}')
            except:
                pass

        log_thread = threading.Thread(target=read_logs, daemon=True)
        log_thread.start()

        # Esperar a que esté listo
        print(f'Esperando a que API esté lista...')
        wait_for_api(api_url, timeout=15)
        print(f'✓ API lista en {api_url}')
        print()
        print(f'Export estas variables en tu sesión de tests:')
        print(f'  export TEST_API_URL={api_url}')
        print(f'  export TEST_VAULT_ROOT={vault_root}')
        print()
        print(f'Para ejecutar tests:')
        print(f'  cd project/frontend')
        print(f'  npx playwright test')
        print()
        print(f'(Presiona Ctrl+C para detener)')

        # Mantener el proceso vivo
        proc.wait()

    except KeyboardInterrupt:
        print(f'\nDeteniendo...')
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except:
            proc.kill()
    except Exception as e:
        print(f'Error: {e}', file=sys.stderr)
        if proc.poll() is None:
            proc.kill()
        sys.exit(1)
    finally:
        if not args.keep_data:
            import shutil
            print(f'Limpiando {tmpdir}...')
            shutil.rmtree(tmpdir, ignore_errors=True)

if __name__ == '__main__':
    main()
