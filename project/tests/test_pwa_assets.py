"""Las referencias PWA deben resolverse desde el backend en producción."""

from fastapi.testclient import TestClient

from app.main import app


def test_pwa_icon_assets_are_served():
    client = TestClient(app)

    apple_icon = client.get("/apple-touch-icon.png")
    favicon = client.get("/sgr-icon.svg")

    assert apple_icon.status_code == 200
    assert apple_icon.headers["content-type"] == "image/png"
    assert len(apple_icon.content) > 0
    assert favicon.status_code == 200
    assert favicon.headers["content-type"] == "image/svg+xml"
    assert b"<svg" in favicon.content
