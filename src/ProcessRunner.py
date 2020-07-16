"""This is a process runner that creates an interface process and runner function
It allows connecting plugin functions to config, state and external data and
converts them into a process
The process runner is then passed a list of processes that it runs in order
updating the state at each step
"""
from dataclasses import is_dataclass
from typing import NamedTuple, List, Callable
from functools import reduce, partial
from vendor.helpers.dictionary_helpers import get_nested_arg_from_dict

import numpy as np

from vendor.helpers.comparisons import isNamedTuple
from vendor.helpers.named_tuple_helpers import _replace_recursive, get_val_from_tuple

from .config import Config_Shape
from .parameters import Parameters_Shape
from .external_state import External_State_Shape
from .internal_state import Model_State_Shape


class I(NamedTuple):  # noqa: E742
    """interface Named Tuple"""
    from_: str
    as_: str = None


class Process(NamedTuple):
    """Process object that stores the function and input and output targets."""
    func: Callable[[Model_State_Shape], Model_State_Shape]  # The function to call
    gate: bool = True  # if False process is skipped
    comment: str = ""  # used for logging
    # Inputs to function
    config_inputs: List[I] = []
    parameters_inputs: List[I] = []
    external_state_inputs: List[I] = []
    additional_inputs: List[tuple] = []
    state_inputs: List[I] = []
    state_outputs: List[I] = []
    args: List[any] = []  # additional args


def format_with_variables(
        config: Config_Shape,
        state: Model_State_Shape,
        external_state: External_State_Shape,
        parameters: Parameters_Shape,
        additional_inputs: dict,
        string: str) -> str:
    """formats from and to string literals to replace variables
    Works the same as python string literals
    https://docs.python.org/3.6/reference/lexical_analysis.html#f-strings

    f = partial(format_with_variables, config, state, {'name': 'john' })
    e.g. f('hello {name}') == 'hello john'
    """
    return string.format(**{
        # Note additional inputs are expanded to allow easy access
        **additional_inputs,
        'config': config,
        'e_state': external_state,
        'external_state': external_state,
        'parameters': parameters,
        'state': state,
    })


def get_result(result, k):
    """Helper func that gets the result from process output
    This allows us to work with different outputs

    if k == '_list' then we return the full list
    """
    # TODO: Make clearer that we are getting the actual result value if result is a str, int or
    # float
    # TODO: Better error reporting when key not valid etc
    if k == '_result':
        return result
    result_val = result
    result_val = result[k] if isinstance(result, dict) else result_val
    result_val = result[int(k)] if isinstance(result, list) and k != '_list' else result_val
    result_val = result if isinstance(result, list) and k == '_list' else result_val
    result_val = result[int(k)] if isinstance(result, np.ndarray) and k != '_list' else result_val
    result_val = result if isinstance(result, np.ndarray) and k == '_list' else result_val
    result_val = getattr(result, k) if is_dataclass(result) else result_val
    result_val = result._asdict()[k] if isNamedTuple(result) else result_val
    return result_val


def get_key_values(
        f: Callable, get_val: Callable, input_keys: List[I]) -> List[tuple]:  # noqa: E741
    """gets the key value pairs from named tuples using the input keys from and keys as"""
    from_keys = [f(key.from_) for key in input_keys]
    as_keys = [f(key.as_) if key.as_ else None for key in input_keys]
    input_values = [get_val(key) for key in from_keys]
    key_values_pairs = [(k, v) for k, v in zip(as_keys, input_values) if k is not None]
    args = [v for k, v in zip(as_keys, input_values) if k is None]
    return key_values_pairs, args


def get_process_inputs(
    process: Process,
    # sources
    prev_state: NamedTuple,
    config: Config_Shape,
    parameters: Parameters_Shape,
    external_state: External_State_Shape,
) -> dict:
    """Get inputs from sources based on process input lists"""
    # get inputs from process
    config_inputs: List[I] = process.config_inputs
    parameters_inputs: List[I] = process.parameters_inputs
    state_inputs: List[I] = process.state_inputs
    e_state_inputs: List[I] = process.external_state_inputs
    additional_inputs = process.additional_inputs
    # create function that formats the key.as_ and key.from_
    f = partial(
        format_with_variables,
        config, prev_state, external_state, parameters, dict(additional_inputs))

    # helper functions that help getting values
    get_config_val_fn = partial(get_nested_arg_from_dict, config)
    get_parameters_val_fn = partial(get_nested_arg_from_dict, parameters)
    get_state_val_fn = partial(get_nested_arg_from_dict, prev_state)
    get_e_state_val_fn = partial(get_nested_arg_from_dict, external_state)

    # get key value inputs to pass to function
    key_values_config, args_config = get_key_values(f, get_config_val_fn, config_inputs)
    key_values_parameters, args_parameters = get_key_values(
        f, get_parameters_val_fn, parameters_inputs)
    key_values_state, args_state = get_key_values(f, get_state_val_fn, state_inputs)
    key_values_e_state, args_e_state = get_key_values(f, get_e_state_val_fn, e_state_inputs)
    additional_inputs = process.additional_inputs
    # Merge inputs into a single dictionary that represents the kwargs of the process func
    kwrds = dict(
        key_values_e_state
        + key_values_config  # noqa: W503
        + key_values_parameters
        + key_values_state  # noqa: W503
        + additional_inputs)  # noqa: W503

    args = args_config + args_parameters + args_state + args_e_state
    return kwrds, args


class Run_Process_Error(Exception):
    def __init__(self, process: Process, error: Exception, state):
        self.message = f'Failed to run {process.comment or process.func.__name__}'
        self.error = error
        self.state = state

    def __str__(self):
        state_str = str(self.state)
        state_print = state_str[0:100] + '...' + \
            state_str[:-100] if len(state_str) > 200 else state_str
        return f"""
        !! {self.message} !! \n
        !! {str(self.error)}
         state:
         \n{state_print}
        """


def run_process(
        prev_state: NamedTuple,  # Can be state or parameter
        process: Process,
        config: Config_Shape,
        parameters: Parameters_Shape,
        external_state: External_State_Shape) -> NamedTuple:
    """ Run a single process and output the updated state.
        The process object contains the function along with all the input
        and output targets.
    """
    if not process.gate:
        return prev_state
    try:
        kwrds, args = get_process_inputs(
            process,
            prev_state,
            config,
            parameters,
            external_state,
        )

        args_ = process.args + args

        # RUN PROCESS
        result = process.func(*args_, **kwrds)

        # CREATE NEW STATE
        output_map = process.state_outputs

        # iterate over output map and replace all values in state
        def update_state(prev_state, out):
            result_val = get_result(result, out.from_)
            return _replace_recursive(prev_state, out.as_, result_val)
        new_state = reduce(update_state, output_map, prev_state)
        return new_state

    except Exception as e:
        raise Run_Process_Error(process, e, prev_state) from e


# Define the process runner
# def run_processes(
#         processes: List[Process] = None,
#         initial_state: NamedTuple = None,  # initial state or parameters
# ) -> NamedTuple:
#     """ Takes the initial state and a list of processes
#     returns the new state as modified by the processes

#     new state is the state after we have run all the processes
#     the reduce function allows us to iterate through each function
#     passing the state to the next
#     """
#     new_state = reduce(run_process, processes, initial_state)
#     return new_state


# def initialize_processes(
#         processes: List[Process]
# ) -> Callable[[NamedTuple], NamedTuple]:
#     """HOC component to assign processes to the run_processes function
#     which can then be ran later with the state"""
#     return partial(run_processes, processes)
