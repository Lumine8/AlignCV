from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_returns_capabilities() -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["version"]
    capabilities = body["capabilities"]
    assert isinstance(capabilities["latex_compilation_available"], bool)
    assert capabilities["semantic_backend"]


def test_root_health_alias_matches_api_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == client.get("/api/health").json()


def test_cors_allows_configured_origin() -> None:
    response = client.options(
        "/api/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code in (200, 204)
    assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_cors_rejects_unknown_origin() -> None:
    response = client.options(
        "/api/health",
        headers={
            "Origin": "https://evil.example",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.headers.get("access-control-allow-origin") is None


def test_unknown_route_returns_404() -> None:
    assert client.get("/api/does-not-exist").status_code == 404
