from typing import TypeVar

T = TypeVar('T')

def class_dict_mapper(object: T) -> dict:
    """
    Takes all class attributes and returns them as a dictionary.
    
    Args:
        object (Class): A Class object.
    
    Returns:
        dictionary (dict)
    """
    class_attrs = object.__dict__.items

    output_dict = {}
    for k, v in class_attrs:
        output_dict[k] = v
    
    return output_dict
