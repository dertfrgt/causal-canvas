from .models import Node, Edge
import math
import sys
sys.setrecursionlimit(10000)

def safe_eval(expr, x):
    allowed_names = {k: getattr(math, k) for k in dir(math) if not k.startswith('_')}
    allowed_names['x'] = x
    code = compile(expr, "<string>", "eval")
    for name in code.co_names:
        if name not in allowed_names:
            raise NameError(f"Запрещённое имя: {name}")
    return eval(code, {"__builtins__": {}}, allowed_names)


def compute_signal(node, current_values):
    val = current_values.get(node.id, node.value)
    t = node.transform_type
    if t == 'linear':
        return val
    elif t == 'quadratic':
        return val ** 2
    elif t == 'logarithmic':
        return math.log(val + 1) if val >= 0 else 0
    elif t == 'sinusoidal':
        return math.sin(val)
    elif t == 'custom' and node.transform_formula:
        try:
            return safe_eval(node.transform_formula, val)
        except Exception as e:
            print(f"Ошибка в формуле '{node.transform_formula}': {e}")
            return val
    return val


def cascade_update(changed_node_id, new_value):
    """
    Запускает каскадное обновление от changed_node_id.
    Возвращает:
      - changes: {node_id: новое_значение}
      - origins: {node_id: [source_id1, source_id2, ...]}
    """
    # Загружаем все узлы
    nodes = Node.objects.all()
    # Создаём словарь текущих значений
    current_values = {node.id: node.value for node in nodes}
    
    # Устанавливаем новое значение для источника
    current_values[changed_node_id] = new_value
    
    # Обнуляем значения всех остальных узлов (они будут пересчитаны)
    for node in nodes:
        if node.id != changed_node_id:
            current_values[node.id] = 0.0
    
    changes = {changed_node_id: new_value}
    origins = {changed_node_id: []}
    
    # Очередь для BFS (распространение по исходящим рёбрам)
    queue = [changed_node_id]
    visited = set([changed_node_id])
    
    while queue:
        node_id = queue.pop(0)
        node = Node.objects.get(id=node_id)
        # Вычисляем сигнал, который этот узел отправляет дальше
        signal = compute_signal(node, current_values)
        
        for edge in node.outgoing_edges.all():
            target = edge.target
            if target.id in visited:
                continue  # не возвращаемся
            # Добавляем вклад
            current_values[target.id] += signal * edge.weight
            # Запоминаем изменение и источник
            changes[target.id] = current_values[target.id]
            if target.id not in origins:
                origins[target.id] = []
            origins[target.id].append(node_id)
            # Помечаем как посещённый и добавляем в очередь
            visited.add(target.id)
            queue.append(target.id)
    
    # Сохраняем обновлённые значения в БД
    for node_id, val in current_values.items():
        node = Node.objects.get(id=node_id)
        node.value = val
        node.save()
    
    return changes, origins