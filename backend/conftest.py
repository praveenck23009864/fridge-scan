"""All tests use disposable databases, including imports that initialize tables."""
import os
import tempfile

_test_database = tempfile.TemporaryDirectory(prefix='fridge-scan-tests-')
os.environ['DATABASE_URL'] = 'sqlite:///' + _test_database.name.replace('\\', '/') + '/session.db'

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import main
from database import get_db, initialize_database


@pytest.fixture
def database_url(tmp_path):
    return 'sqlite:///' + (tmp_path / 'review.db').as_posix()


@pytest.fixture
def test_engine(database_url):
    engine = create_engine(database_url, connect_args={'check_same_thread': False})
    initialize_database(engine)
    yield engine
    engine.dispose()


@pytest.fixture
def client(test_engine):
    sessions = sessionmaker(bind=test_engine)
    def test_db():
        with sessions() as session:
            yield session
    main.app.dependency_overrides[get_db] = test_db
    with TestClient(main.app) as test_client:
        yield test_client
    main.app.dependency_overrides.pop(get_db, None)


def pytest_sessionfinish(session, exitstatus):
    from database import engine
    engine.dispose()
    _test_database.cleanup()
