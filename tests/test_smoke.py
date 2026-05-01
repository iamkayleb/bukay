from version import VERSION


def test_version_is_string() -> None:
    assert isinstance(VERSION, str)


def test_version_format() -> None:
    parts = VERSION.split(".")
    assert len(parts) == 3
    assert all(p.isdigit() for p in parts)
