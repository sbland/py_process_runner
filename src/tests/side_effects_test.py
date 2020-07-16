from src.ProcessRunnerCls import ProcessRunner
from unittest.mock import MagicMock, Mock, patch
import pytest
from dataclasses import dataclass, field
from vendor.helpers.list_helpers import flatten_list

from ..ProcessRunner import Process, I


def process_add(x, y):
    return x + y


@dataclass
class Mock_Nested_State:
    na: int = 7
    nab: int = 7


@dataclass
class Mock_Model_State_Shape:
    a: float
    b: float
    c: float = 0
    d: float = 0
    target: str = "a"
    lst: list = None
    nested: Mock_Nested_State = Mock_Nested_State()


@dataclass
class Mock_Config_Shape:
    foo: int = 1
    bar: int = 3
    roo: dict = field(default_factory=lambda: {
        'abc': 5
    })
    arr: list = field(default_factory=lambda: [1, 2, 3])


@dataclass
class Mock_Parameters_Shape:
    foo: int = 1
    bar: int = 3
    roo: dict = field(default_factory=lambda: {
        'abc': 5
    })
    arr: list = field(default_factory=lambda: [1, 2, 3])


@dataclass
class Mock_External_State_Shape:
    data_a: int = 1
    data_b: int = 5


process_runner = ProcessRunner(
    Mock_Config_Shape(), Mock_External_State_Shape(), Mock_Parameters_Shape())


@pytest.fixture(scope="module", autouse=True)
def _():
    with patch('src.ProcessRunner.Model_State_Shape', side_effect=Mock_Model_State_Shape) \
            as Mocked_State_Shape:
        Mocked_State_Shape.__annotations__ = Mock_Model_State_Shape.__annotations__
        yield Mocked_State_Shape


@pytest.fixture(scope="module", autouse=True)
def __():
    with patch('src.ProcessRunner.Config_Shape', return_value=Mock_Config_Shape) as _fixture:
        yield _fixture


@pytest.fixture(scope="module", autouse=True)
def ____():
    with patch('src.ProcessRunner.Parameters_Shape', return_value=Mock_Parameters_Shape) \
            as _fixture:
        yield _fixture


@pytest.fixture(scope="module", autouse=True)
def ______():
    with patch('src.ProcessRunner.External_State_Shape', return_value=Mock_External_State_Shape) \
            as _fixture:
        yield _fixture


def test_print():
    state = Mock_Model_State_Shape(a=2.1, b=4.1)
    fn = MagicMock()
    processes = flatten_list([
        Process(
            func=fn,
            args=['hello'],
        ),
    ])
    run_processes = process_runner.initialize_processes(processes)
    state_2 = run_processes(initial_state=state)
    fn.assert_called_with('hello')
    assert state_2.a == 2.1
    assert state_2.b == 4.1
